export type StartupOwnerKind = "legacy-hook" | "orchestrator-task";

export type StartupOwnerRecord = {
  commandLabel: string;
  ownerKind: StartupOwnerKind;
  ownerId: string;
  scope: "global" | "workspace";
};

export const STARTUP_OWNER_RECORDS: readonly StartupOwnerRecord[] = [
  {
    commandLabel: "dictation_model_status",
    ownerKind: "orchestrator-task",
    ownerId: "dictation-status:on-demand",
    scope: "global",
  },
  {
    commandLabel: "skills_list",
    ownerKind: "orchestrator-task",
    ownerId: "skills-list:idle-prewarm",
    scope: "workspace",
  },
  {
    commandLabel: "prompts_list",
    ownerKind: "orchestrator-task",
    ownerId: "prompts-list:idle-prewarm",
    scope: "workspace",
  },
  {
    commandLabel: "claude_commands_list",
    ownerKind: "orchestrator-task",
    ownerId: "claude-commands-list:idle-prewarm",
    scope: "workspace",
  },
  {
    commandLabel: "opencode_commands_list",
    ownerKind: "orchestrator-task",
    ownerId: "opencode-commands-list:idle-prewarm",
    scope: "global",
  },
  {
    commandLabel: "collaboration_mode_list",
    ownerKind: "orchestrator-task",
    ownerId: "collaboration-modes:idle-prewarm",
    scope: "workspace",
  },
  {
    commandLabel: "opencode_agents_list",
    ownerKind: "orchestrator-task",
    ownerId: "opencode-agents-list:idle-prewarm",
    scope: "global",
  },
  {
    commandLabel: "model_list",
    ownerKind: "orchestrator-task",
    ownerId: "model-catalog:idle-prewarm",
    scope: "workspace",
  },
  {
    commandLabel: "get_engine_models",
    ownerKind: "orchestrator-task",
    ownerId: "engine-models:idle-prewarm",
    scope: "global",
  },
  {
    commandLabel: "list_threads",
    ownerKind: "orchestrator-task",
    ownerId: "thread-list:active-workspace-or-idle",
    scope: "workspace",
  },
  {
    commandLabel: "list_thread_titles",
    ownerKind: "legacy-hook",
    ownerId: "useThreadActions",
    scope: "workspace",
  },
  {
    commandLabel: "list_claude_sessions",
    ownerKind: "legacy-hook",
    ownerId: "useThreadActions",
    scope: "global",
  },
  {
    commandLabel: "opencode_session_list",
    ownerKind: "legacy-hook",
    ownerId: "useThreadActions",
    scope: "workspace",
  },
  {
    commandLabel: "list_gemini_sessions",
    ownerKind: "legacy-hook",
    ownerId: "useThreadActions",
    scope: "global",
  },
  {
    commandLabel: "list_workspace_files",
    ownerKind: "legacy-hook",
    ownerId: "useWorkspaceFiles",
    scope: "workspace",
  },
  {
    commandLabel: "get_git_status",
    ownerKind: "legacy-hook",
    ownerId: "useGitStatus",
    scope: "workspace",
  },
  {
    commandLabel: "get_git_diffs",
    ownerKind: "legacy-hook",
    ownerId: "useGitDiffs",
    scope: "workspace",
  },
];

export function findDuplicateStartupOwners(
  records: readonly StartupOwnerRecord[] = STARTUP_OWNER_RECORDS,
) {
  const ownerKindsByCommand = new Map<string, Set<StartupOwnerKind>>();
  for (const record of records) {
    const ownerKinds = ownerKindsByCommand.get(record.commandLabel) ?? new Set<StartupOwnerKind>();
    ownerKinds.add(record.ownerKind);
    ownerKindsByCommand.set(record.commandLabel, ownerKinds);
  }
  return [...ownerKindsByCommand.entries()]
    .filter(([, ownerKinds]) => ownerKinds.size > 1)
    .map(([commandLabel]) => commandLabel)
    .sort();
}
