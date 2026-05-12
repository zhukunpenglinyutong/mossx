// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGlobalRuntimeNotices } from "../../../services/globalRuntimeNotices";
import {
  recordStartupMilestone,
  recordStartupTaskTrace,
  resetStartupTraceForTests,
  traceStartupCommand,
} from "../../startup-orchestration/utils/startupTrace";
import {
  resolveGlobalRuntimeNoticeDockStatus,
  sanitizeGlobalRuntimeNoticeDockVisibility,
  useGlobalRuntimeNoticeDock,
} from "./useGlobalRuntimeNoticeDock";

const clientStorageMocks = vi.hoisted(() => ({
  getClientStoreSync: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

const tauriMocks = vi.hoisted(() => ({
  getRuntimePoolSnapshot: vi.fn(),
}));
const originalConsoleError = console.error;

function isReactActWarning(args: unknown[]): boolean {
  return args.some(
    (value) => typeof value === "string" && value.includes("not wrapped in act"),
  );
}

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: clientStorageMocks.getClientStoreSync,
  writeClientStoreValue: clientStorageMocks.writeClientStoreValue,
}));

vi.mock("../../../services/tauri", () => ({
  getRuntimePoolSnapshot: tauriMocks.getRuntimePoolSnapshot,
}));

function createEmptyRuntimePoolSnapshot() {
  return {
    rows: [],
    summary: {
      totalRuntimes: 0,
      acquiredRuntimes: 0,
      streamingRuntimes: 0,
      gracefulIdleRuntimes: 0,
      evictableRuntimes: 0,
      activeWorkProtectedRuntimes: 0,
      pinnedRuntimes: 0,
      codexRuntimes: 0,
      claudeRuntimes: 0,
    },
    budgets: {
      maxHotCodex: 0,
      maxWarmCodex: 0,
      warmTtlSeconds: 0,
      restoreThreadsOnlyOnLaunch: false,
      forceCleanupOnExit: false,
      orphanSweepOnLaunch: false,
    },
    diagnostics: {
      orphanEntriesFound: 0,
      orphanEntriesCleaned: 0,
      orphanEntriesFailed: 0,
      forceKillCount: 0,
      leaseBlockedEvictionCount: 0,
      coordinatorAbortCount: 0,
      startupManagedNodeProcesses: 0,
      startupResumeHelperNodeProcesses: 0,
      startupOrphanResidueProcesses: 0,
      lastOrphanSweepAtMs: null,
      lastShutdownAtMs: null,
    },
    engineObservability: [],
  };
}

