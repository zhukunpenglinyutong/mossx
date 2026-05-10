import { describe, expect, it } from "vitest";
import type { WorkspaceInfo } from "../types";
import {
  resolveNextWorkspaceThreadListHydrationId,
  shouldSkipWorkspaceThreadListLoad,
} from "./workspaceThreadListLoadGuard";

const workspace = (id: string, connected = true): WorkspaceInfo => ({
  id,
  name: id,
  path: `/tmp/${id}`,
  connected,
  settings: { sidebarCollapsed: false },
});

describe("shouldSkipWorkspaceThreadListLoad", () => {
  it("skips auto reload after the workspace thread list has already hydrated", () => {
    expect(
      shouldSkipWorkspaceThreadListLoad({
        isLoading: false,
        hasHydratedThreadList: true,
      }),
    ).toBe(true);
  });

  it("still blocks duplicate in-flight loads", () => {
    expect(
      shouldSkipWorkspaceThreadListLoad({
        isLoading: true,
        hasHydratedThreadList: false,
      }),
    ).toBe(true);
  });

  it("allows force reload even after hydration", () => {
    expect(
      shouldSkipWorkspaceThreadListLoad({
        force: true,
        isLoading: false,
        hasHydratedThreadList: true,
      }),
    ).toBe(false);
  });

  it("skips duplicate loads while a tracked request is still in flight", () => {
    expect(
      shouldSkipWorkspaceThreadListLoad({
        isLoading: false,
        isHydratingThreadList: true,
        hasHydratedThreadList: false,
      }),
    ).toBe(true);
  });
});

describe("resolveNextWorkspaceThreadListHydrationId", () => {
  it("returns the next connected workspace that still needs full hydration", () => {
    expect(
      resolveNextWorkspaceThreadListHydrationId({
        workspaces: [workspace("ws-active"), workspace("ws-side-1"), workspace("ws-side-2")],
        hydratedWorkspaceIds: new Set(["ws-side-1"]),
        hydratingWorkspaceIds: new Set(),
        loadingByWorkspace: {},
      }),
    ).toBe("ws-active");
  });

  it("skips active projection owners because they are handled by the projection effect", () => {
    expect(
      resolveNextWorkspaceThreadListHydrationId({
        workspaces: [
          workspace("ws-main"),
          workspace("ws-worktree-1"),
          workspace("ws-worktree-2"),
          workspace("ws-other"),
        ],
        activeWorkspaceProjectionOwnerIds: ["ws-main", "ws-worktree-1", "ws-worktree-2"],
        hydratedWorkspaceIds: new Set(),
        hydratingWorkspaceIds: new Set(),
        loadingByWorkspace: {},
      }),
    ).toBe("ws-other");
  });

  it("skips disconnected, loading, and already hydrating workspaces", () => {
    expect(
      resolveNextWorkspaceThreadListHydrationId({
        workspaces: [
          workspace("ws-active"),
          workspace("ws-disconnected", false),
          workspace("ws-loading"),
          workspace("ws-hydrating"),
          workspace("ws-ready"),
        ],
        hydratedWorkspaceIds: new Set(),
        hydratingWorkspaceIds: new Set(["ws-active", "ws-hydrating"]),
        loadingByWorkspace: { "ws-loading": true },
      }),
    ).toBe("ws-ready");
  });
});
