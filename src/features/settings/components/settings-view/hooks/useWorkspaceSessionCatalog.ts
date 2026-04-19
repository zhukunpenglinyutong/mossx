import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  archiveWorkspaceSessions,
  deleteWorkspaceSessions,
  listWorkspaceSessions,
  unarchiveWorkspaceSessions,
  type WorkspaceSessionBatchMutationResponse,
  type WorkspaceSessionCatalogEntry,
  type WorkspaceSessionCatalogQuery,
} from "../../../../../services/tauri";

export type WorkspaceSessionCatalogStatus = "active" | "archived" | "all";

export type WorkspaceSessionCatalogFilters = {
  keyword: string;
  engine: string;
  status: WorkspaceSessionCatalogStatus;
};

type MutationKind = "archive" | "unarchive" | "delete";

type UseWorkspaceSessionCatalogOptions = {
  workspaceId: string | null;
  filters: WorkspaceSessionCatalogFilters;
};

const SESSION_CATALOG_PAGE_SIZE = 100;

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toQuery(filters: WorkspaceSessionCatalogFilters): WorkspaceSessionCatalogQuery {
  return {
    keyword: filters.keyword.trim() || null,
    engine: filters.engine.trim() || null,
    status: filters.status,
  };
}

function removeEntriesBySessionIds(
  current: WorkspaceSessionCatalogEntry[],
  sessionIds: string[],
): WorkspaceSessionCatalogEntry[] {
  if (sessionIds.length === 0) {
    return current;
  }
  const removed = new Set(sessionIds);
  return current.filter((entry) => !removed.has(entry.sessionId));
}

function patchArchivedState(
  current: WorkspaceSessionCatalogEntry[],
  results: WorkspaceSessionBatchMutationResponse["results"],
): WorkspaceSessionCatalogEntry[] {
  if (results.length === 0) {
    return current;
  }
  const archivedAtBySessionId = new Map(
    results
      .filter((item) => item.ok)
      .map((item) => [item.sessionId, item.archivedAt ?? null] as const),
  );
  return current.map((entry) =>
    archivedAtBySessionId.has(entry.sessionId)
      ? {
          ...entry,
          archivedAt: archivedAtBySessionId.get(entry.sessionId) ?? null,
        }
      : entry,
  );
}

export function useWorkspaceSessionCatalog({
  workspaceId,
  filters,
}: UseWorkspaceSessionCatalogOptions) {
  const [entries, setEntries] = useState<WorkspaceSessionCatalogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [partialSource, setPartialSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const requestSeqRef = useRef(0);

  const query = useMemo(() => toQuery(filters), [filters]);

  const loadPage = useCallback(
    async (mode: "replace" | "append", cursor?: string | null) => {
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;
      if (!workspaceId) {
        setEntries([]);
        setNextCursor(null);
        setPartialSource(null);
        setError(null);
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (mode === "append") {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await listWorkspaceSessions(workspaceId, {
          query,
          cursor: cursor ?? null,
          limit: SESSION_CATALOG_PAGE_SIZE,
        });
        if (requestSeqRef.current !== requestId) {
          return;
        }
        setEntries((current) =>
          mode === "append" ? [...current, ...response.data] : response.data,
        );
        setNextCursor(response.nextCursor ?? null);
        setPartialSource(response.partialSource ?? null);
        setError(null);
      } catch (incomingError) {
        if (requestSeqRef.current !== requestId) {
          return;
        }
        const message = normalizeErrorMessage(incomingError);
        if (mode !== "append") {
          setEntries([]);
          setNextCursor(null);
          setPartialSource(null);
        }
        setError(message);
      } finally {
        if (requestSeqRef.current === requestId) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [query, workspaceId],
  );

  useEffect(() => {
    void loadPage("replace", null);
  }, [loadPage]);

  const reload = useCallback(async () => {
    await loadPage("replace", null);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }
    await loadPage("append", nextCursor);
  }, [isLoadingMore, loadPage, nextCursor]);

  const mutate = useCallback(
    async (
      kind: MutationKind,
      sessionIds: string[],
    ): Promise<WorkspaceSessionBatchMutationResponse> => {
      if (!workspaceId) {
        throw new Error("workspace_id is required");
      }
      if (sessionIds.length === 0) {
        return { results: [] };
      }

      setIsMutating(true);
      try {
        let response: WorkspaceSessionBatchMutationResponse;
        if (kind === "archive") {
          response = await archiveWorkspaceSessions(workspaceId, sessionIds);
        } else if (kind === "unarchive") {
          response = await unarchiveWorkspaceSessions(workspaceId, sessionIds);
        } else {
          response = await deleteWorkspaceSessions(workspaceId, sessionIds);
        }
        const succeededIds = response.results
          .filter((item) => item.ok)
          .map((item) => item.sessionId);
        if (succeededIds.length > 0) {
          setEntries((current) => {
            if (kind === "delete") {
              return removeEntriesBySessionIds(current, succeededIds);
            }
            if (filters.status === "all") {
              return patchArchivedState(current, response.results);
            }
            return removeEntriesBySessionIds(current, succeededIds);
          });
        }
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [filters.status, workspaceId],
  );

  return {
    entries,
    nextCursor,
    partialSource,
    error,
    isLoading,
    isLoadingMore,
    isMutating,
    reload,
    loadMore,
    mutate,
  };
}
