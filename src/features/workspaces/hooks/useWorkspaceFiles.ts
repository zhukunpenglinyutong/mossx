import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { getWorkspaceFiles } from "../../../services/tauri";
import type {
  WorkspaceDirectoryEntry,
  WorkspaceFileScanState,
} from "../../../services/tauri";

const WORKSPACE_FILES_DEBUG_KEY = "ccgui.debug.workspace-files";
const WORKSPACE_FILES_SLOW_REQUEST_MS = 800;
const INITIAL_RETRY_DELAY_MS = 1_500;
const MAX_INITIAL_RETRY_ATTEMPTS = 1;

function isWorkspaceFilesDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(WORKSPACE_FILES_DEBUG_KEY) === "1";
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeDirectoryEntries(entries: unknown): WorkspaceDirectoryEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.filter((entry): entry is WorkspaceDirectoryEntry => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const candidate = entry as Partial<WorkspaceDirectoryEntry>;
    return typeof candidate.path === "string" && typeof candidate.child_state === "string";
  });
}

type UseWorkspaceFilesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
  initialLoadEnabled?: boolean;
  pollingEnabled?: boolean;
};

export function useWorkspaceFiles({
  activeWorkspace,
  onDebug,
  initialLoadEnabled = true,
  pollingEnabled = true,
}: UseWorkspaceFilesOptions) {
  const [files, setFiles] = useState<string[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [gitignoredFiles, setGitignoredFiles] = useState<Set<string>>(new Set());
  const [gitignoredDirectories, setGitignoredDirectories] = useState<Set<string>>(new Set());
  const [scanState, setScanState] = useState<WorkspaceFileScanState>("complete");
  const [limitHit, setLimitHit] = useState(false);
  const [directoryMetadata, setDirectoryMetadata] = useState<WorkspaceDirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(() =>
    Boolean(activeWorkspace?.id && initialLoadEnabled),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasLoadedWorkspaceId = useRef<string | null>(null);
  const latestWorkspaceIdRef = useRef<string | null>(null);
  const inFlight = useRef<string | null>(null);
  const consecutiveFailures = useRef(0);
  const retryAttemptsByWorkspaceId = useRef<Map<string, number>>(new Map());
  const initialRetryTimer = useRef<number | null>(null);
  const refreshFilesRef = useRef<
    ((reason?: "initial" | "retry" | "poll" | "manual") => Promise<void>) | null
  >(null);

  const BASE_REFRESH_INTERVAL_MS = 30_000;
  const MAX_REFRESH_INTERVAL_MS = 180_000;
  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  latestWorkspaceIdRef.current = workspaceId;

  const clearInitialRetryTimer = useCallback(() => {
    if (initialRetryTimer.current !== null) {
      window.clearTimeout(initialRetryTimer.current);
      initialRetryTimer.current = null;
    }
  }, []);

  const scheduleInitialRetry = useCallback(
    (failedWorkspaceId: string) => {
      clearInitialRetryTimer();
      const attempts = retryAttemptsByWorkspaceId.current.get(failedWorkspaceId) ?? 0;
      if (attempts >= MAX_INITIAL_RETRY_ATTEMPTS) {
        return;
      }
      retryAttemptsByWorkspaceId.current.set(failedWorkspaceId, attempts + 1);
      initialRetryTimer.current = window.setTimeout(() => {
        initialRetryTimer.current = null;
        void refreshFilesRef.current?.("retry");
      }, INITIAL_RETRY_DELAY_MS);
    },
    [clearInitialRetryTimer],
  );

  const refreshFiles = useCallback(async (
    reason: "initial" | "retry" | "poll" | "manual" = "manual",
  ) => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current === workspaceId) {
      return;
    }
    inFlight.current = workspaceId;
    const requestWorkspaceId = workspaceId;
    const isFirstLoadForWorkspace = hasLoadedWorkspaceId.current !== workspaceId;
    if (reason !== "poll" || isFirstLoadForWorkspace) {
      setIsLoading(true);
    }
    const startedAt = Date.now();
    onDebug?.({
      id: `${startedAt}-client-files-list`,
      timestamp: startedAt,
      source: "client",
      label: "files/list",
      payload: { workspaceId: requestWorkspaceId, reason },
    });
    try {
      const response = await getWorkspaceFiles(requestWorkspaceId);
      const elapsedMs = Date.now() - startedAt;
      const nextFiles = Array.isArray(response.files) ? response.files : [];
      const nextDirectories = Array.isArray(response.directories) ? response.directories : [];
      const ignored = Array.isArray(response.gitignored_files) ? response.gitignored_files : [];
      const ignoredDirectories = Array.isArray(response.gitignored_directories)
        ? response.gitignored_directories
        : [];
      const nextScanState = response.scan_state === "partial" ? "partial" : "complete";
      const nextLimitHit = Boolean(response.limit_hit);
      const nextDirectoryMetadata = normalizeDirectoryEntries(response.directory_entries);
      if (
        import.meta.env.DEV &&
        (elapsedMs >= WORKSPACE_FILES_SLOW_REQUEST_MS ||
        isWorkspaceFilesDebugEnabled())
      ) {
        console.info("[workspace-files]", {
          workspaceId: requestWorkspaceId,
          reason,
          ms: elapsedMs,
          files: nextFiles.length,
          directories: nextDirectories.length,
          gitignoredFiles: ignored.length,
          gitignoredDirectories: ignoredDirectories.length,
          scanState: nextScanState,
          limitHit: nextLimitHit,
          directoryEntries: nextDirectoryMetadata.length,
        });
      }
      onDebug?.({
        id: `${Date.now()}-server-files-list`,
        timestamp: Date.now(),
        source: "server",
        label: "files/list response",
        payload: {
          workspaceId: requestWorkspaceId,
          reason,
          ms: elapsedMs,
          files: nextFiles.length,
          directories: nextDirectories.length,
          gitignoredFiles: ignored.length,
          gitignoredDirectories: ignoredDirectories.length,
          scanState: nextScanState,
          limitHit: nextLimitHit,
          directoryEntries: nextDirectoryMetadata.length,
        },
      });
      if (requestWorkspaceId === latestWorkspaceIdRef.current) {
        setFiles(nextFiles);
        setDirectories(nextDirectories);
        setGitignoredFiles(new Set(ignored));
        setGitignoredDirectories(new Set(ignoredDirectories));
        setScanState(nextScanState);
        setLimitHit(nextLimitHit);
        setDirectoryMetadata(nextDirectoryMetadata);
        setLoadError(null);
        hasLoadedWorkspaceId.current = requestWorkspaceId;
        consecutiveFailures.current = 0;
        retryAttemptsByWorkspaceId.current.delete(requestWorkspaceId);
        clearInitialRetryTimer();
      }
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = normalizeErrorMessage(error);
      consecutiveFailures.current += 1;
      if (requestWorkspaceId === latestWorkspaceIdRef.current) {
        setLoadError(message);
        if (reason === "initial") {
          scheduleInitialRetry(requestWorkspaceId);
        }
      }
      if (import.meta.env.DEV && isWorkspaceFilesDebugEnabled()) {
        console.warn("[workspace-files] refresh failed", {
          workspaceId: requestWorkspaceId,
          reason,
          ms: elapsedMs,
          failureCount: consecutiveFailures.current,
          error: message,
        });
      }
      onDebug?.({
        id: `${Date.now()}-client-files-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "files/list error",
        payload: {
          workspaceId: requestWorkspaceId,
          reason,
          ms: elapsedMs,
          failureCount: consecutiveFailures.current,
          message,
        },
      });
    } finally {
      if (inFlight.current === requestWorkspaceId) {
        inFlight.current = null;
        setIsLoading(false);
      }
    }
  }, [
    clearInitialRetryTimer,
    isConnected,
    onDebug,
    scheduleInitialRetry,
    workspaceId,
  ]);

  useEffect(() => {
    refreshFilesRef.current = refreshFiles;
  }, [refreshFiles]);

  useEffect(() => {
    setFiles([]);
    setDirectories([]);
    setGitignoredFiles(new Set());
    setGitignoredDirectories(new Set());
    setScanState("complete");
    setLimitHit(false);
    setDirectoryMetadata([]);
    setLoadError(null);
    hasLoadedWorkspaceId.current = null;
    inFlight.current = null;
    consecutiveFailures.current = 0;
    retryAttemptsByWorkspaceId.current.clear();
    clearInitialRetryTimer();
    setIsLoading(Boolean(workspaceId && initialLoadEnabled));
  }, [clearInitialRetryTimer, initialLoadEnabled, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !initialLoadEnabled) {
      setIsLoading(false);
      return;
    }
    if (hasLoadedWorkspaceId.current === workspaceId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
  }, [initialLoadEnabled, isConnected, workspaceId]);

  useEffect(() => clearInitialRetryTimer, [clearInitialRetryTimer]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !initialLoadEnabled) {
      return;
    }
    const needsRefresh = hasLoadedWorkspaceId.current !== workspaceId;
    if (!needsRefresh) {
      return;
    }
    void refreshFiles("initial");
  }, [initialLoadEnabled, isConnected, refreshFiles, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected || !pollingEnabled) {
      return;
    }

    let cancelled = false;
    let timeoutId = 0;
    const scheduleNext = () => {
      if (cancelled) {
        return;
      }
      const backoffMultiplier = Math.max(1, 2 ** consecutiveFailures.current);
      const intervalMs = Math.min(
        MAX_REFRESH_INTERVAL_MS,
        BASE_REFRESH_INTERVAL_MS * backoffMultiplier,
      );
      timeoutId = window.setTimeout(() => {
        void refreshFiles("poll").finally(() => {
          scheduleNext();
        });
      }, intervalMs);
    };
    scheduleNext();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isConnected, pollingEnabled, refreshFiles, workspaceId]);

  const fileOptions = useMemo(() => files.filter(Boolean), [files]);
  const directoryOptions = useMemo(() => directories.filter(Boolean), [directories]);

  return {
    files: fileOptions,
    directories: directoryOptions,
    gitignoredFiles,
    gitignoredDirectories,
    scanState,
    limitHit,
    directoryMetadata,
    isLoading,
    loadError,
    refreshFiles,
  };
}
