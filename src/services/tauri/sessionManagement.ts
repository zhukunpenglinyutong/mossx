import { invoke } from "@tauri-apps/api/core";

export interface WorkspaceSessionCatalogEntry {
  sessionId: string;
  canonicalSessionId?: string | null;
  workspaceId: string;
  workspaceLabel?: string | null;
  engine: string;
  title: string;
  updatedAt: number;
  archivedAt?: number | null;
  threadKind: string;
  source?: string | null;
  sourceLabel?: string | null;
  sizeBytes?: number | null;
  cwd?: string | null;
  attributionStatus?: "strict-match" | "inferred-related" | "unassigned" | null;
  attributionReason?: string | null;
  attributionConfidence?: "high" | "medium" | null;
  matchedWorkspaceId?: string | null;
  matchedWorkspaceLabel?: string | null;
  folderId?: string | null;
}

export interface WorkspaceSessionCatalogQuery {
  keyword?: string | null;
  engine?: string | null;
  status?: "active" | "archived" | "all" | null;
}

export interface WorkspaceSessionCatalogPage {
  data: WorkspaceSessionCatalogEntry[];
  nextCursor?: string | null;
  partialSource?: string | null;
}

export interface WorkspaceSessionFolder {
  id: string;
  workspaceId: string;
  parentId?: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSessionFolderTree {
  workspaceId: string;
  folders: WorkspaceSessionFolder[];
}

export interface WorkspaceSessionFolderMutation {
  folder: WorkspaceSessionFolder;
}

export interface WorkspaceSessionAssignmentResponse {
  sessionId: string;
  folderId?: string | null;
}

export interface WorkspaceSessionProjectionSummary {
  scopeKind: "project" | "worktree";
  ownerWorkspaceIds: string[];
  activeTotal: number;
  archivedTotal: number;
  allTotal: number;
  filteredTotal: number;
  partialSources?: string[];
}

export interface WorkspaceSessionBatchMutationResult {
  sessionId: string;
  ok: boolean;
  archivedAt?: number | null;
  error?: string | null;
  code?: string | null;
}

export interface WorkspaceSessionBatchMutationResponse {
  results: WorkspaceSessionBatchMutationResult[];
}

export async function listWorkspaceSessions(
  workspaceId: string,
  options?: {
    query?: WorkspaceSessionCatalogQuery | null;
    cursor?: string | null;
    limit?: number | null;
  },
): Promise<WorkspaceSessionCatalogPage> {
  return invoke<WorkspaceSessionCatalogPage>("list_workspace_sessions", {
    workspaceId,
    query: options?.query ?? null,
    cursor: options?.cursor ?? null,
    limit: options?.limit ?? null,
  });
}

export async function listGlobalCodexSessions(options?: {
  query?: WorkspaceSessionCatalogQuery | null;
  cursor?: string | null;
  limit?: number | null;
}): Promise<WorkspaceSessionCatalogPage> {
  return invoke<WorkspaceSessionCatalogPage>("list_global_codex_sessions", {
    query: options?.query ?? null,
    cursor: options?.cursor ?? null,
    limit: options?.limit ?? null,
  });
}

export async function listProjectRelatedCodexSessions(
  workspaceId: string,
  options?: {
    query?: WorkspaceSessionCatalogQuery | null;
    cursor?: string | null;
    limit?: number | null;
  },
): Promise<WorkspaceSessionCatalogPage> {
  return invoke<WorkspaceSessionCatalogPage>("list_project_related_codex_sessions", {
    workspaceId,
    query: options?.query ?? null,
    cursor: options?.cursor ?? null,
    limit: options?.limit ?? null,
  });
}

export async function getWorkspaceSessionProjectionSummary(
  workspaceId: string,
  options?: {
    query?: WorkspaceSessionCatalogQuery | null;
  },
): Promise<WorkspaceSessionProjectionSummary> {
  return invoke<WorkspaceSessionProjectionSummary>("get_workspace_session_projection_summary", {
    workspaceId,
    query: options?.query ?? null,
  });
}

export async function archiveWorkspaceSessions(
  workspaceId: string,
  sessionIds: string[],
): Promise<WorkspaceSessionBatchMutationResponse> {
  return invoke<WorkspaceSessionBatchMutationResponse>(
    "archive_workspace_sessions",
    {
      workspaceId,
      sessionIds,
    },
  );
}

export async function unarchiveWorkspaceSessions(
  workspaceId: string,
  sessionIds: string[],
): Promise<WorkspaceSessionBatchMutationResponse> {
  return invoke<WorkspaceSessionBatchMutationResponse>(
    "unarchive_workspace_sessions",
    {
      workspaceId,
      sessionIds,
    },
  );
}

export async function deleteWorkspaceSessions(
  workspaceId: string,
  sessionIds: string[],
): Promise<WorkspaceSessionBatchMutationResponse> {
  return invoke<WorkspaceSessionBatchMutationResponse>(
    "delete_workspace_sessions",
    {
      workspaceId,
      sessionIds,
    },
  );
}

export async function listWorkspaceSessionFolders(
  workspaceId: string,
): Promise<WorkspaceSessionFolderTree> {
  return invoke<WorkspaceSessionFolderTree>("list_workspace_session_folders", {
    workspaceId,
  });
}

export async function createWorkspaceSessionFolder(
  workspaceId: string,
  name: string,
  parentId?: string | null,
): Promise<WorkspaceSessionFolderMutation> {
  return invoke<WorkspaceSessionFolderMutation>("create_workspace_session_folder", {
    workspaceId,
    name,
    parentId: parentId ?? null,
  });
}

export async function renameWorkspaceSessionFolder(
  workspaceId: string,
  folderId: string,
  name: string,
): Promise<WorkspaceSessionFolderMutation> {
  return invoke<WorkspaceSessionFolderMutation>("rename_workspace_session_folder", {
    workspaceId,
    folderId,
    name,
  });
}

export async function moveWorkspaceSessionFolder(
  workspaceId: string,
  folderId: string,
  parentId?: string | null,
): Promise<WorkspaceSessionFolderMutation> {
  return invoke<WorkspaceSessionFolderMutation>("move_workspace_session_folder", {
    workspaceId,
    folderId,
    parentId: parentId ?? null,
  });
}

export async function deleteWorkspaceSessionFolder(
  workspaceId: string,
  folderId: string,
): Promise<void> {
  return invoke<void>("delete_workspace_session_folder", {
    workspaceId,
    folderId,
  });
}

export async function assignWorkspaceSessionFolder(
  workspaceId: string,
  sessionId: string,
  folderId?: string | null,
): Promise<WorkspaceSessionAssignmentResponse> {
  return invoke<WorkspaceSessionAssignmentResponse>("assign_workspace_session_folder", {
    workspaceId,
    sessionId,
    folderId: folderId ?? null,
  });
}
