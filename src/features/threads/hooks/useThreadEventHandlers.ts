import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
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
import { parseFirstPacketTimeoutSeconds, stripBackendErrorPrefix } from "../utils/networkErrors";
import { captureClaudeMcpRuntimeSnapshotFromRaw } from "../utils/claudeMcpRuntimeSnapshot";
import { buildThreadDebugCorrelation } from "../utils/threadDebugCorrelation";
import type { ThreadAction } from "./useThreadsReducer";
import type { NormalizedThreadEvent } from "../contracts/conversationCurtainContracts";
import { isDebugLightPathEnabled } from "../utils/realtimePerfFlags";
import {
  buildThreadStreamCorrelationDimensions,
  completeThreadStreamTurn,
  noteThreadDeltaReceived,
  noteThreadTurnStarted,
  reportThreadUpstreamPending,
} from "../utils/streamLatencyDiagnostics";
import {
  buildCodexLivenessDiagnostic,
} from "../utils/codexConversationLiveness";

const TURN_FIRST_DELTA_WARNING_MS = 6_000;
const TURN_STALL_WARNING_MS = 6_000;
export const CODEX_TURN_NO_PROGRESS_STALL_MS = 180_000;
export const CODEX_EXECUTION_ACTIVE_NO_PROGRESS_STALL_MS = 15 * 60_000;
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

type ActiveExecutionItem = {
  itemType: string;
  startedAt: number;
};

type ThreadLifecycleSnapshot = {
  isProcessing: boolean;
  activeTurnId: string | null;
};

type TurnDiagnosticState = {
  workspaceId: string;
  threadId: string;
  turnId: string;
  startedAt: number;
  lastProgressAt: number;
  lastProgressSource: string;
  firstDeltaAt: number | null;
  firstItemEventAt: number | null;
  firstItemEventKind: "started" | "updated" | "completed" | null;
  firstItemType: string | null;
  firstExecutionAt: number | null;
  firstExecutionEventKind: "started" | "updated" | "completed" | null;
  firstExecutionItemType: string | null;
  firstExecutionItemId: string | null;
  activeExecutionItems: Map<string, ActiveExecutionItem>;
  completedAt: number | null;
  errorAt: number | null;
  deltaCount: number;
  itemEventCount: number;
  progressSequence: number;
  stallReported: boolean;
  noProgressSettled: boolean;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function isExecutionItemType(itemType: string | null): itemType is string {
  return itemType !== null && EXECUTION_ITEM_TYPES.has(itemType);
}

function buildExecutionItemIdKey(itemId: string) {
  return `id:${itemId}`;
}

function buildExecutionItemKey(itemType: string, itemId: string | null) {
  return itemId ? buildExecutionItemIdKey(itemId) : `type:${itemType}`;
}

function getCodexNoProgressTimeoutMs(diagnostic: TurnDiagnosticState) {
  return diagnostic.activeExecutionItems.size > 0
    ? CODEX_EXECUTION_ACTIVE_NO_PROGRESS_STALL_MS
    : CODEX_TURN_NO_PROGRESS_STALL_MS;
}

function listActiveExecutionItemTypes(diagnostic: TurnDiagnosticState) {
  return Array.from(
    new Set(
      Array.from(diagnostic.activeExecutionItems.values()).map(
        (item) => item.itemType,
      ),
    ),
  );
}

function clearCompletedExecutionItem(
  diagnostic: TurnDiagnosticState,
  itemType: string | null,
  itemId: string | null,
) {
  const previousSize = diagnostic.activeExecutionItems.size;
  if (itemId) {
    diagnostic.activeExecutionItems.delete(buildExecutionItemIdKey(itemId));
  }
  if (itemType) {
    for (const [key, activeItem] of diagnostic.activeExecutionItems) {
      if (activeItem.itemType === itemType && !itemId) {
        diagnostic.activeExecutionItems.delete(key);
      }
    }
    diagnostic.activeExecutionItems.delete(buildExecutionItemKey(itemType, itemId));
  }
  return diagnostic.activeExecutionItems.size !== previousSize;
}

function applyActiveExecutionItemEvent(
  diagnostic: TurnDiagnosticState,
  kind: "started" | "updated" | "completed",
  itemType: string | null,
  itemId: string | null,
  now: number,
) {
  if (kind === "completed") {
    return clearCompletedExecutionItem(diagnostic, itemType, itemId);
  }
  if (!isExecutionItemType(itemType)) {
    return false;
  }
  const executionItemKey = buildExecutionItemKey(itemType, itemId);
  if (diagnostic.activeExecutionItems.has(executionItemKey)) {
    return false;
  }
  diagnostic.activeExecutionItems.set(executionItemKey, {
    itemType,
    startedAt: now,
  });
  return true;
}

function buildAssistantSnapshotIngressKey(threadId: string, itemId: string) {
  return `${threadId}\u0000${itemId || "__anonymous__"}`;
}

function resolveAgentMessageSnapshotText(item: Record<string, unknown>) {
  return asString(
    item.text ?? item.content ?? item.output_text ?? item.outputText ?? "",
  );
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
    lastProgressAt: startedAt,
    lastProgressSource: "turn-start",
    firstDeltaAt: null,
    firstItemEventAt: null,
    firstItemEventKind: null,
    firstItemType: null,
    firstExecutionAt: null,
    firstExecutionEventKind: null,
    firstExecutionItemType: null,
    firstExecutionItemId: null,
    activeExecutionItems: new Map(),
    completedAt: null,
    errorAt: null,
    deltaCount: 0,
    itemEventCount: 0,
    progressSequence: 0,
    stallReported: false,
    noProgressSettled: false,
  };
}