describe("useGlobalRuntimeNoticeDock", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T09:00:00"));
    clearGlobalRuntimeNotices();
    resetStartupTraceForTests();
    clientStorageMocks.getClientStoreSync.mockReset();
    clientStorageMocks.writeClientStoreValue.mockReset();
    tauriMocks.getRuntimePoolSnapshot.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      if (isReactActWarning(args)) {
        return;
      }
      originalConsoleError(...args);
    });
    clientStorageMocks.getClientStoreSync.mockReturnValue(undefined);
    tauriMocks.getRuntimePoolSnapshot.mockResolvedValue(createEmptyRuntimePoolSnapshot());
  });

  afterEach(() => {
    clearGlobalRuntimeNotices();
    resetStartupTraceForTests();
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = null;
    vi.useRealTimers();
  });

  it("sanitizes invalid persisted visibility values", () => {
    expect(sanitizeGlobalRuntimeNoticeDockVisibility("expanded")).toBe("expanded");
    expect(sanitizeGlobalRuntimeNoticeDockVisibility("broken")).toBe("minimized");
    expect(sanitizeGlobalRuntimeNoticeDockVisibility(null)).toBe("minimized");
  });

  it("persists visibility changes through client storage", async () => {
    clientStorageMocks.getClientStoreSync.mockReturnValue("broken-value");

    const { result } = renderHook(() =>
      useGlobalRuntimeNoticeDock([
        {
          id: "ws-1",
          name: "Moss X",
          path: "/tmp/mossx",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ]),
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.visibility).toBe("minimized");

    act(() => {
      result.current.expand();
    });

    expect(clientStorageMocks.writeClientStoreValue).toHaveBeenLastCalledWith(
      "app",
      "globalRuntimeNoticeDock.visibility",
      "expanded",
    );

    act(() => {
      result.current.minimize();
    });

    expect(clientStorageMocks.writeClientStoreValue).toHaveBeenLastCalledWith(
      "app",
      "globalRuntimeNoticeDock.visibility",
      "minimized",
    );
  });

  it("maps runtime pool transitions into notices and lets streaming status decay to idle", async () => {
    const initialSnapshot = {
      ...createEmptyRuntimePoolSnapshot(),
      rows: [
        {
          workspaceId: "ws-1",
          workspaceName: "Repo A",
          workspacePath: "/tmp/repo-a",
          engine: "codex",
          state: "streaming",
          pid: null,
          wrapperKind: null,
          resolvedBin: null,
          startedAtMs: null,
          lastUsedAtMs: 0,
          pinned: false,
          turnLeaseCount: 0,
          streamLeaseCount: 0,
          leaseSources: [],
          activeWorkProtected: false,
          evictCandidate: false,
          evictionReason: null,
          error: null,
          foregroundWorkState: "resume-pending",
          startupState: "suspect-stale",
        },
      ],
    };
    tauriMocks.getRuntimePoolSnapshot.mockResolvedValue(initialSnapshot);

    const { result } = renderHook(() =>
      useGlobalRuntimeNoticeDock([
        {
          id: "ws-1",
          name: "Moss X",
          path: "/tmp/mossx",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ]),
    );
    const initialLoadPromise = tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;

    await act(async () => {
      await initialLoadPromise;
    });

    expect(result.current.notices[0]).toEqual(
      expect.objectContaining({
        messageKey: "runtimeNotice.runtime.resumePending",
        messageParams: {
          workspace: "Repo A",
          engine: "Codex",
        },
      }),
    );
    expect(result.current.status).toBe("streaming");
    expect(result.current.runtimeRows).toEqual(initialSnapshot.rows);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8100);
    });

    expect(result.current.status).toBe("idle");
    expect(resolveGlobalRuntimeNoticeDockStatus(result.current.notices, Date.now())).toBe("idle");
  });

  it("keeps runtime row signal state stable when snapshot order changes only", async () => {
    const rowA = {
      workspaceId: "ws-a",
      workspaceName: "Repo A",
      workspacePath: "/tmp/repo-a",
      engine: "codex",
      state: "streaming",
      lifecycleState: "active",
      pid: null,
      wrapperKind: null,
      resolvedBin: null,
      startedAtMs: null,
      lastUsedAtMs: 0,
      pinned: false,
      turnLeaseCount: 0,
      streamLeaseCount: 0,
      leaseSources: [],
      activeWorkProtected: false,
      evictCandidate: false,
      evictionReason: null,
      error: null,
      foregroundWorkState: null,
      startupState: "ready",
    };
    const rowB = {
      ...rowA,
      workspaceId: "ws-b",
      workspaceName: "Repo B",
      workspacePath: "/tmp/repo-b",
      engine: "claude",
    };
    tauriMocks.getRuntimePoolSnapshot
      .mockResolvedValueOnce({
        ...createEmptyRuntimePoolSnapshot(),
        rows: [rowA, rowB],
      })
      .mockResolvedValueOnce({
        ...createEmptyRuntimePoolSnapshot(),
        rows: [rowB, rowA],
      });

    const { result } = renderHook(() => useGlobalRuntimeNoticeDock([]));
    await act(async () => {
      await tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;
    });
    const firstRows = result.current.runtimeRows;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await tauriMocks.getRuntimePoolSnapshot.mock.results[1]?.value;
    });

    expect(result.current.runtimeRows).toBe(firstRows);
  });

  it("writes back initial ready runtime snapshots with engine-aware copy and stable path fallback", async () => {
    const initialSnapshot = {
      ...createEmptyRuntimePoolSnapshot(),
      rows: [
        {
          workspaceId: "ws-ready",
          workspaceName: "   ",
          workspacePath: "C:\\Users\\me\\Workspace Ready\\",
          engine: "claude",
          state: "graceful-idle",
          pid: null,
          wrapperKind: null,
          resolvedBin: null,
          startedAtMs: null,
          lastUsedAtMs: 0,
          pinned: false,
          turnLeaseCount: 0,
          streamLeaseCount: 0,
          leaseSources: [],
          activeWorkProtected: false,
          evictCandidate: false,
          evictionReason: null,
          error: null,
          foregroundWorkState: null,
          startupState: "ready",
        },
        {
          workspaceId: "ws-empty",
          workspaceName: "   ",
          workspacePath: "   ",
          engine: "codex",
          state: "graceful-idle",
          pid: null,
          wrapperKind: null,
          resolvedBin: null,
          startedAtMs: null,
          lastUsedAtMs: 0,
          pinned: false,
          turnLeaseCount: 0,
          streamLeaseCount: 0,
          leaseSources: [],
          activeWorkProtected: false,
          evictCandidate: false,
          evictionReason: null,
          error: null,
          foregroundWorkState: null,
          startupState: "ready",
        },
      ],
    };
    tauriMocks.getRuntimePoolSnapshot.mockResolvedValue(initialSnapshot);

    const { result } = renderHook(() =>
      useGlobalRuntimeNoticeDock([
        {
          id: "ws-1",
          name: "Moss X",
          path: "/tmp/mossx",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ]),
    );
    const initialLoadPromise = tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;

    await act(async () => {
      await initialLoadPromise;
    });

    expect(result.current.notices).toHaveLength(2);
    expect(result.current.notices[0]).toEqual(
      expect.objectContaining({
        messageKey: "runtimeNotice.runtime.ready",
        messageParams: {
          workspace: "Workspace Ready",
          engine: "Claude Code",
        },
      }),
    );
    expect(result.current.notices[1]).toEqual(
      expect.objectContaining({
        messageKey: "runtimeNotice.runtime.ready",
        messageParams: {
          workspace: "ws-empty",
          engine: "Codex",
        },
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      const nextLoadPromise = tauriMocks.getRuntimePoolSnapshot.mock.results[1]?.value;
      await nextLoadPromise;
    });

    expect(result.current.notices).toHaveLength(2);
  });

  it("mirrors startup trace tasks, commands, and milestones into runtime notices", async () => {
    const { result } = renderHook(() =>
      useGlobalRuntimeNoticeDock([
        {
          id: "ws-1",
          name: "Moss X",
          path: "/tmp/mossx",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ]),
    );

    await act(async () => {
      await tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;
    });

    act(() => {
      recordStartupTaskTrace({
        type: "task",
        taskId: "thread-list:first-page:ws-1",
        phase: "active-workspace",
        traceLabel: "Load active workspace threads",
        workspaceScope: { workspaceId: "ws-1" },
        lifecycleState: "started",
        durationMs: null,
        fallbackReason: null,
        cancellationMode: null,
        commandLabel: "list_threads",
      });
      recordStartupTaskTrace({
        type: "task",
        taskId: "thread-list:first-page:ws-1",
        phase: "active-workspace",
        traceLabel: "Load active workspace threads",
        workspaceScope: { workspaceId: "ws-1" },
        lifecycleState: "degraded",
        durationMs: 42.4,
        fallbackReason: "timeout",
        cancellationMode: null,
        commandLabel: "list_threads",
      });
      recordStartupMilestone("active-workspace-ready");
    });

    await act(async () => {
      await traceStartupCommand("list_threads", { workspaceId: "ws-1" }, async () => "ok");
    });

    expect(result.current.notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "diagnostic",
          messageKey: "runtimeNotice.startup.taskStarted",
          messageParams: {
            phase: "active-workspace",
            task: "Load active workspace threads",
            workspace: "Moss X",
            durationMs: null,
            reason: null,
          },
        }),
        expect.objectContaining({
          severity: "warning",
          messageKey: "runtimeNotice.startup.taskDegraded",
          messageParams: {
            phase: "active-workspace",
            task: "Load active workspace threads",
            workspace: "Moss X",
            durationMs: 42,
            reason: "timeout",
          },
        }),
        expect.objectContaining({
          category: "bootstrap",
          messageKey: "runtimeNotice.startup.activeWorkspaceReady",
        }),
        expect.objectContaining({
          messageKey: "runtimeNotice.startup.commandCompleted",
          messageParams: {
            command: "list_threads",
            workspace: "Moss X",
            durationMs: 0,
          },
        }),
      ]),
    );
  });

  it("deduplicates repeated successful startup command notices in a short time bucket", async () => {
    const { result } = renderHook(() =>
      useGlobalRuntimeNoticeDock([
        {
          id: "ws-git",
          name: "Git Repo",
          path: "/tmp/git-repo",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ]),
    );

    await act(async () => {
      await tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;
    });

    await act(async () => {
      await traceStartupCommand("get_git_status", { workspaceId: "ws-git" }, async () => "ok");
      await traceStartupCommand("get_git_status", { workspaceId: "ws-git" }, async () => "ok");
    });

    const commandNotices = result.current.notices.filter(
      (notice) => notice.messageKey === "runtimeNotice.startup.commandCompleted",
    );
    expect(commandNotices).toHaveLength(1);
    expect(commandNotices[0]).toEqual(
      expect.objectContaining({
        repeatCount: 2,
        messageParams: {
          command: "get_git_status",
          workspace: "Git Repo",
          durationMs: 0,
        },
      }),
    );
  });

  it("groups repeated successful startup commands by project without merging unrelated logs", async () => {
    const { result } = renderHook(() =>
      useGlobalRuntimeNoticeDock([
        {
          id: "ws-alpha",
          name: "Alpha",
          path: "/tmp/alpha",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
        {
          id: "ws-beta",
          name: "Beta",
          path: "/tmp/beta",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ]),
    );

    await act(async () => {
      await tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;
    });

    await act(async () => {
      await traceStartupCommand("list_threads", { workspaceId: "ws-alpha" }, async () => "ok");
      await traceStartupCommand("list_thread_titles", { workspaceId: "ws-alpha" }, async () => "ok");
      await traceStartupCommand("list_threads", { workspaceId: "ws-beta" }, async () => "ok");
      await traceStartupCommand("list_threads", { workspaceId: "ws-alpha" }, async () => "ok");
    });

    const commandNotices = result.current.notices.filter(
      (notice) => notice.messageKey === "runtimeNotice.startup.commandCompleted",
    );
    expect(commandNotices).toHaveLength(3);
    expect(commandNotices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repeatCount: 2,
          messageParams: {
            command: "list_threads",
            workspace: "Alpha",
            durationMs: 0,
          },
        }),
        expect.objectContaining({
          repeatCount: 1,
          messageParams: {
            command: "list_threads",
            workspace: "Beta",
            durationMs: 0,
          },
        }),
        expect.objectContaining({
          repeatCount: 1,
          messageParams: {
            command: "list_thread_titles",
            workspace: "Alpha",
            durationMs: 0,
          },
        }),
      ]),
    );
    expect(commandNotices[commandNotices.length - 1]).toEqual(
      expect.objectContaining({
        repeatCount: 2,
        messageParams: expect.objectContaining({
          command: "list_threads",
          workspace: "Alpha",
        }),
      }),
    );
  });

  it("does not mirror old startup trace events again after remount", async () => {
    const workspace = {
      id: "ws-alpha",
      name: "Alpha",
      path: "/tmp/alpha",
      connected: true,
      settings: { sidebarCollapsed: false },
    };
    const firstRender = renderHook(() => useGlobalRuntimeNoticeDock([workspace]));

    await act(async () => {
      await tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;
    });

    await act(async () => {
      await traceStartupCommand("list_threads", { workspaceId: "ws-alpha" }, async () => "ok");
    });

    expect(
      firstRender.result.current.notices.filter(
        (notice) => notice.messageKey === "runtimeNotice.startup.commandCompleted",
      ),
    ).toHaveLength(1);

    firstRender.unmount();
    const secondRender = renderHook(() => useGlobalRuntimeNoticeDock([workspace]));

    await act(async () => {
      await tauriMocks.getRuntimePoolSnapshot.mock.results[1]?.value;
    });

    expect(
      secondRender.result.current.notices.filter(
        (notice) => notice.messageKey === "runtimeNotice.startup.commandCompleted",
      ),
    ).toHaveLength(1);

    await act(async () => {
      await traceStartupCommand("list_thread_titles", { workspaceId: "ws-alpha" }, async () => "ok");
    });

    expect(
      secondRender.result.current.notices.filter(
        (notice) => notice.messageKey === "runtimeNotice.startup.commandCompleted",
      ),
    ).toHaveLength(2);
  });

  it("does not merge failed startup commands into successful project groups", async () => {
    const { result } = renderHook(() =>
      useGlobalRuntimeNoticeDock([
        {
          id: "ws-alpha",
          name: "Alpha",
          path: "/tmp/alpha",
          connected: true,
          settings: { sidebarCollapsed: false },
        },
      ]),
    );

    await act(async () => {
      await tauriMocks.getRuntimePoolSnapshot.mock.results[0]?.value;
    });

    await act(async () => {
      await traceStartupCommand("list_threads", { workspaceId: "ws-alpha" }, async () => "ok");
      await traceStartupCommand("list_threads", { workspaceId: "ws-alpha" }, async () => {
        throw new Error("boom");
      }).catch(() => undefined);
      await traceStartupCommand("list_threads", { workspaceId: "ws-alpha" }, async () => "ok");
    });

    const successfulNotices = result.current.notices.filter(
      (notice) => notice.messageKey === "runtimeNotice.startup.commandCompleted",
    );
    const failedNotices = result.current.notices.filter(
      (notice) => notice.messageKey === "runtimeNotice.startup.commandFailed",
    );
    expect(successfulNotices).toHaveLength(1);
    expect(successfulNotices[0]).toEqual(
      expect.objectContaining({
        repeatCount: 2,
        messageParams: {
          command: "list_threads",
          workspace: "Alpha",
          durationMs: 0,
        },
      }),
    );
    expect(failedNotices).toHaveLength(1);
    expect(failedNotices[0]).toEqual(
      expect.objectContaining({
        repeatCount: 1,
        messageParams: {
          command: "list_threads",
          workspace: "Alpha",
          durationMs: 0,
        },
      }),
    );
  });
});
