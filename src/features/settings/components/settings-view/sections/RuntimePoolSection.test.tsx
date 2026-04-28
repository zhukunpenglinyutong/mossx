// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, RuntimePoolSnapshot, WorkspaceInfo } from "@/types";
import { RuntimePoolSection } from "./RuntimePoolSection";
import {
  connectWorkspace,
  getRuntimePoolSnapshot,
  mutateRuntimePool,
} from "../../../../../services/tauri";

vi.mock("../../../../../services/tauri", () => ({
  connectWorkspace: vi.fn(),
  getRuntimePoolSnapshot: vi.fn(),
  mutateRuntimePool: vi.fn(),
}));

const baseSettings = {
  codexMaxHotRuntimes: 1,
  codexMaxWarmRuntimes: 1,
  codexWarmTtlSeconds: 7200,
} as AppSettings;

function renderTranslation(
  key: string,
  options?: Record<string, unknown>,
): string {
  if (typeof options?.count === "number") {
    return `${key}:${options.count}`;
  }
  if (typeof options?.pid === "number") {
    return `${key}:${options.pid}`;
  }
  if (typeof options?.code === "number") {
    return `${key}:${options.code}`;
  }
  if (typeof options?.signal === "string") {
    return `${key}:${options.signal}`;
  }
  return key;
}

function buildSnapshot(): RuntimePoolSnapshot {
  return {
    rows: [
      {
        workspaceId: "ws-runtime",
        workspaceName: "Runtime Workspace",
        workspacePath: "/tmp/runtime-workspace",
        engine: "codex",
        state: "startup-pending",
        pid: 4242,
        runtimeGeneration: "pid:4242:startedAt:1710000000000",
        wrapperKind: "cmd-wrapper",
        resolvedBin: "C:/tools/codex.cmd",
        startedAtMs: 1_710_000_000_000,
        lastUsedAtMs: 1_710_000_001_000,
        pinned: false,
        turnLeaseCount: 1,
        streamLeaseCount: 0,
        leaseSources: ["turn:thread-1"],
        activeWorkProtected: true,
        activeWorkReason: "turn",
        activeWorkSinceMs: 1_710_000_000_000,
        activeWorkLastRenewedAtMs: 1_710_000_001_000,
        foregroundWorkState: "startup-pending",
        foregroundWorkThreadId: "thread-1",
        foregroundWorkTurnId: "turn-1",
        foregroundWorkSinceMs: 1_710_000_000_000,
        foregroundWorkTimeoutAtMs: 1_710_000_030_000,
        foregroundWorkLastEventAtMs: 1_710_000_001_500,
        foregroundWorkTimedOut: false,
        evictCandidate: false,
        evictionReason: null,
        error: null,
        lastExitReasonCode: null,
        lastExitMessage: null,
        lastExitAtMs: null,
        lastExitCode: null,
        lastExitSignal: null,
        lastExitPendingRequestCount: 0,
        processDiagnostics: {
          rootProcesses: 1,
          totalProcesses: 3,
          nodeProcesses: 2,
          rootCommand: "cmd.exe",
          managedRuntimeProcesses: 2,
          resumeHelperProcesses: 0,
          orphanResidueProcesses: 0,
        },
        startupState: "quarantined",
        lastRecoverySource: "workspace-restore",
        lastGuardState: "quarantined",
        lastReplaceReason: "thread-list-live",
        lastProbeFailure: "probe timeout",
        lastProbeFailureSource: "ensure-runtime-ready",
        hasStoppingPredecessor: true,
        recentSpawnCount: 2,
        recentReplaceCount: 1,
        recentForceKillCount: 3,
      },
    ],
    engineObservability: [],
    summary: {
      totalRuntimes: 1,
      acquiredRuntimes: 0,
      streamingRuntimes: 0,
      gracefulIdleRuntimes: 0,
      evictableRuntimes: 0,
      activeWorkProtectedRuntimes: 1,
      pinnedRuntimes: 0,
      codexRuntimes: 1,
      claudeRuntimes: 0,
    },
    budgets: {
      maxHotCodex: 1,
      maxWarmCodex: 1,
      warmTtlSeconds: 7200,
      restoreThreadsOnlyOnLaunch: false,
      forceCleanupOnExit: false,
      orphanSweepOnLaunch: false,
    },
    diagnostics: {
      orphanEntriesFound: 0,
      orphanEntriesCleaned: 0,
      orphanEntriesFailed: 0,
      startupManagedNodeProcesses: 0,
      startupResumeHelperNodeProcesses: 0,
      startupOrphanResidueProcesses: 0,
      lastOrphanSweepAtMs: null,
      forceKillCount: 0,
      coordinatorAbortCount: 0,
      leaseBlockedEvictionCount: 0,
      lastShutdownAtMs: null,
    },
  };
}

function buildEmptySnapshot(): RuntimePoolSnapshot {
  return {
    ...buildSnapshot(),
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
  };
}

function buildWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: overrides.id ?? "ws-runtime",
    name: overrides.name ?? "Runtime Workspace",
    path: overrides.path ?? "/tmp/runtime-workspace",
    connected: overrides.connected ?? true,
    kind: overrides.kind ?? "main",
    parentId: overrides.parentId ?? null,
    worktree: overrides.worktree ?? null,
    settings: {
      sidebarCollapsed: false,
      ...(overrides.settings ?? {}),
    },
  };
}

