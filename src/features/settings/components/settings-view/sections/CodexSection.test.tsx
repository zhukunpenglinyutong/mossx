// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, CliInstallPlan, CliInstallResult } from "@/types";
import { getCliInstallPlan, runCliInstaller } from "@/services/tauri";
import { subscribeCliInstallerEvents } from "@/services/events";
import { CodexSection } from "./CodexSection";

vi.mock("@/services/tauri", () => ({
  getCliInstallPlan: vi.fn(),
  runCliInstaller: vi.fn(),
}));
vi.mock("@/services/events", () => ({
  subscribeCliInstallerEvents: vi.fn(() => vi.fn()),
}));
vi.mock("@/features/computer-use/constants", () => ({
  ENABLE_COMPUTER_USE_BRIDGE: false,
}));
vi.mock("@/features/computer-use/components/ComputerUseStatusCard", () => ({
  ComputerUseStatusCard: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(subscribeCliInstallerEvents).mockReturnValue(vi.fn());
});

function baseSettings(): AppSettings {
  return {
    backendMode: "local",
    geminiEnabled: true,
    opencodeEnabled: true,
  } as AppSettings;
}

function t(key: string) {
  const labels: Record<string, string> = {
    "settings.cliInstallLatest": "Install latest",
    "settings.cliInstallerConfirm": "Confirm and run",
    "settings.cliInstallerCommand": "Will run",
    "settings.cliInstallerSucceeded": "Installer completed",
    "settings.cliInstallerLiveLog": "Live log",
    "settings.cliInstallerElapsed": "Elapsed",
    "settings.cliInstallerWaitingForOutput": "Waiting for installer output...",
    "settings.runDoctor": "Run Doctor",
    "settings.runClaudeDoctor": "Run Claude Doctor",
    "common.cancel": "Cancel",
  };
  return labels[key] ?? key;
}

function renderCodexSection(onInstallerDoctorResult = vi.fn()) {
  render(
    <CodexSection
      active
      t={t}
      appSettings={baseSettings()}
      onUpdateAppSettings={vi.fn()}
      claudePathDraft=""
      setClaudePathDraft={vi.fn()}
      claudeDirty={false}
      handleBrowseClaude={vi.fn()}
      handleSaveClaudeSettings={vi.fn()}
      handleRunClaudeDoctor={vi.fn()}
      claudeDoctorState={{ status: "idle", result: null }}
      codexPathDraft=""
      setCodexPathDraft={vi.fn()}
      codexArgsDraft=""
      setCodexArgsDraft={vi.fn()}
      codexDirty={false}
      handleBrowseCodex={vi.fn()}
      handleSaveCodexSettings={vi.fn()}
      isSavingSettings={false}
      handleRunDoctor={vi.fn()}
      doctorState={{ status: "done", result: { ok: false } as any }}
      remoteHostDraft=""
      setRemoteHostDraft={vi.fn()}
      remoteTokenDraft=""
      setRemoteTokenDraft={vi.fn()}
      handleCommitRemoteHost={vi.fn()}
      handleCommitRemoteToken={vi.fn()}
      onInstallerDoctorResult={onInstallerDoctorResult}
    />,
  );
  return { onInstallerDoctorResult };
}

function createPlan(): CliInstallPlan {
  return {
    engine: "codex",
    action: "installLatest",
    strategy: "npmGlobal",
    backend: "local",
    platform: "macos",
    commandPreview: ["npm", "install", "-g", "@openai/codex@latest"],
    canRun: true,
    blockers: [],
    warnings: [],
    manualFallback: "npm install -g @openai/codex@latest",
  };
}

describe("CodexSection CLI installer", () => {
  it("runs plan-confirm-result flow without raw command input", async () => {
    const plan = createPlan();
    const result: CliInstallResult = {
      ok: true,
      engine: "codex",
      action: "installLatest",
      strategy: "npmGlobal",
      backend: "local",
      exitCode: 0,
      stdoutSummary: null,
      stderrSummary: null,
      details: null,
      durationMs: 120,
      doctorResult: {
        ok: true,
        codexBin: null,
        version: "codex 1.0.0",
        appServerOk: true,
        details: null,
        path: null,
        nodeOk: true,
        nodeVersion: "v22.0.0",
        nodeDetails: null,
      },
    };
    vi.mocked(getCliInstallPlan).mockResolvedValueOnce(plan);
    vi.mocked(runCliInstaller).mockResolvedValueOnce(result);
    const { onInstallerDoctorResult } = renderCodexSection();

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));

    expect(
      await screen.findAllByText("npm install -g @openai/codex@latest"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and run" }));

    await waitFor(() => {
      expect(runCliInstaller).toHaveBeenCalledWith(
        "codex",
        "installLatest",
        "npmGlobal",
        expect.stringMatching(/^codex-/),
      );
    });
    expect(getCliInstallPlan).toHaveBeenCalledWith(
      "codex",
      "installLatest",
      "npmGlobal",
    );
    expect(onInstallerDoctorResult).toHaveBeenCalledWith(
      "codex",
      result.doctorResult,
    );
    expect(await screen.findByText("Installer completed")).not.toBeNull();
  });

  it("renders live installer logs for the matching run id", async () => {
    let progressHandler: Parameters<
      typeof subscribeCliInstallerEvents
    >[0] = () => {};
    vi.mocked(subscribeCliInstallerEvents).mockImplementationOnce((handler) => {
      progressHandler = handler;
      return vi.fn();
    });
    vi.mocked(getCliInstallPlan).mockResolvedValueOnce(createPlan());
    vi.mocked(runCliInstaller).mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    renderCodexSection();

    fireEvent.click(screen.getByRole("button", { name: "Install latest" }));
    await waitFor(() => {
      expect(getCliInstallPlan).toHaveBeenCalledWith(
        "codex",
        "installLatest",
        "npmGlobal",
      );
    });
    await screen.findAllByText("npm install -g @openai/codex@latest");
    fireEvent.click(screen.getByRole("button", { name: "Confirm and run" }));

    await waitFor(() => {
      expect(runCliInstaller).toHaveBeenCalled();
    });
    const runId = vi.mocked(runCliInstaller).mock.calls[0]?.[3] ?? "";
    act(() => {
      progressHandler({
        runId,
        engine: "codex",
        action: "installLatest",
        strategy: "npmGlobal",
        backend: "local",
        phase: "stdout",
        stream: "stdout",
        message: "added 1 package",
        exitCode: null,
        durationMs: null,
      });
    });

    expect(await screen.findByText("Live log")).not.toBeNull();
    expect(
      await screen.findByText(/\[stdout\] added 1 package/),
    ).not.toBeNull();
  });
});
