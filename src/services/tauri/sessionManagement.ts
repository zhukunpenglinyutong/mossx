import { invoke } from "@tauri-apps/api/core";

export interface WorkspaceSessionCatalogEntry {
  sessionId: string;
  workspaceId: string;
  engine: string;
  title: string;
  updatedAt: number;
  archivedAt?: number | null;
  threadKind: string;
  source?: string | null;
  sourceLabel?: string | null;
  sizeBytes?: number | null;
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
