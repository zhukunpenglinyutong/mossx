import type { WorkspaceInfo } from "../types";

type WorkspaceThreadListLoadGuardOptions = {
  force?: boolean;
  isLoading: boolean;
  hasHydratedThreadList: boolean;
  isHydratingThreadList?: boolean;
};

export function shouldSkipWorkspaceThreadListLoad({
  force = false,
  isLoading,
  hasHydratedThreadList,
  isHydratingThreadList = false,
}: WorkspaceThreadListLoadGuardOptions): boolean {
  if (force) {
    return false;
  }
  return isLoading || isHydratingThreadList || hasHydratedThreadList;
}

type ResolveNextWorkspaceThreadListHydrationIdOptions = {
  workspaces: WorkspaceInfo[];
  activeWorkspaceProjectionOwnerIds?: readonly string[];
  hydratedWorkspaceIds: ReadonlySet<string>;
  hydratingWorkspaceIds: ReadonlySet<string>;
  loadingByWorkspace: Record<string, boolean>;
};

export function resolveNextWorkspaceThreadListHydrationId({
  workspaces,
  activeWorkspaceProjectionOwnerIds = [],
  hydratedWorkspaceIds,
  hydratingWorkspaceIds,
  loadingByWorkspace,
}: ResolveNextWorkspaceThreadListHydrationIdOptions): string | null {
  const excludedWorkspaceIds = new Set<string>(activeWorkspaceProjectionOwnerIds);

  for (const workspace of workspaces) {
    if (!workspace.connected) {
      continue;
    }
    if (excludedWorkspaceIds.has(workspace.id)) {
      continue;
    }
    if (loadingByWorkspace[workspace.id]) {
      continue;
    }
    if (hydratingWorkspaceIds.has(workspace.id)) {
      continue;
    }
    if (hydratedWorkspaceIds.has(workspace.id)) {
      continue;
    }
    return workspace.id;
  }

  return null;
}
