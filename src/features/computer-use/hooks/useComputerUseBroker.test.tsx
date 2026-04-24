// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runComputerUseCodexBroker } from "../../../services/tauri";
import type { ComputerUseBrokerResult } from "../../../types";
import { useComputerUseBroker } from "./useComputerUseBroker";

vi.mock("../../../services/tauri", () => ({
  runComputerUseCodexBroker: vi.fn(),
}));

function createBrokerResult(): ComputerUseBrokerResult {
  return {
    outcome: "completed",
    failureKind: null,
    bridgeStatus: {
      featureEnabled: true,
      activationEnabled: true,
      status: "blocked",
      platform: "macos",
      codexAppDetected: true,
      pluginDetected: true,
      pluginEnabled: true,
      blockedReasons: ["permission_required", "approval_required"],
      guidanceCodes: ["grant_system_permissions", "review_allowed_apps"],
      codexConfigPath: "/Users/demo/.codex/config.toml",
      pluginManifestPath:
        "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/.codex-plugin/plugin.json",
      helperPath:
        "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
      helperDescriptorPath:
        "/Users/demo/.codex/plugins/cache/openai-bundled/computer-use/1/.mcp.json",
      marketplacePath: null,
      diagnosticMessage: null,
    },
    text: "done",
    diagnosticMessage: "completed",
    durationMs: 10,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useComputerUseBroker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores broker results from the service", async () => {
    const brokerResult = createBrokerResult();
    vi.mocked(runComputerUseCodexBroker).mockResolvedValueOnce(brokerResult);
    const { result } = renderHook(() =>
      useComputerUseBroker({ enabled: true }),
    );

    await act(async () => {
      await result.current.run({
        workspaceId: "workspace-1",
        instruction: "inspect Chrome",
      });
    });

    expect(runComputerUseCodexBroker).toHaveBeenCalledTimes(1);
    expect(result.current.result).toEqual(brokerResult);
    expect(result.current.error).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it("prevents duplicate broker calls before React re-renders", async () => {
    const brokerResult = createBrokerResult();
    const pending = deferred<ComputerUseBrokerResult>();
    vi.mocked(runComputerUseCodexBroker).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() =>
      useComputerUseBroker({ enabled: true }),
    );

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.run({
        workspaceId: "workspace-1",
        instruction: "inspect Chrome",
      });
      secondRun = result.current.run({
        workspaceId: "workspace-1",
        instruction: "inspect Chrome again",
      });
    });

    expect(runComputerUseCodexBroker).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(brokerResult);
      await firstRun;
      await secondRun;
    });

    expect(result.current.result).toEqual(brokerResult);
    expect(result.current.isRunning).toBe(false);
  });

  it("clears stale broker state when disabled", async () => {
    vi.mocked(runComputerUseCodexBroker).mockResolvedValueOnce(
      createBrokerResult(),
    );
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useComputerUseBroker({ enabled }),
      { initialProps: { enabled: true } },
    );

    await act(async () => {
      await result.current.run({
        workspaceId: "workspace-1",
        instruction: "inspect Chrome",
      });
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
