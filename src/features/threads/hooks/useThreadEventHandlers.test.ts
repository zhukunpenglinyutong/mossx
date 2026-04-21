// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadEventHandlers } from "./useThreadEventHandlers";

const turnHookFactory = vi.hoisted(() => {
  let latestOptions: Record<string, unknown> | null = null;
  return {
    setLatestOptions(options: Record<string, unknown>) {
      latestOptions = options;
    },
    getLatestOptions() {
      return latestOptions;
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
  stripBackendErrorPrefix: (value: string) => value,
}));

vi.mock("../utils/claudeMcpRuntimeSnapshot", () => ({
  captureClaudeMcpRuntimeSnapshotFromRaw: vi.fn(() => null),
}));

vi.mock("../utils/realtimePerfFlags", () => ({
  isDebugLightPathEnabled: vi.fn(() => false),
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
      onTurnCompleted: (_workspaceId: string, threadId: string) => {
        const markProcessing = turnHookFactory.getLatestOptions()?.markProcessing as
          | ((threadId: string, isProcessing: boolean) => void)
          | undefined;
        const setActiveTurnId = turnHookFactory.getLatestOptions()?.setActiveTurnId as
          | ((threadId: string, turnId: string | null) => void)
          | undefined;
        markProcessing?.(threadId, false);
        setActiveTurnId?.(threadId, null);
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
    onItemStarted: vi.fn(),
    onItemUpdated: vi.fn(),
    onItemCompleted: vi.fn(),
    onReasoningSummaryDelta: vi.fn(),
    onReasoningSummaryBoundary: vi.fn(),
    onReasoningTextDelta: vi.fn(),
    onCommandOutputDelta: vi.fn(),
    onTerminalInteraction: vi.fn(),
    onFileChangeOutputDelta: vi.fn(),
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
    window.localStorage.removeItem("ccgui.debug.turnDiagnosticsVerbose");
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
});