async function flushRuntimePoolAsyncWork(cycles = 4) {
  for (let index = 0; index < cycles; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("RuntimePoolSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(connectWorkspace).mockResolvedValue(undefined);
    vi.mocked(getRuntimePoolSnapshot).mockResolvedValue(buildSnapshot());
    vi.mocked(mutateRuntimePool).mockResolvedValue(buildSnapshot());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders churn diagnostics, startup state, and replacement evidence", async () => {
    render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText("Runtime Workspace")).toBeTruthy();
    expect(screen.getByText("settings.runtimeStoppingPredecessorLabel")).toBeTruthy();
    expect(screen.getByText(/settings\.runtimeStartupStateQuarantined/)).toBeTruthy();
    expect(
      screen.getByText(/settings\.runtimeRecoverySourceLabel workspace-restore/),
    ).toBeTruthy();
    expect(
      screen.getByText(/settings\.runtimeRecentSpawnCountLabel:2/),
    ).toBeTruthy();
    expect(
      screen.getByText(/settings\.runtimeRecentReplaceCountLabel:1/),
    ).toBeTruthy();
    expect(
      screen.getByText(/settings\.runtimeRecentForceKillCountLabel:3/),
    ).toBeTruthy();
    expect(screen.getByText(/cmd-wrapper/)).toBeTruthy();
    expect(
      screen.getByText(/settings\.runtimeGenerationLabel pid:4242:startedAt:1710000000000/),
    ).toBeTruthy();
    expect(screen.getByText("C:/tools/codex.cmd")).toBeTruthy();

    fireEvent.click(screen.getByText("settings.runtimeRowDetailsSummary"));

    await waitFor(() => {
      expect(
        screen.getByText(/settings\.runtimeReplaceReasonLabel thread-list-live/),
      ).toBeTruthy();
    });
    expect(
      screen.getByText(/settings\.runtimeProbeFailureLabel probe timeout/),
    ).toBeTruthy();
    expect(
      screen.getByText(/settings\.runtimeRecoverySourceLabel ensure-runtime-ready/),
    ).toBeTruthy();
    expect(
      screen.getByText(/settings\.runtimeForegroundStateLabel settings\.runtimeProtectionStartupPending/),
    ).toBeTruthy();
  });

  it("renders a non-empty initial snapshot without runtime-panel bootstrap", async () => {
    render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        workspaces={[buildWorkspace()]}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText("Runtime Workspace")).toBeTruthy();
    expect(connectWorkspace).not.toHaveBeenCalled();
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(1);
  });

  it("bootstraps connected workspaces after an empty initial snapshot and reloads rows", async () => {
    vi.mocked(getRuntimePoolSnapshot)
      .mockResolvedValueOnce(buildEmptySnapshot())
      .mockResolvedValueOnce(buildSnapshot());

    render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        workspaces={[buildWorkspace()]}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText("Runtime Workspace")).toBeTruthy();
    expect(connectWorkspace).toHaveBeenCalledTimes(1);
    expect(connectWorkspace).toHaveBeenCalledWith(
      "ws-runtime",
      "runtime-panel-bootstrap",
    );
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(2);
  });

  it("dedupes runtime-panel bootstrap workspaces and skips blank ids", async () => {
    vi.mocked(getRuntimePoolSnapshot)
      .mockResolvedValueOnce(buildEmptySnapshot())
      .mockResolvedValueOnce(buildSnapshot());

    render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        workspaces={[
          buildWorkspace({ id: " ws-runtime " }),
          buildWorkspace({ id: "ws-runtime" }),
          buildWorkspace({ id: "   " }),
          buildWorkspace({ id: "ws-disconnected", connected: false }),
        ]}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText("Runtime Workspace")).toBeTruthy();
    expect(connectWorkspace).toHaveBeenCalledTimes(1);
    expect(connectWorkspace).toHaveBeenCalledWith(
      "ws-runtime",
      "runtime-panel-bootstrap",
    );
  });

  it("uses bounded fallback refresh when bootstrap still returns an empty snapshot", async () => {
    vi.useFakeTimers();
    vi.mocked(getRuntimePoolSnapshot)
      .mockResolvedValueOnce(buildEmptySnapshot())
      .mockResolvedValueOnce(buildEmptySnapshot())
      .mockResolvedValueOnce(buildSnapshot());

    render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        workspaces={[buildWorkspace()]}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await flushRuntimePoolAsyncWork();
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(2);
    expect(screen.getByText("settings.loading")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushRuntimePoolAsyncWork();

    expect(screen.getByText("Runtime Workspace")).toBeTruthy();
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(3);
  });

  it("stops fallback refresh after bounded attempts and then shows true empty state", async () => {
    vi.useFakeTimers();
    vi.mocked(getRuntimePoolSnapshot).mockResolvedValue(buildEmptySnapshot());

    render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        workspaces={[buildWorkspace()]}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await flushRuntimePoolAsyncWork();
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(2);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      await flushRuntimePoolAsyncWork();
    }

    expect(screen.getByText("settings.runtimePoolEmpty")).toBeTruthy();
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(7);
  });

  it("cleans fallback refresh timers on unmount", async () => {
    vi.useFakeTimers();
    vi.mocked(getRuntimePoolSnapshot).mockResolvedValue(buildEmptySnapshot());

    const view = render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        workspaces={[buildWorkspace()]}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await flushRuntimePoolAsyncWork();
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not bootstrap disconnected workspaces", async () => {
    vi.mocked(getRuntimePoolSnapshot).mockResolvedValue(buildEmptySnapshot());

    render(
      <RuntimePoolSection
        t={renderTranslation}
        appSettings={baseSettings}
        workspaces={[buildWorkspace({ connected: false })]}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(await screen.findByText("settings.runtimePoolEmpty")).toBeTruthy();
    expect(connectWorkspace).not.toHaveBeenCalled();
    expect(getRuntimePoolSnapshot).toHaveBeenCalledTimes(1);
  });
});
