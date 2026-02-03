import { useCallback } from "react";
import type { DebugEntry, WorkspaceInfo } from "../../../types";
import { readClaudeMd, writeClaudeMd } from "../../../services/tauri";
import { useFileEditor, type FileEditorResponse } from "../../shared/hooks/useFileEditor";

type UseWorkspaceClaudeMdOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

export function useWorkspaceClaudeMd({ activeWorkspace, onDebug }: UseWorkspaceClaudeMdOptions) {
  const workspaceId = activeWorkspace?.id ?? null;

  const readWithDebug = useCallback(async (): Promise<FileEditorResponse> => {
    if (!workspaceId) {
      return { exists: false, content: "", truncated: false };
    }
    const requestWorkspaceId = workspaceId;
    onDebug?.({
      id: `${Date.now()}-client-claude-md-read`,
      timestamp: Date.now(),
      source: "client",
      label: "claude.md/read",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      const response = await readClaudeMd(requestWorkspaceId);
      onDebug?.({
        id: `${Date.now()}-server-claude-md-read`,
        timestamp: Date.now(),
        source: "server",
        label: "claude.md/read response",
        payload: response,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug?.({
        id: `${Date.now()}-client-claude-md-read-error`,
        timestamp: Date.now(),
        source: "error",
        label: "claude.md/read error",
        payload: message,
      });
      throw error;
    }
  }, [onDebug, workspaceId]);

  const writeWithDebug = useCallback(async (content: string) => {
    if (!workspaceId) {
      return;
    }
    const requestWorkspaceId = workspaceId;
    onDebug?.({
      id: `${Date.now()}-client-claude-md-write`,
      timestamp: Date.now(),
      source: "client",
      label: "claude.md/write",
      payload: { workspaceId: requestWorkspaceId },
    });
    try {
      await writeClaudeMd(requestWorkspaceId, content);
      onDebug?.({
        id: `${Date.now()}-server-claude-md-write`,
        timestamp: Date.now(),
        source: "server",
        label: "claude.md/write response",
        payload: { ok: true },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug?.({
        id: `${Date.now()}-client-claude-md-write-error`,
        timestamp: Date.now(),
        source: "error",
        label: "claude.md/write error",
        payload: message,
      });
      throw error;
    }
  }, [onDebug, workspaceId]);

  return useFileEditor({
    key: workspaceId,
    read: readWithDebug,
    write: writeWithDebug,
    readErrorTitle: "Couldn't load CLAUDE.md",
    writeErrorTitle: "Couldn't save CLAUDE.md",
  });
}
