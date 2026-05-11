// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceRefreshOnFocus } from "./useWorkspaceRefreshOnFocus";

function createWorkspace(
  overrides: Partial<WorkspaceInfo> & Pick<WorkspaceInfo, "id">,
): WorkspaceInfo {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    path: overrides.path ?? `/tmp/${overrides.id}`,
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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useWorkspaceRefreshOnFocus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("聚焦时仅刷新当前与可见工作区，并保持 preserveState", async () => {
    const activeWorkspace = createWorkspace({
      id: "ws-active",
      settings: { sidebarCollapsed: true },
    });
    const visibleWorkspace = createWorkspace({ id: "ws-visible" });
    const collapsedWorkspace = createWorkspace({
      id: "ws-collapsed",
      settings: { sidebarCollapsed: true },
    });
    const disconnectedWorkspace = createWorkspace({
      id: "ws-offline",
      connected: false,
    });
    const refreshWorkspaces = vi.fn().mockResolvedValue([
      visibleWorkspace,
      collapsedWorkspace,
      activeWorkspace,
      disconnectedWorkspace,
    ]);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRefreshOnFocus({
        workspaces: [
          visibleWorkspace,
          collapsedWorkspace,
          activeWorkspace,
          disconnectedWorkspace,
        ],
        activeWorkspaceId: activeWorkspace.id,
        refreshWorkspaces,
        listThreadsForWorkspace,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);
    });

    expect(
      listThreadsForWorkspace.mock.calls.map((call) => call[0].id),
    ).toEqual(["ws-active", "ws-visible"]);
    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
      1,
      activeWorkspace,
      {
        preserveState: true,
        includeOpenCodeSessions: false,
        recoverySource: "focus-refresh",
      },
    );
    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
      2,
      visibleWorkspace,
      {
        preserveState: true,
        includeOpenCodeSessions: false,
        recoverySource: "focus-refresh",
      },
    );
  });

  it("coalesces repeated focus refresh events within the cooldown window", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(30_000));
    const activeWorkspace = createWorkspace({ id: "ws-active" });
    const refreshWorkspaces = vi.fn().mockResolvedValue([activeWorkspace]);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRefreshOnFocus({
        workspaces: [activeWorkspace],
        activeWorkspaceId: activeWorkspace.id,
        refreshWorkspaces,
        listThreadsForWorkspace,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(29_999);
      await Promise.resolve();
    });
    expect(refreshWorkspaces).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshWorkspaces).toHaveBeenCalledTimes(2);
  });

  it("does not schedule pending refresh work after unmount", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(30_000));
    const activeWorkspace = createWorkspace({ id: "ws-active" });
    const deferredRefresh = createDeferred<WorkspaceInfo[]>();
    const refreshWorkspaces = vi.fn().mockReturnValue(deferredRefresh.promise);
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    const { unmount } = renderHook(() =>
      useWorkspaceRefreshOnFocus({
        workspaces: [activeWorkspace],
        activeWorkspaceId: activeWorkspace.id,
        refreshWorkspaces,
        listThreadsForWorkspace,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    unmount();
    deferredRefresh.resolve([activeWorkspace]);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listThreadsForWorkspace).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
