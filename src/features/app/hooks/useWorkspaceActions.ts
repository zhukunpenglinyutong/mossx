import type { RefObject } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNewAgentShortcut } from "./useNewAgentShortcut";
import type { DebugEntry, EngineType, WorkspaceInfo } from "../../../types";

type Params = {
  activeWorkspace: WorkspaceInfo | null;
  isCompact: boolean;
  activeEngine: EngineType;
  addWorkspace: () => Promise<WorkspaceInfo | null>;
  addWorkspaceFromPath: (path: string) => Promise<WorkspaceInfo | null>;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { engine?: EngineType },
  ) => Promise<string | null>;
  setActiveThreadId: (threadId: string | null, workspaceId: string) => void;
  setActiveTab: (tab: "projects" | "codex" | "git" | "log") => void;
  exitDiffView: () => void;
  selectWorkspace: (workspaceId: string) => void;
  openWorktreePrompt: (workspace: WorkspaceInfo) => void;
  openClonePrompt: (workspace: WorkspaceInfo) => void;
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
  onDebug: (entry: DebugEntry) => void;
};

export function useWorkspaceActions({
  activeWorkspace,
  isCompact,
  activeEngine,
  addWorkspace,
  addWorkspaceFromPath,
  connectWorkspace,
  startThreadForWorkspace,
  setActiveThreadId,
  setActiveTab,
  exitDiffView,
  selectWorkspace,
  openWorktreePrompt,
  openClonePrompt,
  composerInputRef,
  onDebug,
}: Params) {
  const { t } = useTranslation();

  const localizeErrorMessage = useCallback(
    (message: string): string => {
      if (
        message.startsWith("CLI_NOT_FOUND:") ||
        message.includes("No such file or directory") ||
        message.includes("Failed to execute claude") ||
        message.includes("Failed to execute codex")
      ) {
        return `${t("errors.cliNotFound")}\n\n${t("errors.cliNotFoundHint")}`;
      }
      return message;
    },
    [t],
  );

  const handleWorkspaceAdded = useCallback(
    (workspace: WorkspaceInfo) => {
      setActiveThreadId(null, workspace.id);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    [isCompact, setActiveTab, setActiveThreadId],
  );

  const handleAddWorkspace = useCallback(async () => {
    try {
      const workspace = await addWorkspace();
      if (workspace) {
        handleWorkspaceAdded(workspace);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onDebug({
        id: `${Date.now()}-client-add-workspace-error`,
        timestamp: Date.now(),
        source: "error",
        label: "workspace/add error",
        payload: message,
      });
      alert(`${t("errors.failedToAddWorkspace")}\n\n${localizeErrorMessage(message)}`);
    }
  }, [addWorkspace, handleWorkspaceAdded, localizeErrorMessage, onDebug, t]);

  const handleAddWorkspaceFromPath = useCallback(
    async (path: string) => {
      try {
        const workspace = await addWorkspaceFromPath(path);
        if (workspace) {
          handleWorkspaceAdded(workspace);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onDebug({
          id: `${Date.now()}-client-add-workspace-error`,
          timestamp: Date.now(),
          source: "error",
          label: "workspace/add error",
          payload: message,
        });
        alert(`${t("errors.failedToAddWorkspace")}\n\n${localizeErrorMessage(message)}`);
      }
    },
    [addWorkspaceFromPath, handleWorkspaceAdded, localizeErrorMessage, onDebug, t],
  );

  const handleAddAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      selectWorkspace(workspace.id);
      if (!workspace.connected) {
        await connectWorkspace(workspace);
      }
      await startThreadForWorkspace(workspace.id, {
        engine: activeEngine,
      });
      if (isCompact) {
        setActiveTab("codex");
      }
      setTimeout(() => composerInputRef.current?.focus(), 0);
    },
    [
      composerInputRef,
      connectWorkspace,
      exitDiffView,
      isCompact,
      activeEngine,
      selectWorkspace,
      setActiveTab,
      startThreadForWorkspace,
    ],
  );

  const handleAddWorktreeAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      openWorktreePrompt(workspace);
    },
    [exitDiffView, openWorktreePrompt],
  );

  const handleAddCloneAgent = useCallback(
    async (workspace: WorkspaceInfo) => {
      exitDiffView();
      openClonePrompt(workspace);
    },
    [exitDiffView, openClonePrompt],
  );

  useNewAgentShortcut({
    isEnabled: Boolean(activeWorkspace),
    onTrigger: () => {
      if (activeWorkspace) {
        void handleAddAgent(activeWorkspace);
      }
    },
  });

  return {
    handleAddWorkspace,
    handleAddWorkspaceFromPath,
    handleAddAgent,
    handleAddWorktreeAgent,
    handleAddCloneAgent,
  };
}
