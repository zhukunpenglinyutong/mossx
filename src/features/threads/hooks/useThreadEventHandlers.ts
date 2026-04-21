import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type {
  AppServerEvent,
  CollaborationModeBlockedRequest,
  CollaborationModeResolvedRequest,
  DebugEntry,
  RequestUserInputRequest,
} from "../../../types";
import { useThreadApprovalEvents } from "./useThreadApprovalEvents";
import { useThreadItemEvents } from "./useThreadItemEvents";
import { useThreadTurnEvents } from "./useThreadTurnEvents";
import { useThreadUserInputEvents } from "./useThreadUserInputEvents";
import { stripBackendErrorPrefix } from "../utils/networkErrors";
import { captureClaudeMcpRuntimeSnapshotFromRaw } from "../utils/claudeMcpRuntimeSnapshot";
import { buildThreadDebugCorrelation } from "../utils/threadDebugCorrelation";
import type { ThreadAction } from "./useThreadsReducer";
import { isDebugLightPathEnabled } from "../utils/realtimePerfFlags";

const TURN_STALL_WARNING_MS = 6_000;
const TURN_DIAGNOSTIC_VERBOSE_FLAG_KEY = "ccgui.debug.turnDiagnosticsVerbose";
const EXECUTION_ITEM_TYPES = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "collabToolCall",
  "collabAgentToolCall",
  "webSearch",
  "imageView",
]);

type ThreadLifecycleSnapshot = {
  isProcessing: boolean;
  activeTurnId: string | null;
};

type TurnDiagnosticState = {
  workspaceId: string;
  threadId: string;
  turnId: string;
  startedAt: number;
  firstDeltaAt: number | null;
  firstItemEventAt: number | null;
  firstItemEventKind: "started" | "updated" | "completed" | null;
  firstItemType: string | null;
  firstExecutionAt: number | null;
  firstExecutionEventKind: "started" | "updated" | "completed" | null;
  firstExecutionItemType: string | null;
  firstExecutionItemId: string | null;
  completedAt: number | null;
  errorAt: number | null;
  deltaCount: number;
  itemEventCount: number;
  stallReported: boolean;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function createThreadLifecycleSnapshot(): ThreadLifecycleSnapshot {
  return {
    isProcessing: false,
    activeTurnId: null,
  };
}

function createTurnDiagnosticState(
  workspaceId: string,
  threadId: string,
  turnId: string,
  startedAt: number,
): TurnDiagnosticState {
  return {
    workspaceId,
    threadId,
    turnId,
    startedAt,
    firstDeltaAt: null,
    firstItemEventAt: null,
    firstItemEventKind: null,
    firstItemType: null,
    firstExecutionAt: null,
    firstExecutionEventKind: null,
    firstExecutionItemType: null,
    firstExecutionItemId: null,
    completedAt: null,
    errorAt: null,
    deltaCount: 0,
    itemEventCount: 0,
    stallReported: false,
  };
}

function isTurnDiagnosticVerboseEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const value = window.localStorage.getItem(TURN_DIAGNOSTIC_VERBOSE_FLAG_KEY);
    if (!value) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on";
  } catch {
    return false;
  }
}

type ThreadEventHandlersOptions = {
  activeThreadId: string | null;
  dispatch: Dispatch<ThreadAction>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  resolveCollaborationUiMode?: (
    threadId: string,
  ) => "plan" | "code" | null;
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
    engine: "claude" | "gemini" | "opencode",
  ) => string | null;
  getActiveTurnIdForThread?: (threadId: string) => string | null;
  renamePendingMemoryCaptureKey: (
    oldThreadId: string,
    newThreadId: string,
  ) => void;
  onAgentMessageCompletedExternal?: (payload: {
    workspaceId: string;
    threadId: string;
    itemId: string;
    text: string;
  }) => void;
  onCollaborationModeResolved?: (
    event: CollaborationModeResolvedRequest,
  ) => void;
  onExitPlanModeToolCompleted?: (payload: {
    workspaceId: string;
    threadId: string;
    itemId: string;
  }) => void;
};

function isThreadSessionMirrorEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const value = window.localStorage.getItem("ccgui.debug.threadSessionMirror");
    if (!value) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on";
  } catch {
    return false;
  }
}

function shouldEmitServerDebugEntry(method: string) {
  if (!isDebugLightPathEnabled()) {
    return true;
  }
  return (
    method === "error" ||
    method === "turn/error" ||
    method === "codex/stderr" ||
    method === "turn/started" ||
    method === "turn/completed" ||
    method === "thread/started" ||
    method === "thread/compacting" ||
    method === "thread/compacted" ||
    method === "thread/compactionFailed" ||
    method.includes("warn") ||
    method.includes("warning")
  );
}

export function useThreadEventHandlers({
  activeThreadId,
  dispatch,
  getCustomName,
  resolveCollaborationUiMode,
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
  getActiveTurnIdForThread,
  renamePendingMemoryCaptureKey,
  onAgentMessageCompletedExternal,
  onCollaborationModeResolved,
  onExitPlanModeToolCompleted,
}: ThreadEventHandlersOptions) {
  const threadLifecycleSnapshotRef = useRef<Map<string, ThreadLifecycleSnapshot>>(new Map());
  const turnDiagnosticsRef = useRef<Map<string, TurnDiagnosticState>>(new Map());
  const turnStallTimerRef = useRef<Map<string, number>>(new Map());

  const getThreadLifecycleSnapshot = useCallback((threadId: string) => {
    return (
      threadLifecycleSnapshotRef.current.get(threadId) ?? createThreadLifecycleSnapshot()
    );
  }, []);

  const emitTurnDiagnostic = useCallback(
    (
      label: string,
      payload: Record<string, unknown>,
      options?: { force?: boolean },
    ) => {
      if (!options?.force && !isTurnDiagnosticVerboseEnabled()) {
        return;
      }
      onDebug?.({
        id: `${Date.now()}-turn-diagnostic-${label}`,
        timestamp: Date.now(),
        source: "event",
        label: `thread/session:turn-diagnostic:${label}`,
        payload: buildThreadDebugCorrelation(
          {
            workspaceId:
              typeof payload.workspaceId === "string" ? payload.workspaceId : null,
            threadId:
              typeof payload.threadId === "string" ? payload.threadId : null,
            action: `turn-diagnostic:${label}`,
            diagnosticCategory:
              typeof payload.diagnosticCategory === "string"
                ? payload.diagnosticCategory
                : null,
          },
          payload,
        ),
      });
    },
    [onDebug],
  );

  const clearTurnStallTimer = useCallback((threadId: string) => {
    const timerId = turnStallTimerRef.current.get(threadId);
    if (timerId === undefined) {
      return;
    }
    window.clearTimeout(timerId);
    turnStallTimerRef.current.delete(threadId);
  }, []);

  const scheduleTurnStallTimer = useCallback(
    (threadId: string) => {
      if (typeof window === "undefined") {
        return;
      }
      clearTurnStallTimer(threadId);
      const timerId = window.setTimeout(() => {
        const diagnostic = turnDiagnosticsRef.current.get(threadId);
        if (!diagnostic || diagnostic.stallReported || diagnostic.firstExecutionAt !== null) {
          return;
        }
        const lifecycle = getThreadLifecycleSnapshot(threadId);
        const now = Date.now();
        diagnostic.stallReported = true;
        emitTurnDiagnostic("stalled-after-first-delta", {
          workspaceId: diagnostic.workspaceId,
          threadId: diagnostic.threadId,
          turnId: diagnostic.turnId,
          elapsedMs: Math.max(0, now - diagnostic.startedAt),
          deltaSinceMs:
            diagnostic.firstDeltaAt === null ? null : Math.max(0, now - diagnostic.firstDeltaAt),
          itemEventCount: diagnostic.itemEventCount,
          firstItemEventKind: diagnostic.firstItemEventKind,
          firstItemType: diagnostic.firstItemType,
          hasExecutionItem: false,
          isProcessing: lifecycle.isProcessing,
          activeTurnId: lifecycle.activeTurnId,
        }, { force: true });
      }, TURN_STALL_WARNING_MS);
      turnStallTimerRef.current.set(threadId, timerId);
    },
    [clearTurnStallTimer, emitTurnDiagnostic, getThreadLifecycleSnapshot],
  );

  const markProcessingTracked = useCallback(
    (threadId: string, isProcessing: boolean) => {
      const previous =
        threadLifecycleSnapshotRef.current.get(threadId) ?? createThreadLifecycleSnapshot();
      threadLifecycleSnapshotRef.current.set(threadId, {
        ...previous,
        isProcessing,
      });
      markProcessing(threadId, isProcessing);
    },
    [markProcessing],
  );

  const setActiveTurnIdTracked = useCallback(
    (threadId: string, turnId: string | null) => {
      const previous =
        threadLifecycleSnapshotRef.current.get(threadId) ?? createThreadLifecycleSnapshot();
      threadLifecycleSnapshotRef.current.set(threadId, {
        ...previous,
        activeTurnId: turnId,
      });
      setActiveTurnId(threadId, turnId);
    },
    [setActiveTurnId],
  );

  const captureTurnItemDiagnostic = useCallback(
    (
      threadId: string,
      kind: "started" | "updated" | "completed",
      item: Record<string, unknown>,
    ) => {
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      if (!diagnostic) {
        return;
      }
      diagnostic.itemEventCount += 1;
      const itemType = asString(item.type).trim() || null;
      const itemId = asString(item.id).trim() || null;
      const now = Date.now();
      if (diagnostic.firstItemEventAt === null) {
        diagnostic.firstItemEventAt = now;
        diagnostic.firstItemEventKind = kind;
        diagnostic.firstItemType = itemType;
        const lifecycle = getThreadLifecycleSnapshot(threadId);
        emitTurnDiagnostic("first-item", {
          workspaceId: diagnostic.workspaceId,
          threadId,
          turnId: diagnostic.turnId,
          itemEventKind: kind,
          itemType,
          itemId,
          elapsedMs: Math.max(0, now - diagnostic.startedAt),
          deltaSeen: diagnostic.firstDeltaAt !== null,
          isProcessing: lifecycle.isProcessing,
          activeTurnId: lifecycle.activeTurnId,
        });
      }
      if (itemType && EXECUTION_ITEM_TYPES.has(itemType) && diagnostic.firstExecutionAt === null) {
        diagnostic.firstExecutionAt = now;
        diagnostic.firstExecutionEventKind = kind;
        diagnostic.firstExecutionItemType = itemType;
        diagnostic.firstExecutionItemId = itemId;
        clearTurnStallTimer(threadId);
        const lifecycle = getThreadLifecycleSnapshot(threadId);
        emitTurnDiagnostic("first-execution-item", {
          workspaceId: diagnostic.workspaceId,
          threadId,
          turnId: diagnostic.turnId,
          itemEventKind: kind,
          itemType,
          itemId,
          elapsedMs: Math.max(0, now - diagnostic.startedAt),
          deltaSinceMs:
            diagnostic.firstDeltaAt === null ? null : Math.max(0, now - diagnostic.firstDeltaAt),
          isProcessing: lifecycle.isProcessing,
          activeTurnId: lifecycle.activeTurnId,
        });
      }
    },
    [clearTurnStallTimer, emitTurnDiagnostic, getThreadLifecycleSnapshot],
  );

  useEffect(() => {
    const timers = turnStallTimerRef.current;
    return () => {
      timers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      timers.clear();
    };
  }, []);

  const isReasoningRawDebugEnabled = () => {
    if (import.meta.env?.DEV) {
      try {
        const value = window.localStorage.getItem("ccgui.debug.reasoning.raw");
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
      const value = window.localStorage.getItem("ccgui.debug.reasoning.raw");
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
    markProcessing: markProcessingTracked,
    setActiveTurnId: setActiveTurnIdTracked,
  });
  const enqueueUserInputRequest = useThreadUserInputEvents({ dispatch });
  const onRequestUserInput = useCallback(
    (request: RequestUserInputRequest) => {
      enqueueUserInputRequest(request);
      const threadId = request.params.thread_id;
      if (!threadId) {
        return;
      }
      // requestUserInput means the turn is now waiting for user choice,
      // so we should stop the spinning "processing" state immediately.
      markProcessingTracked(threadId, false);
      setActiveTurnIdTracked(threadId, null);
      dispatch({
        type: "settleThreadPlanInProgress",
        threadId,
        targetStatus: "pending",
      });
    },
    [dispatch, enqueueUserInputRequest, markProcessingTracked, setActiveTurnIdTracked],
  );
  const onModeBlocked = useCallback(
    (event: CollaborationModeBlockedRequest) => {
      const threadId = event.params.thread_id;
      if (!threadId) {
        return;
      }
      const requestId = event.params.request_id;
      if (requestId !== null && requestId !== undefined) {
        dispatch({
          type: "removeUserInputRequest",
          requestId,
          workspaceId: event.workspace_id,
        });
      }
      const reason =
        event.params.reason.trim() ||
        "This request is blocked while effective mode is code.";
      const suggestion =
        (event.params.suggestion ?? "").trim() ||
        "Switch to Plan mode and retry if user input is required.";
      const blockedMethod = event.params.blocked_method || "item/tool/requestUserInput";
      const blockedTitle = blockedMethod.includes("requestUserInput")
        ? "Tool: askuserquestion"
        : "Tool: mode policy";
      const eventId = requestId !== null && requestId !== undefined
        ? String(requestId)
        : `${Date.now()}`;
      dispatch({
        type: "upsertItem",
        workspaceId: event.workspace_id,
        threadId,
        item: {
          id: `mode-blocked-${threadId}-${eventId}`,
          kind: "tool",
          toolType: "modeBlocked",
          title: blockedTitle,
          detail: blockedMethod,
          status: "completed",
          output: `${reason}\n\n${suggestion}`,
        },
        hasCustomName: Boolean(getCustomName(event.workspace_id, threadId)),
      });
    },
    [dispatch, getCustomName],
  );

  const onModeResolved = useCallback(
    (event: CollaborationModeResolvedRequest) => {
      onCollaborationModeResolved?.(event);
    },
    [onCollaborationModeResolved],
  );

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
    resolveCollaborationUiMode,
    markProcessing: markProcessingTracked,
    markReviewing,
    safeMessageActivity,
    recordThreadActivity,
    applyCollabThreadLinks,
    interruptedThreadsRef,
    onDebug,
    onAgentMessageCompletedExternal,
    onExitPlanModeToolCompleted,
  });

  const {
    onThreadStarted,
    onTurnStarted,
    onTurnCompleted,
    onTurnPlanUpdated,
    onThreadTokenUsageUpdated,
    onAccountRateLimitsUpdated,
    onTurnError,
    onTurnStalled,
    onContextCompacting,
    onContextCompacted,
    onContextCompactionFailed,
    onThreadSessionIdUpdated,
  } = useThreadTurnEvents({
    activeThreadId,
    dispatch,
    getCustomName,
    isAutoTitlePending,
    isThreadHidden,
    markProcessing: markProcessingTracked,
    markReviewing,
    setActiveTurnId: setActiveTurnIdTracked,
    pendingInterruptsRef,
    interruptedThreadsRef,
    pushThreadErrorMessage,
    safeMessageActivity,
    recordThreadActivity,
    renameCustomNameKey,
    renameAutoTitlePendingKey,
    renameThreadTitleMapping,
    resolvePendingThreadForSession,
    getActiveTurnIdForThread,
    renamePendingMemoryCaptureKey,
    onDebug,
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

  const onTurnStartedTracked = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      const startedAt = Date.now();
      clearTurnStallTimer(threadId);
      turnDiagnosticsRef.current.set(
        threadId,
        createTurnDiagnosticState(workspaceId, threadId, turnId, startedAt),
      );
      onTurnStarted(workspaceId, threadId, turnId);
      const lifecycle = getThreadLifecycleSnapshot(threadId);
      emitTurnDiagnostic("started", {
        workspaceId,
        threadId,
        turnId,
        isProcessing: lifecycle.isProcessing,
        activeTurnId: lifecycle.activeTurnId,
      });
    },
    [clearTurnStallTimer, emitTurnDiagnostic, getThreadLifecycleSnapshot, onTurnStarted],
  );

  const onAgentMessageDeltaTracked = useCallback(
    (payload: {
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
    }) => {
      onAgentMessageDelta(payload);
      if (interruptedThreadsRef.current.has(payload.threadId)) {
        return;
      }
      const diagnostic = turnDiagnosticsRef.current.get(payload.threadId);
      if (!diagnostic) {
        return;
      }
      diagnostic.deltaCount += 1;
      if (diagnostic.firstDeltaAt !== null) {
        return;
      }
      diagnostic.firstDeltaAt = Date.now();
      scheduleTurnStallTimer(payload.threadId);
      const lifecycle = getThreadLifecycleSnapshot(payload.threadId);
      emitTurnDiagnostic("first-delta", {
        workspaceId: payload.workspaceId,
        threadId: payload.threadId,
        turnId: diagnostic.turnId,
        itemId: payload.itemId,
        deltaLength: payload.delta.length,
        elapsedMs: Math.max(0, diagnostic.firstDeltaAt - diagnostic.startedAt),
        isProcessing: lifecycle.isProcessing,
        activeTurnId: lifecycle.activeTurnId,
      });
    },
    [
      emitTurnDiagnostic,
      getThreadLifecycleSnapshot,
      interruptedThreadsRef,
      onAgentMessageDelta,
      scheduleTurnStallTimer,
    ],
  );

  const onItemStartedTracked = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      onItemStarted(workspaceId, threadId, item);
      captureTurnItemDiagnostic(threadId, "started", item);
    },
    [captureTurnItemDiagnostic, onItemStarted],
  );

  const onItemUpdatedTracked = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      onItemUpdated(workspaceId, threadId, item);
      captureTurnItemDiagnostic(threadId, "updated", item);
    },
    [captureTurnItemDiagnostic, onItemUpdated],
  );

  const onItemCompletedTracked = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      onItemCompleted(workspaceId, threadId, item);
      captureTurnItemDiagnostic(threadId, "completed", item);
    },
    [captureTurnItemDiagnostic, onItemCompleted],
  );

  const finalizeTurnDiagnostic = useCallback(
    (
      threadId: string,
      finalState: "completed" | "error",
      payload?: Record<string, unknown>,
    ) => {
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      clearTurnStallTimer(threadId);
      if (!diagnostic) {
        return;
      }
      const now = Date.now();
      if (finalState === "completed") {
        diagnostic.completedAt = now;
      } else {
        diagnostic.errorAt = now;
      }
      const lifecycle = getThreadLifecycleSnapshot(threadId);
      emitTurnDiagnostic(finalState, {
        workspaceId: diagnostic.workspaceId,
        threadId,
        turnId: diagnostic.turnId,
        elapsedMs: Math.max(0, now - diagnostic.startedAt),
        firstDeltaAtMs:
          diagnostic.firstDeltaAt === null
            ? null
            : Math.max(0, diagnostic.firstDeltaAt - diagnostic.startedAt),
        firstItemAtMs:
          diagnostic.firstItemEventAt === null
            ? null
            : Math.max(0, diagnostic.firstItemEventAt - diagnostic.startedAt),
        firstItemEventKind: diagnostic.firstItemEventKind,
        firstItemType: diagnostic.firstItemType,
        firstExecutionAtMs:
          diagnostic.firstExecutionAt === null
            ? null
            : Math.max(0, diagnostic.firstExecutionAt - diagnostic.startedAt),
        firstExecutionEventKind: diagnostic.firstExecutionEventKind,
        firstExecutionItemType: diagnostic.firstExecutionItemType,
        firstExecutionItemId: diagnostic.firstExecutionItemId,
        deltaCount: diagnostic.deltaCount,
        itemEventCount: diagnostic.itemEventCount,
        stalledAfterFirstDelta: diagnostic.stallReported,
        isProcessing: lifecycle.isProcessing,
        activeTurnId: lifecycle.activeTurnId,
        ...payload,
      }, { force: finalState === "error" || diagnostic.stallReported });
      turnDiagnosticsRef.current.delete(threadId);
    },
    [clearTurnStallTimer, emitTurnDiagnostic, getThreadLifecycleSnapshot],
  );

  const onTurnCompletedTracked = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      onTurnCompleted(workspaceId, threadId, turnId);
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      if (diagnostic && diagnostic.turnId !== turnId) {
        return;
      }
      finalizeTurnDiagnostic(threadId, "completed");
    },
    [finalizeTurnDiagnostic, onTurnCompleted],
  );

  const onTurnErrorTracked = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      payload: { message: string; willRetry: boolean },
    ) => {
      onTurnError(workspaceId, threadId, turnId, payload);
      if (payload.willRetry) {
        return;
      }
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      if (diagnostic && diagnostic.turnId !== turnId) {
        return;
      }
      finalizeTurnDiagnostic(threadId, "error", {
        message: payload.message,
        willRetry: payload.willRetry,
      });
    },
    [finalizeTurnDiagnostic, onTurnError],
  );

  const onTurnStalledTracked = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      payload: {
        message: string;
        reasonCode: string;
        stage: string;
        startedAtMs: number | null;
        timeoutMs: number | null;
      },
    ) => {
      onTurnStalled(workspaceId, threadId, turnId, payload);
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      if (diagnostic && diagnostic.turnId !== turnId) {
        return;
      }
      finalizeTurnDiagnostic(threadId, "error", {
        message: payload.message,
        diagnosticCategory: "resume_stalled",
        reasonCode: payload.reasonCode,
        stage: payload.stage,
        startedAtMs: payload.startedAtMs,
        timeoutMs: payload.timeoutMs,
      });
    },
    [finalizeTurnDiagnostic, onTurnStalled],
  );

  const onAppServerEvent = useCallback(
    (event: AppServerEvent) => {
      const method = String(event.message?.method ?? "");
      const params = (event.message?.params as Record<string, unknown> | undefined) ?? {};
      const inferredSource = method === "codex/stderr" ? "stderr" : "event";
      const mirrorEnabled = isThreadSessionMirrorEnabled();
      if (onDebug && (mirrorEnabled || shouldEmitServerDebugEntry(method))) {
        onDebug({
          id: `${Date.now()}-server-event`,
          timestamp: Date.now(),
          source: inferredSource,
          label: method || "event",
          payload: mirrorEnabled
            ? event
            : {
                workspaceId: event.workspace_id,
                method: method || "event",
                threadId: String(params.threadId ?? params.thread_id ?? ""),
                turnId: String(params.turnId ?? params.turn_id ?? ""),
              },
        });
      }

      if (method === "codex/stderr") {
        const rawMessage = String(params.message ?? "").trim();
        if (onDebug && isReasoningRawDebugEnabled() && rawMessage) {
          onDebug({
            id: `${Date.now()}-stderr-raw`,
            timestamp: Date.now(),
            source: "stderr",
            label: "stderr/raw",
            payload: stripBackendErrorPrefix(rawMessage),
          });
        }
      }

      if (method === "claude/raw") {
        const snapshot = captureClaudeMcpRuntimeSnapshotFromRaw(
          event.workspace_id,
          params,
        );
        if (snapshot && onDebug) {
          onDebug({
            id: `${Date.now()}-claude-mcp-snapshot`,
            timestamp: Date.now(),
            source: "event",
            label: "claude/mcp-runtime-snapshot",
            payload: {
              workspaceId: snapshot.workspaceId,
              sessionId: snapshot.sessionId,
              capturedAt: snapshot.capturedAt,
              toolsCount: snapshot.tools.length,
              servers: snapshot.mcpServers,
            },
          });
        }
      }

      if (!onDebug || !isReasoningRawDebugEnabled()) {
        return;
      }

      if (
        method !== "item/started" &&
        method !== "item/updated" &&
        method !== "item/completed" &&
        method !== "item/reasoning/summaryTextDelta" &&
        method !== "item/reasoning/summaryPartAdded" &&
        method !== "item/reasoning/textDelta" &&
        method !== "item/reasoning/delta" &&
        method !== "response.reasoning_summary_text.delta" &&
        method !== "response.reasoning_summary_text.done" &&
        method !== "response.reasoning_summary.delta" &&
        method !== "response.reasoning_summary.done" &&
        method !== "response.reasoning_summary_part.added" &&
        method !== "response.reasoning_summary_part.done" &&
        method !== "response.reasoning_text.delta" &&
        method !== "response.reasoning_text.done"
      ) {
        return;
      }

      if (
        method === "item/reasoning/summaryTextDelta" ||
        method === "item/reasoning/summaryPartAdded" ||
        method === "item/reasoning/textDelta" ||
        method === "item/reasoning/delta" ||
        method === "response.reasoning_summary_text.delta" ||
        method === "response.reasoning_summary_text.done" ||
        method === "response.reasoning_summary.delta" ||
        method === "response.reasoning_summary.done" ||
        method === "response.reasoning_summary_part.added" ||
        method === "response.reasoning_summary_part.done" ||
        method === "response.reasoning_text.delta" ||
        method === "response.reasoning_text.done"
      ) {
        onDebug({
          id: `${Date.now()}-reasoning-raw`,
          timestamp: Date.now(),
          source: "event",
          label: `reasoning/raw:${method}`,
          payload: {
            workspaceId: event.workspace_id,
            threadId: String(params.threadId ?? params.thread_id ?? ""),
            itemId: String(params.itemId ?? params.item_id ?? ""),
            delta: params.delta ?? null,
            summaryIndex: params.summaryIndex ?? params.summary_index ?? null,
            params,
          },
        });
        return;
      }
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
    [
      onDebug,
    ],
  );

  const handlers = useMemo(
    () => ({
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onModeBlocked,
      onModeResolved,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDelta: onAgentMessageDeltaTracked,
      onAgentMessageCompleted,
      onItemStarted: onItemStartedTracked,
      onItemUpdated: onItemUpdatedTracked,
      onItemCompleted: onItemCompletedTracked,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onTurnStarted: onTurnStartedTracked,
      onTurnCompleted: onTurnCompletedTracked,
      onProcessingHeartbeat,
      onTurnPlanUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnError: onTurnErrorTracked,
      onTurnStalled: onTurnStalledTracked,
      onContextCompacting,
      onContextCompacted,
      onContextCompactionFailed,
      onThreadSessionIdUpdated,
    }),
    [
      onWorkspaceConnected,
      onApprovalRequest,
      onRequestUserInput,
      onModeBlocked,
      onModeResolved,
      onBackgroundThreadAction,
      onAppServerEvent,
      onAgentMessageDeltaTracked,
      onAgentMessageCompleted,
      onItemStartedTracked,
      onItemUpdatedTracked,
      onItemCompletedTracked,
      onReasoningSummaryDelta,
      onReasoningSummaryBoundary,
      onReasoningTextDelta,
      onCommandOutputDelta,
      onTerminalInteraction,
      onFileChangeOutputDelta,
      onThreadStarted,
      onTurnStartedTracked,
      onTurnCompletedTracked,
      onProcessingHeartbeat,
      onTurnPlanUpdated,
      onThreadTokenUsageUpdated,
      onAccountRateLimitsUpdated,
      onTurnErrorTracked,
      onTurnStalledTracked,
      onContextCompacting,
      onContextCompacted,
      onContextCompactionFailed,
      onThreadSessionIdUpdated,
    ],
  );

  return handlers;
}
