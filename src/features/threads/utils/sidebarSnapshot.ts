import type { ThreadSummary, WorkspaceInfo, WorkspaceSettings } from "../../../types";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

const SIDEBAR_SNAPSHOT_KEY = "sidebarSnapshot";
const SIDEBAR_SNAPSHOT_VERSION = 1;

export type SidebarSnapshot = {
  version: 1;
  updatedAt: number;
  workspaces: WorkspaceInfo[];
  threadsByWorkspace: Record<string, ThreadSummary[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeWorkspaceSettings(value: unknown): WorkspaceSettings | null {
  if (!isRecord(value) || typeof value.sidebarCollapsed !== "boolean") {
    return null;
  }
  const settings: WorkspaceSettings = {
    sidebarCollapsed: value.sidebarCollapsed,
  };
  if (typeof value.sortOrder === "number") {
    settings.sortOrder = value.sortOrder;
  }
  if (typeof value.groupId === "string" || value.groupId === null) {
    settings.groupId = value.groupId;
  }
  if (typeof value.projectAlias === "string" || value.projectAlias === null) {
    settings.projectAlias = value.projectAlias;
  }
  if (typeof value.gitRoot === "string" || value.gitRoot === null) {
    settings.gitRoot = value.gitRoot;
  }
  if (typeof value.codexHome === "string" || value.codexHome === null) {
    settings.codexHome = value.codexHome;
  }
  if (typeof value.codexArgs === "string" || value.codexArgs === null) {
    settings.codexArgs = value.codexArgs;
  }
  if (typeof value.launchScript === "string" || value.launchScript === null) {
    settings.launchScript = value.launchScript;
  }
  if (Array.isArray(value.launchScripts)) {
    settings.launchScripts = value.launchScripts;
  }
  if (
    typeof value.worktreeSetupScript === "string" ||
    value.worktreeSetupScript === null
  ) {
    settings.worktreeSetupScript = value.worktreeSetupScript;
  }
  return settings;
}

function normalizeWorkspace(value: unknown): WorkspaceInfo | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.path !== "string" ||
    typeof value.connected !== "boolean"
  ) {
    return null;
  }
  const settings = normalizeWorkspaceSettings(value.settings);
  if (!settings) {
    return null;
  }
  const worktree = isRecord(value.worktree) && typeof value.worktree.branch === "string"
    ? {
        branch: value.worktree.branch,
        baseRef:
          typeof value.worktree.baseRef === "string" || value.worktree.baseRef === null
            ? value.worktree.baseRef
            : undefined,
        baseCommit:
          typeof value.worktree.baseCommit === "string" || value.worktree.baseCommit === null
            ? value.worktree.baseCommit
            : undefined,
        tracking:
          typeof value.worktree.tracking === "string" || value.worktree.tracking === null
            ? value.worktree.tracking
            : undefined,
        publishError:
          typeof value.worktree.publishError === "string" || value.worktree.publishError === null
            ? value.worktree.publishError
            : undefined,
        publishRetryCommand:
          typeof value.worktree.publishRetryCommand === "string" ||
          value.worktree.publishRetryCommand === null
            ? value.worktree.publishRetryCommand
            : undefined,
      }
    : value.worktree === null || value.worktree === undefined
      ? null
      : null;

  const workspace: WorkspaceInfo = {
    id: value.id,
    name: value.name,
    path: value.path,
    connected: value.connected,
    settings,
  };
  if (typeof value.codex_bin === "string" || value.codex_bin === null) {
    workspace.codex_bin = value.codex_bin;
  }
  if (value.kind === "main" || value.kind === "worktree") {
    workspace.kind = value.kind;
  }
  if (typeof value.parentId === "string" || value.parentId === null) {
    workspace.parentId = value.parentId;
  }
  if (worktree) {
    workspace.worktree = worktree;
  } else if (value.worktree === null) {
    workspace.worktree = null;
  }
  return workspace;
}

