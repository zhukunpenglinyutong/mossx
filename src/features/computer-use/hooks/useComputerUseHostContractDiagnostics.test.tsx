// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runComputerUseHostContractDiagnostics } from "../../../services/tauri";
import type { ComputerUseHostContractDiagnosticsResult } from "../../../types";
import { useComputerUseHostContractDiagnostics } from "./useComputerUseHostContractDiagnostics";

vi.mock("../../../services/tauri", () => ({
  runComputerUseHostContractDiagnostics: vi.fn(),
}));

function createDiagnosticsResult(): ComputerUseHostContractDiagnosticsResult {
  return {
    kind: "requires_official_parent",
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
    },
    evidence: {
      helperPath: "/Applications/Codex.app/Contents/MacOS/SkyComputerUseClient",
      helperDescriptorPath:
        "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/.mcp.json",
      currentHostPath:
        "/Applications/ThirdPartyHost.app/Contents/MacOS/third-party-host",
      handoffMethod: "direct_exec_skipped_nested_app_bundle",
      codesignSummary: "codesign exited with status 0",
      spctlSummary: "spctl exited with status 0",
      durationMs: 4,
      stdoutSnippet: null,
      stderrSnippet: "Authority=Developer ID Application",
      officialParentHandoff: {
        kind: "requires_official_parent",
        methods: [],
        evidence: {
          codexInfoPlistPath: "/Applications/Codex.app/Contents/Info.plist",
          serviceInfoPlistPath:
            "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/Info.plist",
          helperInfoPlistPath:
            "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/Info.plist",
          parentCodeRequirementPath:
            "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/Resources/SkyComputerUseClient_Parent.coderequirement",
          pluginManifestPath:
            "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/.codex-plugin/plugin.json",
          mcpDescriptorPath:
            "/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/.mcp.json",
          codexUrlSchemes: ["codex"],
          serviceBundleIdentifier: "com.openai.sky.CUAService",
          helperBundleIdentifier: "com.openai.sky.CUAService.cli",
          parentTeamIdentifier: "2DC432GLL2",
          applicationGroups: ["2DC432GLL2.com.openai.sky.CUAService"],
          xpcServiceIdentifiers: [],
          durationMs: 3,
          stdoutSnippet: null,
          stderrSnippet: null,
        },
        durationMs: 3,
        diagnosticMessage:
          "Readable metadata points to an official OpenAI parent/team contract.",
      },
    },
    durationMs: 4,
    diagnosticMessage:
      "Computer Use helper appears to require the official Codex parent contract.",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useComputerUseHostContractDiagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores host-contract diagnostics results from the service", async () => {
    const diagnosticsResult = createDiagnosticsResult();
    vi.mocked(runComputerUseHostContractDiagnostics).mockResolvedValueOnce(
      diagnosticsResult,
    );
    const { result } = renderHook(() =>
      useComputerUseHostContractDiagnostics({ enabled: true }),
    );

    await act(async () => {
      await result.current.diagnose();
    });

    expect(runComputerUseHostContractDiagnostics).toHaveBeenCalledTimes(1);
    expect(result.current.result).toEqual(diagnosticsResult);
    expect(result.current.error).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it("prevents duplicate diagnostics calls before React re-renders", async () => {
    const diagnosticsResult = createDiagnosticsResult();
    const pending = deferred<ComputerUseHostContractDiagnosticsResult>();
    vi.mocked(runComputerUseHostContractDiagnostics).mockReturnValueOnce(
      pending.promise,
    );
    const { result } = renderHook(() =>
      useComputerUseHostContractDiagnostics({ enabled: true }),
    );

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.diagnose();
      secondRun = result.current.diagnose();
    });

    expect(runComputerUseHostContractDiagnostics).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(diagnosticsResult);
      await firstRun;
      await secondRun;
    });

    expect(result.current.result).toEqual(diagnosticsResult);
    expect(result.current.isRunning).toBe(false);
  });

  it("clears stale diagnostics when disabled", async () => {
    vi.mocked(runComputerUseHostContractDiagnostics).mockResolvedValueOnce(
      createDiagnosticsResult(),
    );
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useComputerUseHostContractDiagnostics({ enabled }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await result.current.diagnose();
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
