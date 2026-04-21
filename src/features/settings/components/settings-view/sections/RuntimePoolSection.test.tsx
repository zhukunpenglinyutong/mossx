// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, RuntimePoolSnapshot } from "@/types";
import { RuntimePoolSection } from "./RuntimePoolSection";
import {
  getRuntimePoolSnapshot,
  mutateRuntimePool,
} from "../../../../../services/tauri";

vi.mock("../../../../../services/tauri", () => ({
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

describe("RuntimePoolSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRuntimePoolSnapshot).mockResolvedValue(buildSnapshot());
    vi.mocked(mutateRuntimePool).mockResolvedValue(buildSnapshot());
  });

  afterEach(() => {
    cleanup();
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
});
