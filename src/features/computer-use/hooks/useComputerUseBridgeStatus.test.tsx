// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getComputerUseBridgeStatus } from "../../../services/tauri";
import type { ComputerUseBridgeStatus } from "../../../types";
import { useComputerUseBridgeStatus } from "./useComputerUseBridgeStatus";

vi.mock("../../../services/tauri", () => ({
  getComputerUseBridgeStatus: vi.fn(),
}));

function createBridgeStatus(
  diagnosticMessage: string | null,
): ComputerUseBridgeStatus {
  return {
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
    diagnosticMessage,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useComputerUseBridgeStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the newest refresh result when responses resolve out of order", async () => {
    const first = deferred<ComputerUseBridgeStatus>();
    const second = deferred<ComputerUseBridgeStatus>();
    vi.mocked(getComputerUseBridgeStatus)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result } = renderHook(() =>
      useComputerUseBridgeStatus({ enabled: true }),
    );

    await waitFor(() => {
      expect(getComputerUseBridgeStatus).toHaveBeenCalledTimes(1);
    });

    let refreshRun!: Promise<void>;
    act(() => {
      refreshRun = result.current.refresh();
    });
    expect(getComputerUseBridgeStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve(createBridgeStatus("new status"));
      await refreshRun;
    });
    expect(result.current.status?.diagnosticMessage).toBe("new status");

    await act(async () => {
      first.resolve(createBridgeStatus("stale status"));
      await first.promise;
    });
    expect(result.current.status?.diagnosticMessage).toBe("new status");
  });

  it("invalidates in-flight status loading when disabled", async () => {
    const pending = deferred<ComputerUseBridgeStatus>();
    vi.mocked(getComputerUseBridgeStatus).mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useComputerUseBridgeStatus({ enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => {
      expect(getComputerUseBridgeStatus).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender({ enabled: false });
    });
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      pending.resolve(createBridgeStatus("stale status"));
      await pending.promise;
    });
    expect(result.current.status).toBeNull();
  });
});
