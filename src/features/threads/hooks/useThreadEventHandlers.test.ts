// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CODEX_EXECUTION_ACTIVE_NO_PROGRESS_STALL_MS,
  CODEX_TURN_NO_PROGRESS_STALL_MS,
  useThreadEventHandlers,
} from "./useThreadEventHandlers";
import { useThreadItemEvents } from "./useThreadItemEvents";
import {
  noteThreadVisibleRender,
  primeThreadStreamLatencyContext,
  resetThreadStreamLatencyDiagnosticsForTests,
} from "../utils/streamLatencyDiagnostics";

const turnHookFactory = vi.hoisted(() => {
  let latestOptions: Record<string, unknown> | null = null;
  let onTurnCompletedOverride:
    | ((_workspaceId: string, threadId: string, turnId: string) => boolean)
    | null = null;
  return {
    setLatestOptions(options: Record<string, unknown>) {
      latestOptions = options;
    },
    getLatestOptions() {
      return latestOptions;
    },
    setOnTurnCompletedOverride(
      handler: ((_workspaceId: string, threadId: string, turnId: string) => boolean) | null,
    ) {
      onTurnCompletedOverride = handler;
    },
    getOnTurnCompletedOverride() {
      return onTurnCompletedOverride;
    },
  };
});

const streamLatencyMocks = vi.hoisted(() => ({
  getCurrentClaudeConfig: vi.fn(),
  appendRendererDiagnostic: vi.fn(),
  isWindowsPlatform: vi.fn(),
  isMacPlatform: vi.fn(),
}));

const itemHookFactory = vi.hoisted(() => {
  let flushPendingRealtimeEvents = vi.fn();
  let isRealtimeTurnTerminalExact = vi.fn(() => false);
  let noteRealtimeTurnStarted = vi.fn();
  let markRealtimeTurnTerminal = vi.fn();
  return {
    reset() {
      flushPendingRealtimeEvents = vi.fn();
      isRealtimeTurnTerminalExact = vi.fn(() => false);
      noteRealtimeTurnStarted = vi.fn();
      markRealtimeTurnTerminal = vi.fn();
    },
    getFlushPendingRealtimeEvents() {
      return flushPendingRealtimeEvents;
    },
    getIsRealtimeTurnTerminalExact() {
      return isRealtimeTurnTerminalExact;
    },
    getNoteRealtimeTurnStarted() {
      return noteRealtimeTurnStarted;
    },
    getMarkRealtimeTurnTerminal() {
      return markRealtimeTurnTerminal;
    },
  };
});

vi.mock("./useThreadApprovalEvents", () => ({
  useThreadApprovalEvents: vi.fn(() => vi.fn()),
}));

vi.mock("./useThreadUserInputEvents", () => ({
  useThreadUserInputEvents: vi.fn(() => vi.fn()),
}));

vi.mock("../utils/networkErrors", () => ({
  parseFirstPacketTimeoutSeconds: vi.fn(() => null),
  stripBackendErrorPrefix: (value: string) => value,
}));

vi.mock("../utils/claudeMcpRuntimeSnapshot", () => ({
  captureClaudeMcpRuntimeSnapshotFromRaw: vi.fn(() => null),
}));

vi.mock("../utils/realtimePerfFlags", () => ({
  isDebugLightPathEnabled: vi.fn(() => false),
}));

vi.mock("../../../services/tauri", () => ({
  getCurrentClaudeConfig: streamLatencyMocks.getCurrentClaudeConfig,
}));

vi.mock("../../../services/rendererDiagnostics", () => ({
  appendRendererDiagnostic: streamLatencyMocks.appendRendererDiagnostic,
}));

vi.mock("../../../utils/platform", () => ({
  isWindowsPlatform: streamLatencyMocks.isWindowsPlatform,
  isMacPlatform: streamLatencyMocks.isMacPlatform,
}));

