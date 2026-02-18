import { useCallback, useMemo } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type { AppServerEvent, DebugEntry } from "../../../types";
import { useThreadApprovalEvents } from "./useThreadApprovalEvents";
import { useThreadItemEvents } from "./useThreadItemEvents";
import { useThreadTurnEvents } from "./useThreadTurnEvents";
import { useThreadUserInputEvents } from "./useThreadUserInputEvents";
import type { ThreadAction } from "./useThreadsReducer";

type ThreadEventHandlersOptions = {
  activeThreadId: string | null;
  dispatch: Dispatch<ThreadAction>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  isAutoTitlePending: (workspaceId: string, threadId: string) => boolean;
  isThreadHidden: (workspaceId: string, threadId: string) => boolean;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  safeMessageActivity: () => void;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  onWorkspaceConnected: (workspaceId: string) => void;
  applyCollabThreadLinks: (
    threadId: string,
    item: Record<string, unknown>,
  ) => void;
  approvalAllowlistRef: MutableRefObject<Record<string, string[][]>>;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
  interruptedThreadsRef: MutableRefObject<Set<string>>;
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

export function useThreadEventHandlers({
  activeThreadId,
  dispatch,
  getCustomName,
  isAutoTitlePending,
  isThreadHidden,
  markProcessing,
  markReviewing,
  setActiveTurnId,
  safeMessageActivity,
  recordThreadActivity,
  pushThreadErrorMessage,
  onDebug,
  onWorkspaceConnected,
  applyCollabThreadLinks,
  approvalAllowlistRef,
  pendingInterruptsRef,
  interruptedThreadsRef,
  renameCustomNameKey,
  renameAutoTitlePendingKey,
  renameThreadTitleMapping,
  resolvePendingThreadForSession,
}: ThreadEventHandlersOptions) {
  const isReasoningRawDebugEnabled = () => {
    if (import.meta.env?.DEV) {
      try {
        const value = window.localStorage.getItem("codemoss.debug.reasoning.raw");
        if (!value) {
          return true;
        }
        const normalized = value.trim().toLowerCase();
        return !(normalized === "0" || normalized === "false" || normalized === "off");
      } catch {
        return true;
      }
    }
    if (typeof window === "undefined") {
      return false;
    }
    try {
      const value = window.localStorage.getItem("codemoss.debug.reasoning.raw");
      if (!value) {
        return false;
      }
      const normalized = value.trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "on";
    } catch {
      return false;
    }
  };

  const onApprovalRequest = useThreadApprovalEvents({
    dispatch,
    approvalAllowlistRef,
  });
  const onRequestUserInput = useThreadUserInputEvents({ dispatch });

  const {
    onAgentMessageDelta,
    onAgentMessageCompleted,
    onItemStarted,
    onItemUpdated,
    onItemCompleted,
    onReasoningSummaryDelta,
    onReasoningSummaryBoundary,
    onReasoningTextDelta,
    onCommandOutputDelta,
    onTerminalInteraction,
    onFileChangeOutputDelta,
  } = useThreadItemEvents({
    activeThreadId,
    dispatch,
    getCustomName,
    markProcessing,
    markReviewing,
    safeMessageActivity,
    recordThreadActivity,
    applyCollabThreadLinks,
    interruptedThreadsRef,
  });

  const {
    onThreadStarted,
    onTurnStarted,
    onTurnCompleted,
    onTurnPlanUpdated,
    onThreadTokenUsageUpdated,
    onAccountRateLimitsUpdated,
    onTurnError,
    onContextCompacted,
    onThreadSessionIdUpdated,
  } = useThreadTurnEvents({
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
  });

  const onBackgroundThreadAction = useCallback(
    (workspaceId: string, threadId: string, action: string) => {
      if (action !== "hide") {
        return;
      }
      dispatch({ type: "hideThread", workspaceId, threadId });
    },
    [dispatch],
  );

  const onProcessingHeartbeat = useCallback(
    (_workspaceId: string, threadId: string, pulse: number) => {
      if (!threadId || pulse <= 0) {
        return;
      }
      dispatch({ type: "markHeartbeat", threadId, pulse });
      safeMessageActivity();
    },
    [dispatch, safeMessageActivity],
  );

  /**
   * 获取当前活动的 Codex thread ID
   * 奶奶请看：这个函数就是"智能收件室"的核心功能
   * 当 Codex 的报告信没有写收件人时，我们就看看当前正在使用哪个 Codex 房间
   */
  const getActiveCodexThreadId = useCallback(
    (_workspaceId: string): string | null => {
      // 如果当前有活动的 thread，且不是 Claude thread（Claude 以 "claude:" 开头）
      // 那就返回这个 thread ID
      if (
        activeThreadId &&
        !activeThreadId.startsWith("claude:") &&
        !activeThreadId.startsWith("claude-pending-") &&
        !activeThreadId.startsWith("opencode:") &&
        !activeThreadId.startsWith("opencode-pending-")
      ) {
        return activeThreadId;
      }
      return null;
    },
    [activeThreadId],
  );

  const onAppServerEvent = useCallback(
    (event: AppServerEvent) => {
      const method = String(event.message?.method ?? "");
      const inferredSource = method === "codex/stderr" ? "stderr" : "event";
      onDebug?.({
        id: `${Date.now()}-server-event`,
        timestamp: Date.now(),
        source: inferredSource,
        label: method || "event",
        payload: event,
      });

      if (!onDebug || !isReasoningRawDebugEnabled()) {
        return;
      }

      if (
        method !== "item/started" &&
        method !== "item/updated" &&
        method !== "item/completed"
      ) {
        return;
      }

      const params = (event.message?.params as Record<string, unknown> | undefined) ?? {};
      const item = (params.item as Record<string, unknown> | undefined) ?? {};
      if (String(item.type ?? "") !== "reasoning") {
        return;
      }

      onDebug({
        id: `${Date.now()}-reasoning-raw`,
        timestamp: Date.now(),
        source: "event",
        label: `reasoning/raw:${method}`,
        payload: {
          workspaceId: event.workspace_id,
          threadId: String(params.threadId ?? params.thread_id ?? ""),
          itemId: String(item.id ?? ""),
          summary: item.summary ?? null,
          content: item.content ?? null,
          text: item.text ?? null,
          rawItem: item,
        },
      });
    },
    [onDebug],
  );

  const handlers = useMemo(
    () => ({
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDelta,
      onAgentMessageCompleted,
      onItemStarted,
      onItemUpdated,
      onItemCompleted,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onTurnStarted,
      onTurnCompleted,
      onProcessingHeartbeat,
      onTurnPlanUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnError,
      onContextCompacted,
      onThreadSessionIdUpdated,
      // 奶奶请看：这里就是把"智能收件室"功能加到处理器列表里
      getActiveCodexThreadId,
    }),
    [
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDelta,
      onAgentMessageCompleted,
      onItemStarted,
      onItemUpdated,
      onItemCompleted,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onTurnStarted,
      onTurnCompleted,
      onProcessingHeartbeat,
      onTurnPlanUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnError,
      onContextCompacted,
      onThreadSessionIdUpdated,
      getActiveCodexThreadId,
    ],
  );

  return handlers;
}
