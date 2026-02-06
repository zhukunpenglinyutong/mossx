import { useCallback } from "react";
import type { Dispatch, MutableRefObject } from "react";
import { interruptTurn as interruptTurnService } from "../../../services/tauri";
import { getThreadTimestamp } from "../../../utils/threadItems";
import {
  asString,
  normalizePlanUpdate,
  normalizeRateLimits,
  normalizeTokenUsage,
} from "../utils/threadNormalize";
import type { ThreadAction } from "./useThreadsReducer";

/**
 * Infer engine type from thread ID.
 * Claude threads start with "claude:" or "claude-pending-".
 */
function inferEngineFromThreadId(threadId: string): "claude" | "codex" {
  if (threadId.startsWith("claude:") || threadId.startsWith("claude-pending-")) {
    return "claude";
  }
  return "codex";
}

type UseThreadTurnEventsOptions = {
  dispatch: Dispatch<ThreadAction>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  safeMessageActivity: () => void;
  recordThreadActivity: (workspaceId: string, threadId: string, timestamp?: number) => void;
  renameCustomNameKey: (
    workspaceId: string,
    oldThreadId: string,
    newThreadId: string,
  ) => void;
  renameAutoTitlePendingKey: (
    workspaceId: string,
    oldThreadId: string,
    newThreadId: string,
  ) => void;
  renameThreadTitleMapping: (
    workspaceId: string,
    oldThreadId: string,
    newThreadId: string,
  ) => Promise<void>;
};