vi.mock("./useThreadTurnEvents", () => ({
  useThreadTurnEvents: vi.fn((options: Record<string, unknown>) => {
    turnHookFactory.setLatestOptions(options);
    return {
      onThreadStarted: vi.fn(),
      onTurnStarted: (_workspaceId: string, threadId: string, turnId: string) => {
        const markProcessing = turnHookFactory.getLatestOptions()?.markProcessing as
          | ((threadId: string, isProcessing: boolean) => void)
          | undefined;
        const setActiveTurnId = turnHookFactory.getLatestOptions()?.setActiveTurnId as
          | ((threadId: string, turnId: string | null) => void)
          | undefined;
        markProcessing?.(threadId, true);
        setActiveTurnId?.(threadId, turnId);
      },
      onTurnCompleted: (workspaceId: string, threadId: string, turnId: string) => {
        const override = turnHookFactory.getOnTurnCompletedOverride();
        if (override) {
          return override(workspaceId, threadId, turnId);
        }
        const markProcessing = turnHookFactory.getLatestOptions()?.markProcessing as
          | ((threadId: string, isProcessing: boolean) => void)
          | undefined;
        const setActiveTurnId = turnHookFactory.getLatestOptions()?.setActiveTurnId as
          | ((threadId: string, turnId: string | null) => void)
          | undefined;
        markProcessing?.(threadId, false);
        setActiveTurnId?.(threadId, null);
        return true;
      },
      onTurnPlanUpdated: vi.fn(),
      onThreadTokenUsageUpdated: vi.fn(),
      onAccountRateLimitsUpdated: vi.fn(),
      onTurnError: (
        _workspaceId: string,
        threadId: string,
        _turnId: string,
        payload: { willRetry: boolean },
      ) => {
        if (payload.willRetry) {
          return;
        }
        const markProcessing = turnHookFactory.getLatestOptions()?.markProcessing as
          | ((threadId: string, isProcessing: boolean) => void)
          | undefined;
        const setActiveTurnId = turnHookFactory.getLatestOptions()?.setActiveTurnId as
          | ((threadId: string, turnId: string | null) => void)
          | undefined;
        markProcessing?.(threadId, false);
        setActiveTurnId?.(threadId, null);
      },
      onTurnStalled: (
        _workspaceId: string,
        threadId: string,
      ) => {
        const markProcessing = turnHookFactory.getLatestOptions()?.markProcessing as
          | ((threadId: string, isProcessing: boolean) => void)
          | undefined;
        const setActiveTurnId = turnHookFactory.getLatestOptions()?.setActiveTurnId as
          | ((threadId: string, turnId: string | null) => void)
          | undefined;
        markProcessing?.(threadId, false);
        setActiveTurnId?.(threadId, null);
      },
      onContextCompacting: vi.fn(),
      onContextCompacted: vi.fn(),
      onContextCompactionFailed: vi.fn(),
      onThreadSessionIdUpdated: vi.fn(),
    };
  }),
}));

vi.mock("./useThreadItemEvents", () => ({
  useThreadItemEvents: vi.fn(() => ({
    onAgentMessageDelta: vi.fn(),
    onAgentMessageCompleted: vi.fn(),
    onNormalizedRealtimeEvent: vi.fn(),
    onItemStarted: vi.fn(),
    onItemUpdated: vi.fn(),
    onItemCompleted: vi.fn(),
    onReasoningSummaryDelta: vi.fn(),
    onReasoningSummaryBoundary: vi.fn(),
    onReasoningTextDelta: vi.fn(),
    onCommandOutputDelta: vi.fn(),
    onTerminalInteraction: vi.fn(),
    onFileChangeOutputDelta: vi.fn(),
    flushPendingRealtimeEvents: itemHookFactory.getFlushPendingRealtimeEvents(),
    isRealtimeTurnTerminalExact: itemHookFactory.getIsRealtimeTurnTerminalExact(),
    noteRealtimeTurnStarted: itemHookFactory.getNoteRealtimeTurnStarted(),
    markRealtimeTurnTerminal: itemHookFactory.getMarkRealtimeTurnTerminal(),
  })),
}));

function makeOptions(onDebug = vi.fn()) {
  return {
    activeThreadId: null,
    dispatch: vi.fn(),
    getCustomName: vi.fn(() => undefined),
    resolveCollaborationUiMode: undefined,
    isAutoTitlePending: vi.fn(() => false),
    isThreadHidden: vi.fn(() => false),
    markProcessing: vi.fn(),
    markReviewing: vi.fn(),
    setActiveTurnId: vi.fn(),
    codexCompactionInFlightByThreadRef: { current: {} as Record<string, boolean> },
    safeMessageActivity: vi.fn(),
    recordThreadActivity: vi.fn(),
    pushThreadErrorMessage: vi.fn(),
    onDebug,
    onWorkspaceConnected: vi.fn(),
    applyCollabThreadLinks: vi.fn(),
    approvalAllowlistRef: { current: {} },
    pendingInterruptsRef: { current: new Set<string>() },
    interruptedThreadsRef: { current: new Set<string>() },
    renameCustomNameKey: vi.fn(),
    renameAutoTitlePendingKey: vi.fn(),
    renameThreadTitleMapping: vi.fn(),
    resolveClaudeContinuationThreadId: undefined as
      | ((workspaceId: string, threadId: string, turnId?: string | null) => string | null)
      | undefined,
    resolvePendingThreadForSession: vi.fn(() => null),
    getActiveTurnIdForThread: vi.fn(() => null),
    renamePendingMemoryCaptureKey: vi.fn(),
    onAgentMessageCompletedExternal: vi.fn(),
    onCollaborationModeResolved: vi.fn(),
    onExitPlanModeToolCompleted: vi.fn(),
  };
}

