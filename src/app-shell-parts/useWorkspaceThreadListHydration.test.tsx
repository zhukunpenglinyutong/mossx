// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../types";
import {
  getStartupTraceSnapshot,
  resetStartupTraceForTests,
} from "../features/startup-orchestration/utils/startupTrace";
import { useWorkspaceThreadListHydration } from "./useWorkspaceThreadListHydration";

function createWorkspace(id: string): WorkspaceInfo {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    connected: true,
    settings: { sidebarCollapsed: false },
  };
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useWorkspaceThreadListHydration", () => {
  beforeEach(() => {
    resetStartupTraceForTests();
  });

  it("progresses to the next background workspace after the current hydration attempt settles", async () => {
    const workspaces = [createWorkspace("ws-1"), createWorkspace("ws-2")];
    const deferredFirst = createDeferred();
    const listThreadsForWorkspace = vi
      .fn<
        (
          workspace: WorkspaceInfo,
          options?: {
            preserveState?: boolean;
            includeOpenCodeSessions?: boolean;
            startupHydrationMode?: "first-page" | "full-catalog";
          },
        ) => Promise<void>
      >()
      .mockImplementationOnce(async () => {
        await deferredFirst.promise;
      })
      .mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceThreadListHydration({
        activeWorkspaceId: null,
        activeWorkspaceProjectionOwnerIds: [],
        listThreadsForWorkspace,
        threadListLoadingByWorkspace: {},
        workspaces,
        workspacesById: new Map(workspaces.map((workspace) => [workspace.id, workspace])),
      }),
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
      expect(listThreadsForWorkspace).toHaveBeenCalledWith(
        workspaces[0],
        expect.objectContaining({
          preserveState: true,
          startupHydrationMode: "full-catalog",
        }),
      );
    });

    expect(listThreadsForWorkspace).not.toHaveBeenCalledWith(
      workspaces[1],
      expect.anything(),
    );

    deferredFirst.resolve();

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);
      expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
        2,
        workspaces[1],
        expect.objectContaining({
          preserveState: true,
          startupHydrationMode: "full-catalog",
        }),
      );
    });
  });

  it("routes active workspace hydration before idle background hydration", async () => {
    const workspaces = [createWorkspace("ws-1"), createWorkspace("ws-2")];
    const listThreadsForWorkspace = vi.fn<
      (
        workspace: WorkspaceInfo,
        options?: {
          preserveState?: boolean;
          includeOpenCodeSessions?: boolean;
          startupHydrationMode?: "first-page" | "full-catalog";
        },
      ) => Promise<void>
    >().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceThreadListHydration({
        activeWorkspaceId: "ws-2",
        activeWorkspaceProjectionOwnerIds: [],
        listThreadsForWorkspace,
        threadListLoadingByWorkspace: {},
        workspaces: [],
        workspacesById: new Map(workspaces.map((workspace) => [workspace.id, workspace])),
      }),
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledWith(
        workspaces[1],
        expect.objectContaining({
          preserveState: true,
          startupHydrationMode: "first-page",
        }),
      );
    });

    const taskEvents = getStartupTraceSnapshot().events.filter(
      (event): event is Extract<typeof event, { type: "task" }> =>
        event.type === "task" && event.taskId === "thread-list:first-page:ws-2",
    );
    expect(taskEvents.some((event) => event.phase === "active-workspace")).toBe(true);
    expect(getStartupTraceSnapshot().milestones["active-workspace-ready"]).toBeTruthy();
  });

  it("follows active first-page hydration with idle full-catalog hydration", async () => {
    const workspaces = [createWorkspace("ws-1")];
    const listThreadsForWorkspace = vi.fn<
      (
        workspace: WorkspaceInfo,
        options?: {
          preserveState?: boolean;
          includeOpenCodeSessions?: boolean;
          startupHydrationMode?: "first-page" | "full-catalog";
        },
      ) => Promise<void>
    >().mockResolvedValue(undefined);

    renderHook(() =>
      useWorkspaceThreadListHydration({
        activeWorkspaceId: "ws-1",
        activeWorkspaceProjectionOwnerIds: ["ws-1"],
        listThreadsForWorkspace,
        threadListLoadingByWorkspace: {},
        workspaces,
        workspacesById: new Map(workspaces.map((workspace) => [workspace.id, workspace])),
      }),
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledWith(
        workspaces[0],
        expect.objectContaining({
          startupHydrationMode: "first-page",
        }),
      );
    });
    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledWith(
        workspaces[0],
        expect.objectContaining({
          startupHydrationMode: "full-catalog",
        }),
      );
    });
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);

    const fullCatalogEvents = getStartupTraceSnapshot().events.filter(
      (event): event is Extract<typeof event, { type: "task" }> =>
        event.type === "task" && event.taskId === "thread-list:full-catalog:ws-1",
    );
    expect(fullCatalogEvents.some((event) => event.phase === "idle-prewarm")).toBe(true);
  });

  it("routes session radar prewarm as an idle full-catalog task", async () => {
    const workspaces = [createWorkspace("ws-1")];
    const listThreadsForWorkspace = vi.fn<
      (
        workspace: WorkspaceInfo,
        options?: {
          preserveState?: boolean;
          includeOpenCodeSessions?: boolean;
          startupHydrationMode?: "first-page" | "full-catalog";
        },
      ) => Promise<void>
    >().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useWorkspaceThreadListHydration({
        activeWorkspaceId: null,
        activeWorkspaceProjectionOwnerIds: [],
        listThreadsForWorkspace,
        threadListLoadingByWorkspace: {},
        workspaces: [],
        workspacesById: new Map(workspaces.map((workspace) => [workspace.id, workspace])),
      }),
    );

    result.current.prewarmSessionRadarForWorkspace("ws-1");

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledWith(
        workspaces[0],
        expect.objectContaining({
          includeOpenCodeSessions: false,
          preserveState: true,
          startupHydrationMode: "full-catalog",
        }),
      );
    });

    const taskEvents = getStartupTraceSnapshot().events.filter(
      (event): event is Extract<typeof event, { type: "task" }> =>
        event.type === "task" && event.taskId === "thread-list:session-radar:ws-1",
    );
    expect(taskEvents.some((event) => event.phase === "idle-prewarm")).toBe(true);
  });

  it("does not start session radar prewarm while workspace hydration is in flight", async () => {
    const workspaces = [createWorkspace("ws-1")];
    const activeHydration = createDeferred();
    const listThreadsForWorkspace = vi.fn<
      (
        workspace: WorkspaceInfo,
        options?: {
          preserveState?: boolean;
          includeOpenCodeSessions?: boolean;
          startupHydrationMode?: "first-page" | "full-catalog";
        },
      ) => Promise<void>
    >().mockImplementationOnce(async () => activeHydration.promise);

    const { result } = renderHook(() =>
      useWorkspaceThreadListHydration({
        activeWorkspaceId: "ws-1",
        activeWorkspaceProjectionOwnerIds: [],
        listThreadsForWorkspace,
        threadListLoadingByWorkspace: {},
        workspaces,
        workspacesById: new Map(workspaces.map((workspace) => [workspace.id, workspace])),
      }),
    );

    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);
    });

    result.current.prewarmSessionRadarForWorkspace("ws-1");
    expect(listThreadsForWorkspace).toHaveBeenCalledTimes(1);

    activeHydration.resolve();
    await waitFor(() => {
      expect(listThreadsForWorkspace).toHaveBeenCalledTimes(2);
    });
    expect(listThreadsForWorkspace).toHaveBeenNthCalledWith(
      2,
      workspaces[0],
      expect.objectContaining({
        startupHydrationMode: "full-catalog",
      }),
    );
  });
});
