// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useWorkspaceRestore } from "./useWorkspaceRestore";

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

describe("useWorkspaceRestore", () => {
  it("优先恢复当前工作区，并跳过非当前的折叠工作区", async () => {
    const activeWorkspace = createWorkspace({
      id: "ws-active",
      connected: false,
      settings: { sidebarCollapsed: true },
    });
    const visibleWorkspace = createWorkspace({ id: "ws-visible" });
    const collapsedWorkspace = createWorkspace({
      id: "ws-collapsed",
      settings: { sidebarCollapsed: true },
    });
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRestore({
        workspaces: [visibleWorkspace, collapsedWorkspace, activeWorkspace],
        hasLoaded: true,
        activeWorkspaceId: activeWorkspace.id,
        restoreThreadsOnlyOnLaunch: false,
        listThreadsForWorkspace,
      }),
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);
    });

    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
      1,
      activeWorkspace,
      {
        includeOpenCodeSessions: false,
        recoverySource: "workspace-restore",
        allowRuntimeReconnect: true,
      },
    );
    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
      2,
      visibleWorkspace,
      {
        includeOpenCodeSessions: false,
        recoverySource: "workspace-restore",
        allowRuntimeReconnect: true,
      },
    );
    expect(
      listThreadsForWorkspace.mock.calls.map((call) => call[0].id),
    ).toEqual(["ws-active", "ws-visible"]);
  });

  it("开启线程恢复模式时不会在启动阶段批量连接 runtime", async () => {
    const activeWorkspace = createWorkspace({
      id: "ws-active",
      connected: false,
    });
    const visibleWorkspace = createWorkspace({
      id: "ws-visible",
      connected: false,
    });
    const listThreadsForWorkspace = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceRestore({
        workspaces: [visibleWorkspace, activeWorkspace],
        hasLoaded: true,
        activeWorkspaceId: activeWorkspace.id,
        restoreThreadsOnlyOnLaunch: true,
        listThreadsForWorkspace,
      }),
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);
    });

    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
      1,
      activeWorkspace,
      {
        includeOpenCodeSessions: false,
        recoverySource: "workspace-restore",
        allowRuntimeReconnect: false,
      },
    );
    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
      2,
      visibleWorkspace,
      {
        includeOpenCodeSessions: false,
        recoverySource: "workspace-restore",
        allowRuntimeReconnect: false,
      },
    );
  });

  it("active workspace 恢复失败时不会阻断其他工作区，并且后续 render 会重试失败项", async () => {
    const activeWorkspace = createWorkspace({
      id: "ws-active",
      connected: false,
    });
    const visibleWorkspace = createWorkspace({
      id: "ws-visible",
      connected: true,
    });
    const listThreadsForWorkspace = vi.fn()
      .mockRejectedValueOnce(new Error("connect failed"))
      .mockResolvedValue(undefined);

    const { rerender } = renderHook(
      (props: {
        workspaces: WorkspaceInfo[];
        activeWorkspaceId: string | null;
      }) =>
        useWorkspaceRestore({
          workspaces: props.workspaces,
          hasLoaded: true,
          activeWorkspaceId: props.activeWorkspaceId,
          restoreThreadsOnlyOnLaunch: false,
          listThreadsForWorkspace,
        }),
      {
        initialProps: {
          workspaces: [visibleWorkspace, activeWorkspace],
          activeWorkspaceId: activeWorkspace.id,
        },
      },
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledWith(visibleWorkspace, {
        includeOpenCodeSessions: false,
        recoverySource: "workspace-restore",
        allowRuntimeReconnect: true,
      });
    });
    expect(listThreadsForWorkspace).toHaveBeenCalledWith(activeWorkspace, {
      includeOpenCodeSessions: false,
      recoverySource: "workspace-restore",
      allowRuntimeReconnect: true,
    });
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);

    rerender({
      workspaces: [visibleWorkspace, activeWorkspace],
      activeWorkspaceId: activeWorkspace.id,
    });

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledWith(activeWorkspace, {
        includeOpenCodeSessions: false,
        recoverySource: "workspace-restore",
        allowRuntimeReconnect: true,
      });
    });
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(3);
  });

  it("workspace refresh rerender does not restart a restore that already succeeded in flight", async () => {
    const activeWorkspace = createWorkspace({
      id: "ws-active",
      connected: true,
    });
    const deferredRestore = (() => {
      let resolve = () => {};
      const promise = new Promise<void>((nextResolve) => {
        resolve = nextResolve;
      });
      return { promise, resolve };
    })();
    const listThreadsForWorkspace = vi.fn().mockImplementation(
      () => deferredRestore.promise,
    );

    const { rerender } = renderHook(
      (props: { workspaces: WorkspaceInfo[] }) =>
        useWorkspaceRestore({
          workspaces: props.workspaces,
          hasLoaded: true,
          activeWorkspaceId: activeWorkspace.id,
          restoreThreadsOnlyOnLaunch: false,
          listThreadsForWorkspace,
        }),
      {
        initialProps: {
          workspaces: [activeWorkspace],
        },
      },
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
    });

    rerender({
      workspaces: [{ ...activeWorkspace }],
    });

    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);

    deferredRestore.resolve();

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
    });

    rerender({
      workspaces: [{ ...activeWorkspace, name: "workspace-renamed" }],
    });

    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
  });
});
