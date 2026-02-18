import { useCallback } from "react";
import type { Dispatch, MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
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
 * Claude/OpenCode threads use "<engine>:" or "<engine>-pending-" prefixes.
 */
function inferEngineFromThreadId(threadId: string): "claude" | "codex" | "opencode" {
  if (threadId.startsWith("claude:") || threadId.startsWith("claude-pending-")) {
    return "claude";
  }
  if (threadId.startsWith("opencode:") || threadId.startsWith("opencode-pending-")) {
    return "opencode";
  }
  return "codex";
}

type UseThreadTurnEventsOptions = {
  dispatch: Dispatch<ThreadAction>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  isAutoTitlePending: (workspaceId: string, threadId: string) => boolean;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
  interruptedThreadsRef: MutableRefObject<Set<string>>;
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
  resolvePendingThreadForSession?: (
    workspaceId: string,
    engine: "claude" | "opencode",
  ) => string | null;
};

export function useThreadTurnEvents({
  dispatch,
  getCustomName,
  isAutoTitlePending,
  isThreadHidden,
  markProcessing,
  markReviewing,
  setActiveTurnId,
  pendingInterruptsRef,
  interruptedThreadsRef,
  pushThreadErrorMessage,
  safeMessageActivity,
  recordThreadActivity,
  renameCustomNameKey,
  renameAutoTitlePendingKey,
  renameThreadTitleMapping,
  resolvePendingThreadForSession,
}: UseThreadTurnEventsOptions) {
  const { t } = useTranslation();
  const resolvePendingAliasThread = useCallback(
    (
      workspaceId: string,
      threadId: string,
    ): string | null => {
      const engine = threadId.startsWith("opencode:")
        ? "opencode"
        : threadId.startsWith("claude:")
          ? "claude"
          : null;
      if (!engine) {
        return null;
      }
      const pending = resolvePendingThreadForSession?.(workspaceId, engine) ?? null;
      if (!pending || pending === threadId) {
        return null;
      }
      return pending;
    },
    [resolvePendingThreadForSession],
  );

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
      if (!customName && !isAutoTitlePending(workspaceId, threadId)) {
        const preview = asString(thread.preview).trim();
        if (preview) {
          const name = preview;
          dispatch({ type: "setThreadName", workspaceId, threadId, name });
        }
      }
      safeMessageActivity();
    },
    [dispatch, getCustomName, isAutoTitlePending, isThreadHidden, recordThreadActivity, safeMessageActivity],
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
    (workspaceId: string, threadId: string, _turnId: string) => {
      const aliasThreadId = resolvePendingAliasThread(workspaceId, threadId);
      const targetThreadIds = aliasThreadId
        ? [threadId, aliasThreadId]
        : [threadId];
      targetThreadIds.forEach((targetThreadId) => {
        dispatch({
          type: "finalizePendingToolStatuses",
          threadId: targetThreadId,
          status: "completed",
        });
        markProcessing(targetThreadId, false);
        setActiveTurnId(targetThreadId, null);
        pendingInterruptsRef.current.delete(targetThreadId);
        interruptedThreadsRef.current.delete(targetThreadId);
        // 重置分段计数，为下一个 turn 做准备
        dispatch({ type: "resetAgentSegment", threadId: targetThreadId });
      });
    },
    [
      dispatch,
      interruptedThreadsRef,
      markProcessing,
      pendingInterruptsRef,
      resolvePendingAliasThread,
      setActiveTurnId,
    ],
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

      // If this thread was interrupted by user, the error is expected
      // (e.g. "Session stopped."). Clean up the interrupted flag and
      // suppress the redundant error message since interruptTurn already
      // displayed "Session stopped." to the user.
      const wasInterrupted = interruptedThreadsRef.current.has(threadId);
      interruptedThreadsRef.current.delete(threadId);

      dispatch({ type: "ensureThread", workspaceId, threadId, engine: inferEngineFromThreadId(threadId) });
      dispatch({
        type: "finalizePendingToolStatuses",
        threadId,
        status: "failed",
      });
      markProcessing(threadId, false);
      markReviewing(threadId, false);
      setActiveTurnId(threadId, null);
      const aliasThreadId = resolvePendingAliasThread(workspaceId, threadId);
      if (aliasThreadId) {
        dispatch({
          type: "finalizePendingToolStatuses",
          threadId: aliasThreadId,
          status: "failed",
        });
        markProcessing(aliasThreadId, false);
        markReviewing(aliasThreadId, false);
        setActiveTurnId(aliasThreadId, null);
        pendingInterruptsRef.current.delete(aliasThreadId);
        interruptedThreadsRef.current.delete(aliasThreadId);
      }

      if (!wasInterrupted) {
        const message = payload.message
          ? t("threads.turnFailedWithMessage", { message: payload.message })
          : t("threads.turnFailed");
        pushThreadErrorMessage(threadId, message);
      }
      safeMessageActivity();
    },
    [
      dispatch,
      interruptedThreadsRef,
      markProcessing,
      markReviewing,
      pendingInterruptsRef,
      pushThreadErrorMessage,
      resolvePendingAliasThread,
      safeMessageActivity,
      setActiveTurnId,
      t,
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
    (
      workspaceId: string,
      threadId: string,
      sessionId: string,
      engineHint?: "claude" | "opencode" | "codex" | "gemini" | null,
    ) => {
      const explicitEnginePrefix = threadId.startsWith("claude:")
        || threadId.startsWith("claude-pending-")
        ? "claude"
        : threadId.startsWith("opencode:")
          || threadId.startsWith("opencode-pending-")
          ? "opencode"
          : null;
      const hintedEngine =
        engineHint === "claude" || engineHint === "opencode"
          ? engineHint
          : null;
      const pendingOpenCode = resolvePendingThreadForSession?.(workspaceId, "opencode") ?? null;
      const pendingClaude = resolvePendingThreadForSession?.(workspaceId, "claude") ?? null;

      const enginePrefix =
        explicitEnginePrefix
        ?? hintedEngine
        ?? (pendingOpenCode && !pendingClaude
          ? "opencode"
          : pendingClaude && !pendingOpenCode
            ? "claude"
            : null);
      if (!enginePrefix) {
        return;
      }

      const newThreadId = `${enginePrefix}:${sessionId}`;
      const sourceThreadId = threadId.startsWith(`${enginePrefix}-pending-`)
        ? threadId
        : enginePrefix === "opencode"
          ? pendingOpenCode
            ?? (threadId !== newThreadId &&
              !threadId.startsWith("claude:") &&
              !threadId.startsWith("claude-pending-")
              ? threadId
              : null)
          : pendingClaude
            ?? (threadId !== newThreadId &&
              !threadId.startsWith("opencode:") &&
              !threadId.startsWith("opencode-pending-")
              ? threadId
              : null);

      if (!sourceThreadId || sourceThreadId === newThreadId) {
        return;
      }

      // Rename the thread from claude-pending-* to claude:{sessionId}
      dispatch({
        type: "renameThreadId",
        workspaceId,
        oldThreadId: sourceThreadId,
        newThreadId,
      });
      renameCustomNameKey(workspaceId, sourceThreadId, newThreadId);
      renameAutoTitlePendingKey(workspaceId, sourceThreadId, newThreadId);
      void renameThreadTitleMapping(workspaceId, sourceThreadId, newThreadId);
    },
    [
      dispatch,
      renameAutoTitlePendingKey,
      renameCustomNameKey,
      renameThreadTitleMapping,
      resolvePendingThreadForSession,
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
