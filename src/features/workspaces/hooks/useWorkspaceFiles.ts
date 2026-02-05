import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { getWorkspaceFiles } from "../../../services/tauri";

type UseWorkspaceFilesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

export function useWorkspaceFiles({
  activeWorkspace,
  onDebug,
}: UseWorkspaceFilesOptions) {
  const [files, setFiles] = useState<string[]>([]);
  const [directories, setDirectories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef<string | null>(null);

  const REFRESH_INTERVAL_MS = 5000;
  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const refreshFiles = useCallback(async () => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (inFlight.current === workspaceId) {
      return;
    }
    inFlight.current = workspaceId;
    const requestWorkspaceId = workspaceId;
    setIsLoading(true);
    onDebug?.({
      id: `${Date.now()}-client-files-list`,
      timestamp: Date.now(),
      source: "client",
      label: "files/list",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      const response = await getWorkspaceFiles(requestWorkspaceId);
      onDebug?.({
        id: `${Date.now()}-server-files-list`,
        timestamp: Date.now(),
        source: "server",
        label: "files/list response",
        payload: response,
      });
      if (requestWorkspaceId === workspaceId) {
        setFiles(Array.isArray(response.files) ? response.files : []);
        setDirectories(Array.isArray(response.directories) ? response.directories : []);
        lastFetchedWorkspaceId.current = requestWorkspaceId;
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-files-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "files/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (inFlight.current === requestWorkspaceId) {
        inFlight.current = null;
        setIsLoading(false);
      }
    }
  }, [isConnected, onDebug, workspaceId]);

  useEffect(() => {
    setFiles([]);
    setDirectories([]);
    lastFetchedWorkspaceId.current = null;
    inFlight.current = null;
    setIsLoading(Boolean(workspaceId && isConnected));
  }, [isConnected, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }
    if (lastFetchedWorkspaceId.current === workspaceId && files.length > 0) {
      return;
    }
    refreshFiles();
  }, [files.length, isConnected, refreshFiles, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !isConnected) {
      return;
    }

    const interval = window.setInterval(() => {
      refreshFiles().catch(() => {});
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [isConnected, refreshFiles, workspaceId]);

  const fileOptions = useMemo(() => files.filter(Boolean), [files]);
  const directoryOptions = useMemo(() => directories.filter(Boolean), [directories]);

  return {
    files: fileOptions,
    directories: directoryOptions,
    isLoading,
    refreshFiles,
  };
}
