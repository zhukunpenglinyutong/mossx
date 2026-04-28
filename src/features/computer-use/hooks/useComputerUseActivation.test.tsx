// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runComputerUseActivationProbe } from "../../../services/tauri";
import type { ComputerUseActivationResult } from "../../../types";
import { useComputerUseActivation } from "./useComputerUseActivation";

vi.mock("../../../services/tauri", () => ({
  runComputerUseActivationProbe: vi.fn(),
}));

function createActivationResult(): ComputerUseActivationResult {
  return {
    outcome: "failed",
    failureKind: "host_incompatible",
    bridgeStatus: {
      featureEnabled: true,
      activationEnabled: true,
      status: "blocked",
      platform: "macos",
      codexAppDetected: true,
      pluginDetected: true,
      pluginEnabled: true,
      blockedReasons: ["helper_bridge_unverified"],
      guidanceCodes: ["verify_helper_bridge"],
      codexConfigPath: "/Users/demo/.codex/config.toml",
      pluginManifestPath:
        "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/.codex-plugin/plugin.json",
      helperPath: "/Applications/Codex.app/Contents/MacOS/SkyComputerUseClient",
      helperDescriptorPath:
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/.mcp.json",
      marketplacePath:
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/.agents/plugins/marketplace.json",
      diagnosticMessage: null,
      authorizationContinuity: {
        kind: "matching_host",
        diagnosticMessage:
          "current host matches the last successful authorization host",
        currentHost: {
          displayName: "ccgui.app",
          executablePath: "/Applications/ccgui.app/Contents/MacOS/cc-gui",
          identifier: "com.codex.ccgui",
          teamIdentifier: "TEAM123",
          backendMode: "local",
          hostRole: "foreground_app",
          launchMode: "packaged_app",
          signingSummary: "Authority=Developer ID Application: Demo",
        },
        lastSuccessfulHost: {
          displayName: "ccgui.app",
          executablePath: "/Applications/ccgui.app/Contents/MacOS/cc-gui",
          identifier: "com.codex.ccgui",
          teamIdentifier: "TEAM123",
          backendMode: "local",
          hostRole: "foreground_app",
          launchMode: "packaged_app",
          signingSummary: "Authority=Developer ID Application: Demo",
        },
        driftFields: [],
      },
    },
    durationMs: 0,
    diagnosticMessage: "diagnostics-only fallback",
    stderrSnippet: null,
    exitCode: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useComputerUseActivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores activation results from the service", async () => {
    const activationResult = createActivationResult();
    vi.mocked(runComputerUseActivationProbe).mockResolvedValueOnce(activationResult);
    const { result } = renderHook(() =>
      useComputerUseActivation({ enabled: true }),
    );

    await act(async () => {
      await result.current.activate();
    });

    expect(runComputerUseActivationProbe).toHaveBeenCalledTimes(1);
    expect(result.current.result).toEqual(activationResult);
    expect(result.current.error).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it("prevents duplicate frontend activation calls before React re-renders", async () => {
    const activationResult = createActivationResult();
    const pending = deferred<ComputerUseActivationResult>();
    vi.mocked(runComputerUseActivationProbe).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() =>
      useComputerUseActivation({ enabled: true }),
    );

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.activate();
      secondRun = result.current.activate();
    });

    expect(runComputerUseActivationProbe).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(activationResult);
      await firstRun;
      await secondRun;
    });

    expect(result.current.result).toEqual(activationResult);
    expect(result.current.isRunning).toBe(false);
  });

  it("clears stale activation state when the lane is disabled", async () => {
    vi.mocked(runComputerUseActivationProbe).mockResolvedValueOnce(
      createActivationResult(),
    );
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useComputerUseActivation({ enabled }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await result.current.activate();
    });
    expect(result.current.result).not.toBeNull();

    await act(async () => {
      rerender({ enabled: false });
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });
});