function inferThreadEngine(threadId: string): "claude" | "codex" | "gemini" | "opencode" {
  if (threadId.startsWith("claude:") || threadId.startsWith("claude-pending-")) {
    return "claude";
  }
  if (threadId.startsWith("gemini:") || threadId.startsWith("gemini-pending-")) {
    return "gemini";
  }
  if (threadId.startsWith("opencode:") || threadId.startsWith("opencode-pending-")) {
    return "opencode";
  }
  return "codex";
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
  resolveClaudeContinuationThreadId?: (
    workspaceId: string,
    threadId: string,
    turnId?: string | null,
  ) => string | null;
  resolvePendingThreadForSession?: (
    workspaceId: string,
    engine: "claude" | "gemini" | "opencode",
  ) => string | null;
  resolvePendingThreadForTurn?: (
    workspaceId: string,
    engine: "claude" | "gemini" | "opencode",
    turnId: string | null | undefined,
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
  onTurnCompletedExternal?: (payload: {
    workspaceId: string;
    threadId: string;
    turnId: string;
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
  resolveClaudeContinuationThreadId,
  resolvePendingThreadForSession,
  resolvePendingThreadForTurn,
  getActiveTurnIdForThread,
  renamePendingMemoryCaptureKey,
  onAgentMessageCompletedExternal,
  onTurnCompletedExternal,
  onCollaborationModeResolved,
  onExitPlanModeToolCompleted,
}: ThreadEventHandlersOptions) {
  const { t } = useTranslation();
  const threadLifecycleSnapshotRef = useRef<Map<string, ThreadLifecycleSnapshot>>(new Map());
  const turnDiagnosticsRef = useRef<Map<string, TurnDiagnosticState>>(new Map());
  const turnFirstDeltaTimerRef = useRef<Map<string, number>>(new Map());
  const turnStallTimerRef = useRef<Map<string, number>>(new Map());
  const codexNoProgressTimerRef = useRef<Map<string, number>>(new Map());
  const settleCodexNoProgressTurnRef = useRef<((threadId: string) => void) | null>(null);
  const assistantSnapshotIngressLengthRef = useRef<Map<string, number>>(new Map());

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

  const clearFirstDeltaTimer = useCallback((threadId: string) => {
    const timerId = turnFirstDeltaTimerRef.current.get(threadId);
    if (timerId === undefined) {
      return;
    }
    window.clearTimeout(timerId);
    turnFirstDeltaTimerRef.current.delete(threadId);
  }, []);

  const clearTurnStallTimer = useCallback((threadId: string) => {
    const timerId = turnStallTimerRef.current.get(threadId);
    if (timerId === undefined) {
      return;
    }
    window.clearTimeout(timerId);
    turnStallTimerRef.current.delete(threadId);
  }, []);

  const clearCodexNoProgressTimer = useCallback((threadId: string) => {
    const timerId = codexNoProgressTimerRef.current.get(threadId);
    if (timerId === undefined) {
      return;
    }
    window.clearTimeout(timerId);
    codexNoProgressTimerRef.current.delete(threadId);
  }, []);

  const scheduleCodexNoProgressTimer = useCallback(
    (threadId: string) => {
      if (typeof window === "undefined" || inferThreadEngine(threadId) !== "codex") {
        return;
      }
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      if (!diagnostic || diagnostic.noProgressSettled) {
        return;
      }
      clearCodexNoProgressTimer(threadId);
      const now = Date.now();
      const timeoutMs = getCodexNoProgressTimeoutMs(diagnostic);
      const elapsedSinceProgressMs = Math.max(0, now - diagnostic.lastProgressAt);
      const delayMs = Math.max(0, timeoutMs - elapsedSinceProgressMs);
      const timerId = window.setTimeout(() => {
        const latestDiagnostic = turnDiagnosticsRef.current.get(threadId);
        if (
          !latestDiagnostic ||
          latestDiagnostic.noProgressSettled ||
          latestDiagnostic.completedAt !== null ||
          latestDiagnostic.errorAt !== null ||
          interruptedThreadsRef.current.has(threadId)
        ) {
          return;
        }
        const lifecycle = getThreadLifecycleSnapshot(threadId);
        if (
          !lifecycle.isProcessing ||
          (lifecycle.activeTurnId !== null && lifecycle.activeTurnId !== latestDiagnostic.turnId)
        ) {
          return;
        }
        const now = Date.now();
        const elapsedSinceProgressMs = Math.max(0, now - latestDiagnostic.lastProgressAt);
        const timeoutMs = getCodexNoProgressTimeoutMs(latestDiagnostic);
        if (elapsedSinceProgressMs < timeoutMs) {
          return;
        }
        latestDiagnostic.noProgressSettled = true;
        const activeExecutionItemTypes = listActiveExecutionItemTypes(latestDiagnostic);
        emitTurnDiagnostic("codex-no-progress-stalled", {
          ...buildCodexLivenessDiagnostic({
            workspaceId: latestDiagnostic.workspaceId,
            threadId,
            stage: "stalled",
            outcome: "failed",
            source: latestDiagnostic.lastProgressSource,
            reason: "codex foreground turn exceeded no-progress timeout",
            turnId: latestDiagnostic.turnId,
            lastEventAgeMs: elapsedSinceProgressMs,
          }),
          turnId: latestDiagnostic.turnId,
          elapsedMs: Math.max(0, now - latestDiagnostic.startedAt),
          elapsedSinceProgressMs,
          timeoutMs,
          progressSequence: latestDiagnostic.progressSequence,
          activeExecutionItemCount: latestDiagnostic.activeExecutionItems.size,
          activeExecutionItemTypes,
          isProcessing: lifecycle.isProcessing,
          activeTurnId: lifecycle.activeTurnId,
          diagnosticCategory: "codex-no-progress",
          ...buildThreadStreamCorrelationDimensions(threadId),
        }, { force: true });
        settleCodexNoProgressTurnRef.current?.(threadId);
      }, delayMs);
      codexNoProgressTimerRef.current.set(threadId, timerId);
    },
    [
      clearCodexNoProgressTimer,
      emitTurnDiagnostic,
      getThreadLifecycleSnapshot,
      interruptedThreadsRef,
    ],
  );

  const noteCodexTurnProgressEvidence = useCallback(
    (threadId: string, source: string) => {
      if (inferThreadEngine(threadId) !== "codex" || interruptedThreadsRef.current.has(threadId)) {
        return;
      }
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      if (!diagnostic || diagnostic.noProgressSettled) {
        return;
      }
      diagnostic.lastProgressAt = Date.now();
      diagnostic.lastProgressSource = source;
      diagnostic.progressSequence += 1;
      scheduleCodexNoProgressTimer(threadId);
    },
    [interruptedThreadsRef, scheduleCodexNoProgressTimer],
  );

  const scheduleFirstDeltaTimer = useCallback(
    (threadId: string) => {
      if (typeof window === "undefined") {
        return;
      }
      clearFirstDeltaTimer(threadId);
      const timerId = window.setTimeout(() => {
        if (interruptedThreadsRef.current.has(threadId)) {
          return;
        }
        const diagnostic = turnDiagnosticsRef.current.get(threadId);
        if (!diagnostic || diagnostic.firstDeltaAt !== null) {
          return;
        }
        const lifecycle = getThreadLifecycleSnapshot(threadId);
        const now = Date.now();
        const elapsedMs = Math.max(0, now - diagnostic.startedAt);
        reportThreadUpstreamPending(threadId, {
          elapsedMs,
          diagnosticCategory: "first-token-delay",
          reason: "waiting-for-first-delta",
        });
        emitTurnDiagnostic("waiting-for-first-delta", {
          workspaceId: diagnostic.workspaceId,
          threadId: diagnostic.threadId,
          turnId: diagnostic.turnId,
          elapsedMs,
          isProcessing: lifecycle.isProcessing,
          activeTurnId: lifecycle.activeTurnId,
          diagnosticCategory: "first-token-delay",
          ...buildThreadStreamCorrelationDimensions(threadId),
        }, { force: true });
      }, TURN_FIRST_DELTA_WARNING_MS);
      turnFirstDeltaTimerRef.current.set(threadId, timerId);
    },
    [clearFirstDeltaTimer, emitTurnDiagnostic, getThreadLifecycleSnapshot, interruptedThreadsRef],
  );

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
          ...buildThreadStreamCorrelationDimensions(threadId),
        }, { force: true });
      }, TURN_STALL_WARNING_MS);
      turnStallTimerRef.current.set(threadId, timerId);
    },
    [clearTurnStallTimer, emitTurnDiagnostic, getThreadLifecycleSnapshot],
  );

  const clearAssistantSnapshotIngressForThread = useCallback((threadId: string) => {
    const prefix = `${threadId}\u0000`;
    assistantSnapshotIngressLengthRef.current.forEach((_value, key) => {
      if (key.startsWith(prefix)) {
        assistantSnapshotIngressLengthRef.current.delete(key);
      }
    });
  }, []);

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
          ...buildThreadStreamCorrelationDimensions(threadId),
        });
      }
      if (isExecutionItemType(itemType) && diagnostic.firstExecutionAt === null) {
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
          ...buildThreadStreamCorrelationDimensions(threadId),
        });
      }
      if (applyActiveExecutionItemEvent(diagnostic, kind, itemType, itemId, now)) {
        scheduleCodexNoProgressTimer(threadId);
      }
    },
    [
      clearTurnStallTimer,
      emitTurnDiagnostic,
      getThreadLifecycleSnapshot,
      scheduleCodexNoProgressTimer,
    ],
  );

  const recordAssistantStreamIngress = useCallback(
    (payload: {
      workspaceId: string;
      threadId: string;
      itemId: string;
      textLength: number;
      source: "delta" | "snapshot";
    }) => {
      if (interruptedThreadsRef.current.has(payload.threadId)) {
        return;
      }
      const diagnostic = turnDiagnosticsRef.current.get(payload.threadId);
      if (!diagnostic) {
        return;
      }
      const deltaTimestamp = Date.now();
      noteThreadDeltaReceived(payload.threadId, deltaTimestamp);
      diagnostic.deltaCount += 1;
      if (diagnostic.firstDeltaAt !== null) {
        return;
      }
      diagnostic.firstDeltaAt = deltaTimestamp;
      clearFirstDeltaTimer(payload.threadId);
      scheduleTurnStallTimer(payload.threadId);
      const lifecycle = getThreadLifecycleSnapshot(payload.threadId);
      emitTurnDiagnostic("first-delta", {
        workspaceId: payload.workspaceId,
        threadId: payload.threadId,
        turnId: diagnostic.turnId,
        itemId: payload.itemId,
        deltaLength: payload.textLength,
        ingressSource: payload.source,
        elapsedMs: Math.max(0, diagnostic.firstDeltaAt - diagnostic.startedAt),
        isProcessing: lifecycle.isProcessing,
        activeTurnId: lifecycle.activeTurnId,
        ...buildThreadStreamCorrelationDimensions(payload.threadId),
      });
    },
    [
      clearFirstDeltaTimer,
      emitTurnDiagnostic,
      getThreadLifecycleSnapshot,
      interruptedThreadsRef,
      scheduleTurnStallTimer,
    ],
  );

  const maybeRecordAgentMessageSnapshotIngress = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      const itemType = asString(item.type).trim();
      if (itemType !== "agentMessage") {
        return;
      }
      const text = resolveAgentMessageSnapshotText(item);
      if (!text.trim()) {
        return;
      }
      const itemId = asString(item.id).trim();
      const ingressKey = buildAssistantSnapshotIngressKey(threadId, itemId);
      const previousLength =
        assistantSnapshotIngressLengthRef.current.get(ingressKey) ?? 0;
      const nextLength = text.length;
      if (nextLength <= previousLength) {
        return;
      }
      assistantSnapshotIngressLengthRef.current.set(ingressKey, nextLength);
      recordAssistantStreamIngress({
        workspaceId,
        threadId,
        itemId,
        textLength: nextLength,
        source: "snapshot",
      });
    },
    [recordAssistantStreamIngress],
  );

  useEffect(() => {
    const firstDeltaTimers = turnFirstDeltaTimerRef.current;
    const stallTimers = turnStallTimerRef.current;
    const codexNoProgressTimers = codexNoProgressTimerRef.current;
    const assistantSnapshotIngressLength = assistantSnapshotIngressLengthRef.current;
    return () => {
      firstDeltaTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      firstDeltaTimers.clear();
      stallTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      stallTimers.clear();
      codexNoProgressTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      codexNoProgressTimers.clear();
      assistantSnapshotIngressLength.clear();
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
    resolveClaudeContinuationThreadId,
  });
  const enqueueUserInputRequest = useThreadUserInputEvents({
    dispatch,
    resolveClaudeContinuationThreadId,
  });
  const onRequestUserInput = useCallback(
    (request: RequestUserInputRequest) => {
      enqueueUserInputRequest(request);
      const threadId =
        resolveClaudeContinuationThreadId?.(
          request.workspace_id,
          request.params.thread_id,
          request.params.turn_id,
        ) ?? request.params.thread_id;
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
    [
      dispatch,
      enqueueUserInputRequest,
      markProcessingTracked,
      resolveClaudeContinuationThreadId,
      setActiveTurnIdTracked,
    ],
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
    onNormalizedRealtimeEvent,
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
    resolvePendingThreadForTurn,
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
      dispatch({ type: "markContinuationEvidence", threadId });
      safeMessageActivity();
    },
    [dispatch, safeMessageActivity],
  );

  const onTurnStartedTracked = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      const startedAt = Date.now();
      clearAssistantSnapshotIngressForThread(threadId);
      noteThreadTurnStarted({
        workspaceId,
        threadId,
        turnId,
        startedAt,
      });
      clearTurnStallTimer(threadId);
      clearFirstDeltaTimer(threadId);
      turnDiagnosticsRef.current.set(
        threadId,
        createTurnDiagnosticState(workspaceId, threadId, turnId, startedAt),
      );
      scheduleFirstDeltaTimer(threadId);
      scheduleCodexNoProgressTimer(threadId);
      onTurnStarted(workspaceId, threadId, turnId);
      dispatch({ type: "markContinuationEvidence", threadId });
      const lifecycle = getThreadLifecycleSnapshot(threadId);
      emitTurnDiagnostic("started", {
        workspaceId,
        threadId,
        turnId,
        isProcessing: lifecycle.isProcessing,
        activeTurnId: lifecycle.activeTurnId,
        ...buildThreadStreamCorrelationDimensions(threadId),
      });
    },
    [
      clearFirstDeltaTimer,
      clearTurnStallTimer,
      dispatch,
      emitTurnDiagnostic,
      getThreadLifecycleSnapshot,
      onTurnStarted,
      scheduleCodexNoProgressTimer,
      scheduleFirstDeltaTimer,
      clearAssistantSnapshotIngressForThread,
    ],
  );

  const onAgentMessageDeltaTracked = useCallback(
    (payload: {
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
    }) => {
      onAgentMessageDelta(payload);
      dispatch({ type: "markContinuationEvidence", threadId: payload.threadId });
      if (interruptedThreadsRef.current.has(payload.threadId)) {
        return;
      }
      noteCodexTurnProgressEvidence(payload.threadId, "agent-message-delta");
      recordAssistantStreamIngress({
        workspaceId: payload.workspaceId,
        threadId: payload.threadId,
        itemId: payload.itemId,
        textLength: payload.delta.length,
        source: "delta",
      });
    },
    [
      dispatch,
      interruptedThreadsRef,
      noteCodexTurnProgressEvidence,
      onAgentMessageDelta,
      recordAssistantStreamIngress,
    ],
  );

  const onItemStartedTracked = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      onItemStarted(workspaceId, threadId, item);
      dispatch({ type: "markContinuationEvidence", threadId });
      noteCodexTurnProgressEvidence(threadId, "item-started");
      maybeRecordAgentMessageSnapshotIngress(workspaceId, threadId, item);
      captureTurnItemDiagnostic(threadId, "started", item);
    },
    [
      captureTurnItemDiagnostic,
      dispatch,
      maybeRecordAgentMessageSnapshotIngress,
      noteCodexTurnProgressEvidence,
      onItemStarted,
    ],
  );

  const onItemUpdatedTracked = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      onItemUpdated(workspaceId, threadId, item);
      dispatch({ type: "markContinuationEvidence", threadId });
      noteCodexTurnProgressEvidence(threadId, "item-updated");
      maybeRecordAgentMessageSnapshotIngress(workspaceId, threadId, item);
      captureTurnItemDiagnostic(threadId, "updated", item);
    },
    [
      captureTurnItemDiagnostic,
      dispatch,
      maybeRecordAgentMessageSnapshotIngress,
      noteCodexTurnProgressEvidence,
      onItemUpdated,
    ],
  );

  const onItemCompletedTracked = useCallback(
    (workspaceId: string, threadId: string, item: Record<string, unknown>) => {
      onItemCompleted(workspaceId, threadId, item);
      dispatch({ type: "markContinuationEvidence", threadId });
      noteCodexTurnProgressEvidence(threadId, "item-completed");
      captureTurnItemDiagnostic(threadId, "completed", item);
    },
    [captureTurnItemDiagnostic, dispatch, noteCodexTurnProgressEvidence, onItemCompleted],
  );

  const shouldSkipLateCodexNormalizedEvent = useCallback(
    (event: NormalizedThreadEvent) => {
      if (event.engine !== "codex") {
        return false;
      }
      const eventTurnId = asString(event.turnId).trim();
      if (!eventTurnId) {
        return false;
      }
      const diagnosticTurnId = turnDiagnosticsRef.current.get(event.threadId)?.turnId ?? null;
      const activeTurnId = getThreadLifecycleSnapshot(event.threadId).activeTurnId;
      const expectedTurnId = diagnosticTurnId ?? activeTurnId;
      if (!expectedTurnId || expectedTurnId === eventTurnId) {
        return false;
      }
      emitTurnDiagnostic("late-codex-event-skipped", {
        ...buildCodexLivenessDiagnostic({
          workspaceId: event.workspaceId,
          threadId: event.threadId,
          stage: "abandoned",
          outcome: "abandoned",
          source: event.sourceMethod,
          reason: "event turn id does not match active Codex turn",
          turnId: eventTurnId,
        }),
        eventTurnId,
        activeTurnId,
        expectedTurnId,
        operation: event.operation,
        sourceMethod: event.sourceMethod,
        diagnosticCategory: "late-codex-event",
      }, { force: true });
      return true;
    },
    [emitTurnDiagnostic, getThreadLifecycleSnapshot],
  );

  const onNormalizedRealtimeEventTracked = useCallback(
    (event: NormalizedThreadEvent) => {
      if (shouldSkipLateCodexNormalizedEvent(event)) {
        return;
      }
      onNormalizedRealtimeEvent(event);
      dispatch({ type: "markContinuationEvidence", threadId: event.threadId });
      noteCodexTurnProgressEvidence(event.threadId, `normalized:${event.operation}`);
      if (event.operation === "appendAgentMessageDelta") {
        const textLength =
          event.delta?.length ??
          (event.item.kind === "message" ? event.item.text.length : 0);
        if (textLength > 0 && event.item.kind === "message") {
          recordAssistantStreamIngress({
            workspaceId: event.workspaceId,
            threadId: event.threadId,
            itemId: event.item.id,
            textLength,
            source:
              event.sourceMethod === "item/started" ||
              event.sourceMethod === "item/updated"
                ? "snapshot"
                : "delta",
          });
        }
      }
      if (!event.rawItem) {
        return;
      }
      if (event.operation === "itemStarted" || event.operation === "itemUpdated") {
        maybeRecordAgentMessageSnapshotIngress(
          event.workspaceId,
          event.threadId,
          event.rawItem,
        );
      }
      if (event.operation === "itemStarted") {
        captureTurnItemDiagnostic(event.threadId, "started", event.rawItem);
        return;
      }
      if (event.operation === "itemUpdated") {
        captureTurnItemDiagnostic(event.threadId, "updated", event.rawItem);
        return;
      }
      if (event.operation === "itemCompleted") {
        captureTurnItemDiagnostic(event.threadId, "completed", event.rawItem);
      }
    },
    [
      captureTurnItemDiagnostic,
      dispatch,
      maybeRecordAgentMessageSnapshotIngress,
      noteCodexTurnProgressEvidence,
      onNormalizedRealtimeEvent,
      recordAssistantStreamIngress,
      shouldSkipLateCodexNormalizedEvent,
    ],
  );

  const finalizeTurnDiagnostic = useCallback(
    (
      threadId: string,
      finalState: "completed" | "error",
      payload?: Record<string, unknown>,
    ) => {
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      clearFirstDeltaTimer(threadId);
      clearTurnStallTimer(threadId);
      clearCodexNoProgressTimer(threadId);
      if (!diagnostic) {
        return;
      }
      const now = Date.now();
      if (finalState === "completed") {
        diagnostic.completedAt = now;
      } else {
        diagnostic.errorAt = now;
      }
      const rawMessage =
        typeof payload?.message === "string" ? payload.message : null;
      const firstPacketTimeoutSeconds =
        rawMessage ? parseFirstPacketTimeoutSeconds(rawMessage) : null;
      if (diagnostic.firstDeltaAt === null && finalState === "error") {
        reportThreadUpstreamPending(threadId, {
          elapsedMs: Math.max(0, now - diagnostic.startedAt),
          diagnosticCategory:
            firstPacketTimeoutSeconds !== null
              ? "first-packet-timeout"
              : "first-token-delay",
          reason: firstPacketTimeoutSeconds !== null ? "first-packet-timeout" : "turn-error",
          firstPacketTimeoutSeconds,
          message: rawMessage,
        });
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
        firstPacketTimeoutSeconds,
        ...buildThreadStreamCorrelationDimensions(threadId),
        ...payload,
      }, { force: finalState === "error" || diagnostic.stallReported });
      turnDiagnosticsRef.current.delete(threadId);
      clearAssistantSnapshotIngressForThread(threadId);
      completeThreadStreamTurn(threadId);
    },
    [
      clearAssistantSnapshotIngressForThread,
      clearFirstDeltaTimer,
      clearTurnStallTimer,
      clearCodexNoProgressTimer,
      emitTurnDiagnostic,
      getThreadLifecycleSnapshot,
    ],
  );

  const onTurnCompletedTracked = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      const handled = onTurnCompleted(workspaceId, threadId, turnId);
      if (handled) {
        onTurnCompletedExternal?.({ workspaceId, threadId, turnId });
      }
      const diagnostic = turnDiagnosticsRef.current.get(threadId);
      if (diagnostic && diagnostic.turnId !== turnId) {
        return;
      }
      finalizeTurnDiagnostic(threadId, "completed");
    },
    [finalizeTurnDiagnostic, onTurnCompleted, onTurnCompletedExternal],
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
        source: string;
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
        source: payload.source,
        startedAtMs: payload.startedAtMs,
        timeoutMs: payload.timeoutMs,
      });
    },
    [finalizeTurnDiagnostic, onTurnStalled],
  );

  settleCodexNoProgressTurnRef.current = (threadId: string) => {
    const diagnostic = turnDiagnosticsRef.current.get(threadId);
    if (!diagnostic) {
      return;
    }
    const timeoutMs = getCodexNoProgressTimeoutMs(diagnostic);
    onTurnStalledTracked(diagnostic.workspaceId, threadId, diagnostic.turnId, {
      message: t("threads.codexNoProgressStalled", {
        seconds: String(Math.round(timeoutMs / 1000)),
      }),
      reasonCode: "codex_no_progress_timeout",
      stage: "stalled",
      source: "codex-foreground-no-progress",
      startedAtMs: diagnostic.startedAt,
      timeoutMs,
    });
  };

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
      onNormalizedRealtimeEvent: onNormalizedRealtimeEventTracked,
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
      onNormalizedRealtimeEventTracked,
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