export function useThreadTurnEvents({
  dispatch,
  getCustomName,
  isThreadHidden,
  markProcessing,
  markReviewing,
  setActiveTurnId,
  pendingInterruptsRef,
  pushThreadErrorMessage,
  safeMessageActivity,
  recordThreadActivity,
  renameCustomNameKey,
  renameAutoTitlePendingKey,
  renameThreadTitleMapping,
}: UseThreadTurnEventsOptions) {
  const onThreadStarted = useCallback(
    (workspaceId: string, thread: Record<string, unknown>) => {
      const threadId = asString(thread.id);
      if (!threadId) {
        return;
      }
      if (isThreadHidden(workspaceId, threadId)) {
        return;
      }
      dispatch({ type: "ensureThread", workspaceId, threadId, engine: inferEngineFromThreadId(threadId) });
      const timestamp = getThreadTimestamp(thread);
      const activityTimestamp = timestamp > 0 ? timestamp : Date.now();
      recordThreadActivity(workspaceId, threadId, activityTimestamp);
      dispatch({
        type: "setThreadTimestamp",
        workspaceId,
        threadId,
        timestamp: activityTimestamp,
      });

      const customName = getCustomName(workspaceId, threadId);
      if (!customName) {
        const preview = asString(thread.preview).trim();
        if (preview) {
          const name = preview.length > 38 ? `${preview.slice(0, 38)}…` : preview;
          dispatch({ type: "setThreadName", workspaceId, threadId, name });
        }
      }
      safeMessageActivity();
    },
    [dispatch, getCustomName, isThreadHidden, recordThreadActivity, safeMessageActivity],
  );

  const onTurnStarted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      dispatch({
        type: "ensureThread",
        workspaceId,
        threadId,
        engine: inferEngineFromThreadId(threadId),
      });
      if (pendingInterruptsRef.current.has(threadId)) {
        pendingInterruptsRef.current.delete(threadId);
        if (turnId) {
          void interruptTurnService(workspaceId, threadId, turnId).catch(() => {});
        }
        return;
      }
      markProcessing(threadId, true);
      if (turnId) {
        setActiveTurnId(threadId, turnId);
      }
    },
    [dispatch, markProcessing, pendingInterruptsRef, setActiveTurnId],
  );

  const onTurnCompleted = useCallback(
    (_workspaceId: string, threadId: string, _turnId: string) => {
      dispatch({
        type: "finalizePendingToolStatuses",
        threadId,
        status: "completed",
      });
      markProcessing(threadId, false);
      setActiveTurnId(threadId, null);
      pendingInterruptsRef.current.delete(threadId);
      // 重置分段计数，为下一个 turn 做准备
      dispatch({ type: "resetAgentSegment", threadId });
    },
    [dispatch, markProcessing, pendingInterruptsRef, setActiveTurnId],
  );

  const onTurnPlanUpdated = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      payload: { explanation: unknown; plan: unknown },
    ) => {
      dispatch({ type: "ensureThread", workspaceId, threadId, engine: inferEngineFromThreadId(threadId) });
      const normalized = normalizePlanUpdate(
        turnId,
        payload.explanation,
        payload.plan,
      );
      dispatch({ type: "setThreadPlan", threadId, plan: normalized });
    },
    [dispatch],
  );

  const onThreadTokenUsageUpdated = useCallback(
    (workspaceId: string, threadId: string, tokenUsage: Record<string, unknown>) => {
      dispatch({ type: "ensureThread", workspaceId, threadId, engine: inferEngineFromThreadId(threadId) });
      dispatch({
        type: "setThreadTokenUsage",
        threadId,
        tokenUsage: normalizeTokenUsage(tokenUsage),
      });
    },
    [dispatch],
  );

  const onAccountRateLimitsUpdated = useCallback(
    (workspaceId: string, rateLimits: Record<string, unknown>) => {
      dispatch({
        type: "setRateLimits",
        workspaceId,
        rateLimits: normalizeRateLimits(rateLimits),
      });
    },
    [dispatch],
  );

  const onTurnError = useCallback(
    (
      workspaceId: string,
      threadId: string,
      _turnId: string,
      payload: { message: string; willRetry: boolean },
    ) => {
      if (payload.willRetry) {
        return;
      }
      dispatch({ type: "ensureThread", workspaceId, threadId, engine: inferEngineFromThreadId(threadId) });
      dispatch({
        type: "finalizePendingToolStatuses",
        threadId,
        status: "failed",
      });
      markProcessing(threadId, false);
      markReviewing(threadId, false);
      setActiveTurnId(threadId, null);
      const message = payload.message
        ? `Turn failed: ${payload.message}`
        : "Turn failed.";
      pushThreadErrorMessage(threadId, message);
      safeMessageActivity();
    },
    [
      dispatch,
      markProcessing,
      markReviewing,
      pushThreadErrorMessage,
      safeMessageActivity,
      setActiveTurnId,
    ],
  );

  const onContextCompacted = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      dispatch({ type: "ensureThread", workspaceId, threadId, engine: inferEngineFromThreadId(threadId) });
      if (!turnId) {
        return;
      }
      dispatch({ type: "appendContextCompacted", threadId, turnId });
      const timestamp = Date.now();
      recordThreadActivity(workspaceId, threadId, timestamp);
      safeMessageActivity();
    },
    [dispatch, recordThreadActivity, safeMessageActivity],
  );

  const onThreadSessionIdUpdated = useCallback(
    (workspaceId: string, threadId: string, sessionId: string) => {
      // Only update if the current thread is a pending Claude thread
      if (!threadId.startsWith("claude-pending-")) {
        return;
      }

      // Create the new thread ID with the real session ID
      const newThreadId = `claude:${sessionId}`;

      // Rename the thread from claude-pending-* to claude:{sessionId}
      dispatch({
        type: "renameThreadId",
        workspaceId,
        oldThreadId: threadId,
        newThreadId,
      });
      renameCustomNameKey(workspaceId, threadId, newThreadId);
      renameAutoTitlePendingKey(workspaceId, threadId, newThreadId);
      void renameThreadTitleMapping(workspaceId, threadId, newThreadId);
    },
    [
      dispatch,
      renameAutoTitlePendingKey,
      renameCustomNameKey,
      renameThreadTitleMapping,
    ],
  );

  return {
    onThreadStarted,
    onTurnStarted,
    onTurnCompleted,
    onTurnPlanUpdated,
    onThreadTokenUsageUpdated,
    onAccountRateLimitsUpdated,
    onTurnError,
    onContextCompacted,
    onThreadSessionIdUpdated,
  };
}
