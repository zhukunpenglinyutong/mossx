// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("useWorkspaceRefreshOnFocus", () => {
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
});
