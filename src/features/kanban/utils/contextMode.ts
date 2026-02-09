export type KanbanContextMode = "new" | "inherit";

type ResolveKanbanThreadCreationStrategyInput = {
  mode: KanbanContextMode;
  engine: "claude" | "codex";
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
  targetWorkspaceId: string;
  isActiveThreadInWorkspace: boolean;
};

export function resolveKanbanThreadCreationStrategy(
  input: ResolveKanbanThreadCreationStrategyInput,
): "new" | "inherit" {
  if (input.mode !== "inherit") {
    return "new";
  }
  if (!input.activeThreadId) {
    return "new";
  }
  if (!input.activeWorkspaceId || input.activeWorkspaceId !== input.targetWorkspaceId) {
    return "new";
  }
  if (!input.isActiveThreadInWorkspace) {
    return "new";
  }
  return "inherit";
}