function collectDiagnosticCalls(onDebug: ReturnType<typeof vi.fn>) {
  return onDebug.mock.calls
    .map(([entry]) => entry)
    .filter(
      (entry): entry is { label: string; payload: Record<string, unknown> } =>
        typeof entry?.label === "string" &&
        entry.label.startsWith("thread/session:turn-diagnostic:"),
    );
}

describe("useThreadEventHandlers diagnostics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T10:00:00.000Z"));
    turnHookFactory.setOnTurnCompletedOverride(null);
    itemHookFactory.reset();
    window.localStorage.removeItem("ccgui.debug.turnDiagnosticsVerbose");
    streamLatencyMocks.getCurrentClaudeConfig.mockReset();
    streamLatencyMocks.appendRendererDiagnostic.mockReset();
    streamLatencyMocks.isWindowsPlatform.mockReset();
    streamLatencyMocks.isMacPlatform.mockReset();
    streamLatencyMocks.isWindowsPlatform.mockReturnValue(false);
    streamLatencyMocks.isMacPlatform.mockReturnValue(false);
    resetThreadStreamLatencyDiagnosticsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("emits a stalled-after-first-delta diagnostic when execution never starts", () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "msg-1",
        delta: "hello",
      });
    });

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).toContain("thread/session:turn-diagnostic:stalled-after-first-delta");

    const stalledEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:stalled-after-first-delta",
    );
    expect(stalledEntry?.payload.isProcessing).toBe(true);
    expect(stalledEntry?.payload.activeTurnId).toBe("turn-1");
    expect(stalledEntry?.payload.hasExecutionItem).toBe(false);
  });

  it("emits a waiting-for-first-delta diagnostic when no chunk arrives", () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(6_000);
    });

    const waitingEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:waiting-for-first-delta",
    );

    expect(waitingEntry?.payload.diagnosticCategory).toBe("first-token-delay");
    expect(waitingEntry?.payload.latencyCategory).toBe("upstream-pending");
  });

  it("settles requestUserInput modeBlocked events through the shared waiting-for-user-choice path", () => {
    const options = makeOptions();
    options.resolveClaudeContinuationThreadId = vi.fn(
      (_workspaceId: string, threadId: string) =>
        threadId === "thread-native" ? "shared:thread-1" : threadId,
    );
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-native", "turn-1");
    });

    options.dispatch.mockClear();
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onModeBlocked({
        workspace_id: "ws-1",
        params: {
          thread_id: "thread-native",
          blocked_method: "",
          effective_mode: "code",
          reason_code: "request_user_input_blocked_in_default_mode",
          reason: "request blocked",
          suggestion: "Switch to Plan mode",
          request_id: "req-1",
        },
      });
    });

    expect(options.markProcessing).toHaveBeenCalledWith("shared:thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("shared:thread-1", null);
    expect(options.dispatch).toHaveBeenCalledWith({
      type: "removeUserInputRequest",
      requestId: "req-1",
      workspaceId: "ws-1",
    });
    expect(options.dispatch).toHaveBeenCalledWith({
      type: "settleThreadPlanInProgress",
      threadId: "shared:thread-1",
      targetStatus: "pending",
    });
    expect(options.dispatch).toHaveBeenCalledWith({
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "shared:thread-1",
      item: expect.objectContaining({
        id: "mode-blocked-shared:thread-1-req-1",
        toolType: "modeBlocked",
        title: "Tool: askuserquestion",
        detail: "item/tool/requestUserInput",
        status: "completed",
      }),
      hasCustomName: false,
    });
  });

  it("keeps non-requestUserInput modeBlocked events explanatory only", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onModeBlocked({
        workspace_id: "ws-1",
        params: {
          thread_id: "thread-1",
          blocked_method: "item/tool/fileChange",
          effective_mode: "plan",
          reason_code: "plan_readonly_violation",
          reason: "write blocked",
          suggestion: "Switch to Default mode",
        },
      });
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);
    expect(options.dispatch).not.toHaveBeenCalledWith({
      type: "settleThreadPlanInProgress",
      threadId: "thread-1",
      targetStatus: "pending",
    });
    expect(options.dispatch).toHaveBeenCalledWith({
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "thread-1",
      item: expect.objectContaining({
        toolType: "modeBlocked",
        title: "Tool: mode policy",
        detail: "item/tool/fileChange",
        status: "completed",
      }),
      hasCustomName: false,
    });
  });

  it("marks codex foreground turns as suspected after the bounded no-progress window", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);
    expect(itemHookFactory.getMarkRealtimeTurnTerminal()).not.toHaveBeenCalled();
    expect(options.dispatch).toHaveBeenCalledWith({
      type: "markCodexSilentSuspected",
      threadId: "thread-1",
      timestamp: Date.now(),
      source: "frontend-no-progress-suspected",
    });
    const suspectedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
    );
    expect(suspectedEntry?.payload.diagnosticCategory).toBe("codex-no-progress");
    expect(suspectedEntry?.payload.turnId).toBe("turn-1");
    expect(suspectedEntry?.payload.source).toBe("frontend-no-progress-suspected");
    expect(suspectedEntry?.payload.terminal).toBe(false);
    expect(suspectedEntry?.payload.quarantine).toBe(false);
  });

  it("keeps execution-active codex turns out of stalled state at the base window", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "cmd-1",
        type: "commandExecution",
      });
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-stalled",
      ),
    ).toBe(false);

    act(() => {
      vi.advanceTimersByTime(15 * 60_000 - CODEX_TURN_NO_PROGRESS_STALL_MS);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);

    act(() => {
      vi.advanceTimersByTime(CODEX_EXECUTION_ACTIVE_NO_PROGRESS_STALL_MS - 15 * 60_000);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    const suspectedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
    );
    expect(suspectedEntry?.payload.timeoutMs).toBe(
      CODEX_EXECUTION_ACTIVE_NO_PROGRESS_STALL_MS,
    );
    expect(suspectedEntry?.payload.activeExecutionItemCount).toBe(1);
  });

  it("allows late codex normalized events after frontend no-progress suspicion", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS);
    });

    options.dispatch.mockClear();
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();
    onDebug.mockClear();

    act(() => {
      result.current.onNormalizedRealtimeEvent({
        engine: "codex",
        workspaceId: "ws-1",
        threadId: "thread-1",
        eventId: "late-event-1",
        itemKind: "message",
        timestampMs: Date.now(),
        item: {
          kind: "message",
          id: "assistant-late",
          role: "assistant",
          text: "late predecessor output",
        },
        operation: "appendAgentMessageDelta",
        sourceMethod: "item/updated",
        delta: "late predecessor output",
        rawItem: null,
        rawUsage: null,
        turnId: "turn-1",
      });
    });

    expect(options.dispatch).toHaveBeenCalledWith({
      type: "markContinuationEvidence",
      threadId: "thread-1",
    });
    expect(options.dispatch).toHaveBeenCalledWith({
      type: "clearCodexSilentSuspected",
      threadId: "thread-1",
    });
    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", true);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", "turn-1");
    const skippedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:quarantined-codex-event-skipped",
    );
    expect(skippedEntry).toBeUndefined();
    const recoveredEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-recovered",
    );
    expect(recoveredEntry?.payload.turnId).toBe("turn-1");
    expect(recoveredEntry?.payload.progressSource).toBe("normalized:appendAgentMessageDelta");

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-2");
    });
    options.dispatch.mockClear();
    onDebug.mockClear();

    act(() => {
      result.current.onNormalizedRealtimeEvent({
        engine: "codex",
        workspaceId: "ws-1",
        threadId: "thread-1",
        eventId: "successor-event-1",
        itemKind: "message",
        timestampMs: Date.now(),
        item: {
          kind: "message",
          id: "assistant-successor",
          role: "assistant",
          text: "successor output",
        },
        operation: "appendAgentMessageDelta",
        sourceMethod: "item/updated",
        delta: "successor output",
        rawItem: null,
        rawUsage: null,
        turnId: "turn-2",
      });
    });

    expect(options.dispatch).toHaveBeenCalledWith({
      type: "markContinuationEvidence",
      threadId: "thread-1",
    });
    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:quarantined-codex-event-skipped",
      ),
    ).toBe(false);
  });

  it("keeps backend-stalled late raw codex item events diagnostic-only", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onTurnStalled("ws-1", "thread-1", "turn-1", {
        message: "runtime reported stalled",
        reasonCode: "resume_pending_timeout",
        stage: "stalled",
        source: "turn/stalled",
        startedAtMs: null,
        timeoutMs: 600_000,
      });
    });

    options.dispatch.mockClear();
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();
    onDebug.mockClear();

    act(() => {
      result.current.onItemUpdated("ws-1", "thread-1", {
        id: "cmd-1",
        type: "commandExecution",
        turnId: "turn-1",
      });
    });

    expect(options.dispatch).not.toHaveBeenCalled();
    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", true);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", "turn-1");
    const skippedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:quarantined-codex-event-skipped",
    );
    expect(skippedEntry?.payload.eventTurnId).toBe("turn-1");
    expect(skippedEntry?.payload.quarantineReason).toBe("resume_pending_timeout");
  });

  it("does not quarantine shared claude stalled turns as codex", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted(
        "ws-1",
        "shared:thread-claude-stalled",
        "turn-claude-1",
      );
      result.current.onTurnStalled(
        "ws-1",
        "shared:thread-claude-stalled",
        "turn-claude-1",
        {
          message: "runtime reported stalled",
          reasonCode: "resume_pending_timeout",
          stage: "stalled",
          source: "turn/stalled",
          startedAtMs: null,
          timeoutMs: 600_000,
          engine: "claude",
        },
      );
    });

    options.dispatch.mockClear();
    onDebug.mockClear();

    act(() => {
      result.current.onItemUpdated("ws-1", "shared:thread-claude-stalled", {
        id: "cmd-claude-1",
        type: "commandExecution",
        turnId: "turn-claude-1",
      });
    });

    expect(options.dispatch).toHaveBeenCalledWith({
      type: "markContinuationEvidence",
      threadId: "shared:thread-claude-stalled",
    });
    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:quarantined-codex-event-skipped",
      ),
    ).toBe(false);
  });

  it("returns to the base no-progress window when an execution completion only carries item id", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "cmd-1",
        type: "commandExecution",
      });
      vi.advanceTimersByTime(60_000);
      result.current.onItemCompleted("ws-1", "thread-1", {
        id: "cmd-1",
      });
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    const suspectedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
    );
    expect(suspectedEntry?.payload.timeoutMs).toBe(CODEX_TURN_NO_PROGRESS_STALL_MS);
    expect(suspectedEntry?.payload.activeExecutionItemCount).toBe(0);
  });

  it("resets codex no-progress settlement when turn progress arrives", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "msg-1",
        delta: "still working",
      });
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
      ),
    ).toBe(true);
  });

  it("treats codex processing heartbeat as no-progress evidence", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
      result.current.onProcessingHeartbeat("ws-1", "thread-1", 1);
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
      ),
    ).toBe(false);
  });

  it("treats codex token usage updates as no-progress evidence", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
      result.current.onThreadTokenUsageUpdated("ws-1", "thread-1", {
        total_tokens: 32,
      });
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
      ),
    ).toBe(false);
  });

  it("treats codex active status events as no-progress evidence", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
      result.current.onAppServerEvent({
        workspace_id: "ws-1",
        message: {
          method: "thread/status/changed",
          params: {
            thread_id: "thread-1",
            turn_id: "turn-1",
            status: "active",
          },
        },
      });
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
      ),
    ).toBe(false);
  });

  it("does not treat uncorrelated codex status events as no-progress evidence", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS - 1_000);
      result.current.onAppServerEvent({
        workspace_id: "ws-1",
        message: {
          method: "thread/status/changed",
          params: {
            thread_id: "thread-1",
            status: "active",
          },
        },
      });
      vi.advanceTimersByTime(1_000);
    });

    expect(
      collectDiagnosticCalls(onDebug).some(
        (entry) => entry.label === "thread/session:turn-diagnostic:codex-no-progress-suspected",
      ),
    ).toBe(true);
  });

  it("does not apply the codex no-progress settlement to non-codex turns", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "claude:session-1", "turn-1");
      vi.advanceTimersByTime(CODEX_TURN_NO_PROGRESS_STALL_MS);
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("claude:session-1", false);
    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).not.toContain("thread/session:turn-diagnostic:codex-no-progress-stalled");
    expect(labels).not.toContain("thread/session:turn-diagnostic:codex-no-progress-suspected");
  });

  it("cancels the stall warning once the first execution item arrives", () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "msg-1",
        delta: "hello",
      });
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "cmd-1",
        type: "commandExecution",
      });
    });

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).not.toContain("thread/session:turn-diagnostic:stalled-after-first-delta");
  });

  it("keeps normal conversations silent by default", () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "msg-1",
        delta: "hello",
      });
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "cmd-1",
        type: "commandExecution",
      });
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(collectDiagnosticCalls(onDebug)).toEqual([]);
  });

  it("defers codex turn completion while a child agent tool is still active", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);
    const deferredEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:turn-completed-deferred",
    );
    expect(deferredEntry?.payload.diagnosticCategory).toBe("codex-collab-terminal-order");
    expect(deferredEntry?.payload.blockerCount).toBe(1);

    act(() => {
      result.current.onItemCompleted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
      });
    });

    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const flushedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:turn-completed-deferred-flushed",
    );
    expect(flushedEntry?.payload.diagnosticCategory).toBe("codex-collab-terminal-order");
  });

  it("flushes deferred codex completion from final assistant text with remaining child blockers", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "final answer",
      });
    });

    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const flushedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:turn-completed-deferred-flushed",
    );
    expect(flushedEntry?.payload.source).toBe("assistant-completed");
    expect(flushedEntry?.payload.forcedByAssistantCompletion).toBe(true);
    expect(flushedEntry?.payload.remainingBlockers).toEqual([
      expect.objectContaining({
        itemType: "collabAgentToolCall",
        status: null,
      }),
    ]);
  });

  it("flushes deferred codex completion after final assistant text even when child status is explicitly running", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
        status: "running",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "partial answer while child runs",
      });
    });

    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const flushedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:turn-completed-deferred-flushed",
    );
    expect(flushedEntry?.payload.source).toBe("assistant-completed");
    expect(flushedEntry?.payload.forcedByAssistantCompletion).toBe(true);
    expect(flushedEntry?.payload.remainingBlockers).toEqual([
      expect.objectContaining({
        itemType: "collabAgentToolCall",
        status: "running",
      }),
    ]);
  });

  it("bypasses codex completion deferral when final assistant text arrived before turn completion", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
      });
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "final answer",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).not.toContain("thread/session:turn-diagnostic:turn-completed-deferred");
    const bypassedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:turn-completed-deferred-bypassed",
    );
    expect(bypassedEntry?.payload.diagnosticCategory).toBe("codex-collab-terminal-order");
    expect(bypassedEntry?.payload.assistantCompletedItemId).toBe("assistant-1");
  });

  it("bypasses codex completion deferral after final assistant text even when child is explicitly running", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
        status: "running",
      });
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "final answer",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).not.toContain("thread/session:turn-diagnostic:turn-completed-deferred");
    const bypassedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:turn-completed-deferred-bypassed",
    );
    expect(bypassedEntry?.payload.assistantCompletedItemId).toBe("assistant-1");
    expect(bypassedEntry?.payload.remainingBlockers).toEqual([
      expect.objectContaining({
        itemType: "collabAgentToolCall",
        status: "running",
      }),
    ]);
  });

  it("applies conservative fallback settlement when final assistant output is visible and no newer turn exists", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const rejectCompletion = vi.fn(() => false);
    turnHookFactory.setOnTurnCompletedOverride(rejectCompletion);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "final answer",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(rejectCompletion).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");
    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const fallbackEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:terminal-settlement-fallback-applied",
    );
    expect(fallbackEntry?.payload).toEqual(
      expect.objectContaining({
        workspaceId: "ws-1",
        threadId: "thread-1",
        turnId: "turn-1",
        assistantCompletedItemId: "assistant-1",
        diagnosticCategory: "frontend-terminal-settlement",
        reason: "turn-completed-settlement-fallback-applied",
      }),
    );
  });

  it("does not apply fallback settlement when a newer active turn already exists", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const rejectCompletion = vi.fn(() => false);
    turnHookFactory.setOnTurnCompletedOverride(rejectCompletion);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "final answer",
      });
      result.current.onTurnStarted("ws-1", "thread-1", "turn-2");
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(rejectCompletion).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");
    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);
    const fallbackEntry = collectDiagnosticCalls(onDebug).find(
      (entry) =>
        entry.label ===
        "thread/session:turn-diagnostic:terminal-settlement-fallback-applied",
    );
    expect(fallbackEntry).toBeUndefined();
  });

  it("flushes pending realtime batches before completed turn settlement clears processing", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    const flushPendingRealtimeEvents =
      itemHookFactory.getFlushPendingRealtimeEvents();
    const markRealtimeTurnTerminal =
      itemHookFactory.getMarkRealtimeTurnTerminal();
    expect(flushPendingRealtimeEvents).toHaveBeenCalledTimes(1);
    expect(markRealtimeTurnTerminal).toHaveBeenCalledWith("thread-1", "turn-1");
    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(
      flushPendingRealtimeEvents.mock.invocationCallOrder[0],
    ).toBeLessThan(markRealtimeTurnTerminal.mock.invocationCallOrder[0]);
    expect(
      markRealtimeTurnTerminal.mock.invocationCallOrder[0],
    ).toBeLessThan(options.markProcessing.mock.invocationCallOrder[0]);
  });

  it("flushes pending realtime batches before terminal error and stalled settlement", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnError("ws-1", "thread-1", "turn-1", {
        message: "failed",
        willRetry: false,
      });
      result.current.onTurnStalled("ws-1", "thread-2", "turn-2", {
        message: "stalled",
        reasonCode: "timeout",
        stage: "stalled",
        source: "test",
        startedAtMs: null,
        timeoutMs: null,
      });
    });

    expect(itemHookFactory.getFlushPendingRealtimeEvents()).toHaveBeenCalledTimes(2);
    expect(itemHookFactory.getMarkRealtimeTurnTerminal()).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      "turn-1",
    );
    expect(itemHookFactory.getMarkRealtimeTurnTerminal()).toHaveBeenNthCalledWith(
      2,
      "thread-2",
      "turn-2",
    );
  });

  it("notes the active realtime turn before turn-start handling runs", () => {
    const options = makeOptions();
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
    });

    expect(itemHookFactory.getNoteRealtimeTurnStarted()).toHaveBeenCalledWith(
      "thread-1",
      "turn-1",
    );
    expect(
      itemHookFactory.getNoteRealtimeTurnStarted().mock.invocationCallOrder[0],
    ).toBeLessThan(options.markProcessing.mock.invocationCallOrder[0]);
  });

  it("skips late raw item updates when the realtime turn is already terminal", () => {
    const options = makeOptions();
    itemHookFactory.getIsRealtimeTurnTerminalExact().mockReturnValue(true);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onItemUpdated("ws-1", "thread-1", {
        type: "agentMessage",
        id: "assistant-1",
        text: "late snapshot",
        turnId: "turn-1",
      });
    });

    const mockedItemHook = vi.mocked(useThreadItemEvents);
    const latestReturn = mockedItemHook.mock.results.at(-1)?.value;
    expect(itemHookFactory.getIsRealtimeTurnTerminalExact()).toHaveBeenCalledWith(
      "thread-1",
      "turn-1",
    );
    expect(latestReturn?.onItemUpdated).not.toHaveBeenCalled();
    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", true);
  });

  it("skips late assistant completion side effects when the realtime turn is already terminal", () => {
    const options = makeOptions();
    itemHookFactory.getIsRealtimeTurnTerminalExact().mockReturnValue(true);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onAgentMessageCompleted({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        text: "late final snapshot",
        turnId: "turn-1",
      });
    });

    const mockedItemHook = vi.mocked(useThreadItemEvents);
    const latestReturn = mockedItemHook.mock.results.at(-1)?.value;
    expect(itemHookFactory.getIsRealtimeTurnTerminalExact()).toHaveBeenCalledWith(
      "thread-1",
      "turn-1",
    );
    expect(latestReturn?.onAgentMessageCompleted).not.toHaveBeenCalled();
    expect(options.onAgentMessageCompletedExternal).not.toHaveBeenCalled();
  });

  it("does not defer completed codex wait status snapshots", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "wait-1",
        type: "collabToolCall",
        tool: "wait",
      });
      result.current.onItemUpdated("ws-1", "thread-1", {
        id: "wait-1",
        type: "collabToolCall",
        tool: "wait",
        agentStatus: {
          "agent-1": { status: "completed" },
        },
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).not.toContain("thread/session:turn-diagnostic:turn-completed-deferred");
  });

  it("flushes deferred codex completion from a terminal child agent update", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
        status: "running",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);

    act(() => {
      result.current.onItemUpdated("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
        status: "failed",
      });
    });

    expect(options.markProcessing).toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).toHaveBeenCalledWith("thread-1", null);
    const flushedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:turn-completed-deferred-flushed",
    );
    expect(flushedEntry?.payload.diagnosticCategory).toBe("codex-collab-terminal-order");
  });

  it("keeps deferred codex completion while child agent update is still running", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
        status: "running",
      });
    });
    options.markProcessing.mockClear();
    options.setActiveTurnId.mockClear();

    act(() => {
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
      result.current.onItemUpdated("ws-1", "thread-1", {
        id: "agent-call-1",
        type: "collabAgentToolCall",
        tool: "spawn_agent",
        status: "running",
      });
    });

    expect(options.markProcessing).not.toHaveBeenCalledWith("thread-1", false);
    expect(options.setActiveTurnId).not.toHaveBeenCalledWith("thread-1", null);
  });

  it("ignores stale turn completion diagnostics for a previous turn id", () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-2");
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).not.toContain("thread/session:turn-diagnostic:completed");
  });

  it("keeps late codex predecessor events diagnostic-only when turn id no longer matches", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-2");
    });
    options.dispatch.mockClear();

    act(() => {
      result.current.onNormalizedRealtimeEvent({
        engine: "codex",
        workspaceId: "ws-1",
        threadId: "thread-1",
        eventId: "late-event-1",
        itemKind: "message",
        timestampMs: Date.now(),
        item: {
          kind: "message",
          id: "assistant-late",
          role: "assistant",
          text: "late predecessor output",
        },
        operation: "appendAgentMessageDelta",
        sourceMethod: "item/updated",
        delta: "late predecessor output",
        rawItem: null,
        rawUsage: null,
        turnId: "turn-1",
      });
    });

    expect(options.dispatch).not.toHaveBeenCalled();
    const skippedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:late-codex-event-skipped",
    );
    expect(skippedEntry?.payload.eventTurnId).toBe("turn-1");
    expect(skippedEntry?.payload.expectedTurnId).toBe("turn-2");
  });

  it("does not record first-delta diagnostics for interrupted threads", () => {
    const onDebug = vi.fn();
    const options = makeOptions(onDebug);
    options.interruptedThreadsRef.current.add("thread-1");
    const { result } = renderHook(() => useThreadEventHandlers(options));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "msg-1",
        delta: "hello",
      });
      vi.advanceTimersByTime(6_000);
    });

    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).toEqual([]);
    expect(labels).not.toContain("thread/session:turn-diagnostic:first-delta");
    expect(labels).not.toContain("thread/session:turn-diagnostic:stalled-after-first-delta");
  });

  it("emits detailed diagnostics when verbose flag is enabled", () => {
    window.localStorage.setItem("ccgui.debug.turnDiagnosticsVerbose", "1");
    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "msg-1",
        delta: "hello",
      });
      result.current.onItemStarted("ws-1", "thread-1", {
        id: "cmd-1",
        type: "commandExecution",
      });
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    const labels = collectDiagnosticCalls(onDebug).map((entry) => entry.label);
    expect(labels).toContain("thread/session:turn-diagnostic:started");
    expect(labels).toContain("thread/session:turn-diagnostic:first-delta");
    expect(labels).toContain("thread/session:turn-diagnostic:first-execution-item");
    expect(labels).toContain("thread/session:turn-diagnostic:completed");
  });

  it("includes correlated provider fingerprint and mitigation evidence on completion", async () => {
    window.localStorage.setItem("ccgui.debug.turnDiagnosticsVerbose", "1");
    streamLatencyMocks.isWindowsPlatform.mockReturnValue(true);
    streamLatencyMocks.getCurrentClaudeConfig.mockResolvedValue({
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/apps/anthropic",
      providerId: "qwen",
      providerName: "Qwen",
    });
    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "thread-1",
      engine: "claude",
      model: "qwen3.6-plus",
    });

    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "thread-1", "turn-1");
    });
    act(() => {
      vi.setSystemTime(new Date("2026-04-18T10:00:00.100Z"));
      result.current.onAgentMessageDelta({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "msg-1",
        delta: "hello",
      });
    });
    act(() => {
      vi.setSystemTime(new Date("2026-04-18T10:00:00.340Z"));
      noteThreadVisibleRender("thread-1", {
        visibleItemCount: 2,
        renderAt: Date.now(),
      });
      result.current.onTurnCompleted("ws-1", "thread-1", "turn-1");
    });

    const completedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:completed",
    );

    expect(completedEntry?.payload.providerId).toBe("qwen");
    expect(completedEntry?.payload.model).toBe("qwen3.6-plus");
    expect(completedEntry?.payload.platform).toBe("windows");
    expect(completedEntry?.payload.latencyCategory).toBe("render-amplification");
    expect(completedEntry?.payload.firstVisibleRenderAfterDeltaMs).toBe(240);
    expect(completedEntry?.payload.mitigationProfile).toBe(
      "claude-qwen-windows-render-safe",
    );
  });

  it("treats growing claude agentMessage snapshots as streaming ingress for markdown recovery", async () => {
    window.localStorage.setItem("ccgui.debug.turnDiagnosticsVerbose", "1");
    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "claude:session-snapshot",
      engine: "claude",
      model: "claude-sonnet-4",
    });

    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "claude:session-snapshot", "turn-1");
    });
    act(() => {
      vi.setSystemTime(new Date("2026-04-18T10:00:00.100Z"));
      result.current.onItemUpdated("ws-1", "claude:session-snapshot", {
        type: "agentMessage",
        id: "assistant-1",
        text: "先给出一版草稿。",
      });
    });
    act(() => {
      vi.setSystemTime(new Date("2026-04-18T10:00:00.200Z"));
      result.current.onItemUpdated("ws-1", "claude:session-snapshot", {
        type: "agentMessage",
        id: "assistant-1",
        text: "# 架构分析\n\n| 模块 | 结论 |\n| --- | --- |\n| API | 清晰 |\n| DB | 需要拆分 |",
      });
    });
    act(() => {
      vi.advanceTimersByTime(750);
      result.current.onTurnCompleted("ws-1", "claude:session-snapshot", "turn-1");
    });

    const completedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:completed",
    );

    expect(completedEntry?.payload.deltaCount).toBe(2);
    expect(completedEntry?.payload.latencyCategory).toBe(
      "visible-output-stall-after-first-delta",
    );
    expect(completedEntry?.payload.mitigationProfile).toBe(
      "claude-markdown-stream-recovery",
    );
  });

  it("ignores unchanged claude agentMessage snapshots when counting streaming ingress", async () => {
    window.localStorage.setItem("ccgui.debug.turnDiagnosticsVerbose", "1");
    await primeThreadStreamLatencyContext({
      workspaceId: "ws-1",
      threadId: "claude:session-snapshot-static",
      engine: "claude",
      model: "claude-sonnet-4",
    });

    const onDebug = vi.fn();
    const { result } = renderHook(() => useThreadEventHandlers(makeOptions(onDebug)));

    act(() => {
      result.current.onTurnStarted("ws-1", "claude:session-snapshot-static", "turn-1");
      result.current.onItemUpdated("ws-1", "claude:session-snapshot-static", {
        type: "agentMessage",
        id: "assistant-1",
        text: "这是同一版草稿。",
      });
      result.current.onItemUpdated("ws-1", "claude:session-snapshot-static", {
        type: "agentMessage",
        id: "assistant-1",
        text: "这是同一版草稿。",
      });
      result.current.onTurnCompleted("ws-1", "claude:session-snapshot-static", "turn-1");
    });

    const completedEntry = collectDiagnosticCalls(onDebug).find(
      (entry) => entry.label === "thread/session:turn-diagnostic:completed",
    );

    expect(completedEntry?.payload.deltaCount).toBe(1);
    expect(completedEntry?.payload.latencyCategory).toBeNull();
  });
});