function normalizeThreadSummary(value: unknown): ThreadSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.updatedAt !== "number" ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null;
  }
  const summary: ThreadSummary = {
    id: value.id,
    name: value.name,
    updatedAt: value.updatedAt,
  };
  if (typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes)) {
    summary.sizeBytes = value.sizeBytes;
  }
  if (
    value.engineSource === "codex" ||
    value.engineSource === "claude" ||
    value.engineSource === "gemini" ||
    value.engineSource === "opencode"
  ) {
    summary.engineSource = value.engineSource;
  }
  if (typeof value.source === "string") {
    summary.source = value.source;
  }
  if (typeof value.provider === "string") {
    summary.provider = value.provider;
  }
  if (typeof value.sourceLabel === "string") {
    summary.sourceLabel = value.sourceLabel;
  }
  if (typeof value.partialSource === "string") {
    summary.partialSource = value.partialSource;
  }
  if (typeof value.isDegraded === "boolean") {
    summary.isDegraded = value.isDegraded;
  }
  if (typeof value.degradedReason === "string") {
    summary.degradedReason = value.degradedReason;
  }
  if (typeof value.folderId === "string") {
    const folderId = value.folderId.trim();
    summary.folderId = folderId.length > 0 ? folderId : null;
  } else if (value.folderId === null) {
    summary.folderId = null;
  }
  return summary;
}

function shouldPersistSidebarThreads(threads: ThreadSummary[]): boolean {
  return !threads.some((thread) => thread.isDegraded);
}

function normalizeThreadsByWorkspace(
  value: unknown,
): Record<string, ThreadSummary[]> | null {
  if (!isRecord(value)) {
    return null;
  }
  const normalized: Record<string, ThreadSummary[]> = {};
  for (const [workspaceId, rawThreads] of Object.entries(value)) {
    if (!workspaceId.trim() || !Array.isArray(rawThreads)) {
      return null;
    }
    const threads: ThreadSummary[] = [];
    for (const rawThread of rawThreads) {
      const thread = normalizeThreadSummary(rawThread);
      if (!thread) {
        return null;
      }
      threads.push(thread);
    }
    normalized[workspaceId] = threads;
  }
  return normalized;
}

function normalizeSidebarSnapshot(value: unknown): SidebarSnapshot | null {
  if (!isRecord(value) || value.version !== SIDEBAR_SNAPSHOT_VERSION) {
    return null;
  }
  if (typeof value.updatedAt !== "number" || !Number.isFinite(value.updatedAt)) {
    return null;
  }
  if (!Array.isArray(value.workspaces)) {
    return null;
  }
  const workspaces: WorkspaceInfo[] = [];
  for (const rawWorkspace of value.workspaces) {
    const workspace = normalizeWorkspace(rawWorkspace);
    if (!workspace) {
      return null;
    }
    workspaces.push(workspace);
  }
  const threadsByWorkspace = normalizeThreadsByWorkspace(value.threadsByWorkspace);
  if (!threadsByWorkspace) {
    return null;
  }
  return {
    version: SIDEBAR_SNAPSHOT_VERSION,
    updatedAt: value.updatedAt,
    workspaces,
    threadsByWorkspace,
  };
}

function buildSnapshot(value?: SidebarSnapshot | null): SidebarSnapshot {
  return {
    version: SIDEBAR_SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    workspaces: value?.workspaces ?? [],
    threadsByWorkspace: value?.threadsByWorkspace ?? {},
  };
}

export function loadSidebarSnapshot(): SidebarSnapshot | null {
  const raw = getClientStoreSync<unknown>("threads", SIDEBAR_SNAPSHOT_KEY);
  return normalizeSidebarSnapshot(raw);
}

export function saveSidebarSnapshotWorkspaces(workspaces: WorkspaceInfo[]): void {
  const current = buildSnapshot(loadSidebarSnapshot());
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const threadsByWorkspace = Object.fromEntries(
    Object.entries(current.threadsByWorkspace).filter(([workspaceId]) =>
      workspaceIds.has(workspaceId),
    ),
  );
  writeClientStoreValue("threads", SIDEBAR_SNAPSHOT_KEY, {
    ...current,
    updatedAt: Date.now(),
    workspaces,
    threadsByWorkspace,
  });
}

export function saveSidebarSnapshotThreads(
  workspaceId: string,
  threads: ThreadSummary[],
): void {
  if (!shouldPersistSidebarThreads(threads)) {
    return;
  }
  const current = buildSnapshot(loadSidebarSnapshot());
  writeClientStoreValue("threads", SIDEBAR_SNAPSHOT_KEY, {
    ...current,
    updatedAt: Date.now(),
    threadsByWorkspace: {
      ...current.threadsByWorkspace,
      [workspaceId]: threads,
    },
  });
}
