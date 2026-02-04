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
};

export function useThreadEventHandlers({
  activeThreadId,
  dispatch,
  getCustomName,
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
}: ThreadEventHandlersOptions) {
  const onApprovalRequest = useThreadApprovalEvents({
    dispatch,
    approvalAllowlistRef,
  });
  const onRequestUserInput = useThreadUserInputEvents({ dispatch });

  const {
    onAgentMessageDelta,
    onAgentMessageCompleted,
    onItemStarted,
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
    isThreadHidden,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    pendingInterruptsRef,
    pushThreadErrorMessage,
    safeMessageActivity,
    recordThreadActivity,
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
        !activeThreadId.startsWith("claude-pending-")
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
