import type { SearchScope } from "../types";

export function resolveSearchScopeOnOpen(
  currentScope: SearchScope,
  activeWorkspaceId: string | null,
): SearchScope {
  if (!activeWorkspaceId) {
    return "global";
  }
  return currentScope;
}
