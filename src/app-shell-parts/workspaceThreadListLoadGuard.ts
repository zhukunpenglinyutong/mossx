type WorkspaceThreadListLoadGuardOptions = {
  force?: boolean;
  isLoading: boolean;
  hasHydratedThreadList: boolean;
};

export function shouldSkipWorkspaceThreadListLoad({
  force = false,
  isLoading,
  hasHydratedThreadList,
}: WorkspaceThreadListLoadGuardOptions): boolean {
  if (force) {
    return false;
  }
  return isLoading || hasHydratedThreadList;
}
