import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { writeClientStoreValue } from "../services/clientStorage";
import { setNotificationActionHandler } from "../services/systemNotification";
import { useRenameWorktreePrompt } from "../features/workspaces/hooks/useRenameWorktreePrompt";
import { useClonePrompt } from "../features/workspaces/hooks/useClonePrompt";
import { useTerminalController } from "../features/terminal/hooks/useTerminalController";
import { useWorkspaceLaunchScript } from "../features/app/hooks/useWorkspaceLaunchScript";
import { useWorkspaceRuntimeRun } from "../features/app/hooks/useWorkspaceRuntimeRun";
import { useWorkspaceLaunchScripts } from "../features/app/hooks/useWorkspaceLaunchScripts";
import { useWorktreeSetupScript } from "../features/app/hooks/useWorktreeSetupScript";
import { buildClaudeResumeTerminalCommand } from "../features/app/utils/claudeResumeCommand";
import { writeTerminalSession } from "../services/tauri";
import type { AgentTaskScrollRequest } from "../features/messages/types";
import type { AppSettings, DebugEntry, WorkspaceInfo, WorkspaceSettings } from "../types";

const EMPTY_OPEN_APP_ICON_MAP: Record<string, string> = {};

type NotificationActionExtra = {
  workspaceId?: unknown;
  threadId?: unknown;
};

type PendingClaudeTuiOpen = {
  workspaceId: string;
  terminalId: string;
  command: string;
};

type WorkspaceShellSettings = Pick<AppSettings, "workspaceGroups"> &
  Partial<Pick<AppSettings, "selectedOpenAppId">>;

export type WorkspaceShellBoundary = {
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  addCloneAgent: (
    workspace: WorkspaceInfo,
    copyName: string,
    copiesFolder: string,
  ) => Promise<WorkspaceInfo | null>;
  addDebugEntry: (entry: DebugEntry) => void;
  alertError: (message: string) => void;
  appSettings: WorkspaceShellSettings;
  clearDraftForThread: (threadId: string) => void;
  closeTerminalPanel: () => void;
  collapseRightPanel: () => void;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  exitDiffView: () => void;
  handleToggleTerminal: () => void;
  isCompact: boolean;
  listThreadsForWorkspaceTracked: (workspace: WorkspaceInfo) => Promise<unknown> | unknown;
  openTerminal: () => unknown;
  queueSaveSettings: (
    settings: WorkspaceShellSettings,
  ) => Promise<WorkspaceShellSettings> | WorkspaceShellSettings;
  refreshThread: (workspaceId: string, threadId: string) => Promise<unknown> | unknown;
  removeImagesForThread: (threadId: string) => void;
  removeThread: (
    workspaceId: string,
    threadId: string,
  ) => Promise<{ success: boolean; message?: string | null }>;
  renameWorktree: (workspaceId: string, branch: string) => Promise<WorkspaceInfo>;
  renameWorktreeUpstream: (
    workspaceId: string,
    oldBranch: string,
    newBranch: string,
  ) => Promise<void>;
  resetWorkspaceThreads: (workspaceId: string) => void;
  selectWorkspace: (workspaceId: string) => void;
  setActiveEngine: (engine: string) => void;
  setActiveTab: (tab: string) => void;
  setActiveThreadId: (threadId: string, workspaceId: string) => void;
  setAgentTaskScrollRequest: Dispatch<SetStateAction<AgentTaskScrollRequest | null>>;
  setAppMode: (mode: string) => void;
  setAppSettings: (
    updater: (current: WorkspaceShellSettings) => WorkspaceShellSettings,
  ) => void;
  setCenterMode: (mode: string) => void;
  setHomeOpen: (open: boolean) => void;
  setSelectedKanbanTaskId: (taskId: string | null) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  terminalOpen: boolean;
  threadsByWorkspace: Record<string, Array<{ id: string; engineSource?: string | null }>>;
  updateWorkspaceSettings: (
    id: string,
    settings: WorkspaceSettings,
  ) => Promise<WorkspaceInfo>;
  workspaces: WorkspaceInfo[];
};

export function useAppShellWorkspaceFlowsSection(
  ctx: WorkspaceShellBoundary,
) {
  const {
    activeWorkspace,
    activeWorkspaceId,
    activeThreadId,
    addCloneAgent,
    addDebugEntry,
    alertError,
    appSettings,
    clearDraftForThread,
    closeTerminalPanel,
    collapseRightPanel,
    connectWorkspace,
    exitDiffView,
    handleToggleTerminal,
    isCompact,
    listThreadsForWorkspaceTracked,
    openTerminal,
    queueSaveSettings,
    refreshThread,
    removeImagesForThread,
    removeThread,
    renameWorktree,
    renameWorktreeUpstream,
    resetWorkspaceThreads,
    selectWorkspace,
    setActiveEngine,
    setActiveTab,
    setActiveThreadId,
    setAgentTaskScrollRequest,
    setAppMode,
    setAppSettings,
    setCenterMode,
    setHomeOpen,
    setSelectedKanbanTaskId,
    t,
    terminalOpen,
    threadsByWorkspace,
    updateWorkspaceSettings,
    workspaces,
  } = ctx;

  const {
    renamePrompt: renameWorktreePrompt,
    notice: renameWorktreeNotice,
    upstreamPrompt: renameWorktreeUpstreamPrompt,
    confirmUpstream: confirmRenameWorktreeUpstream,
    openRenamePrompt: openRenameWorktreePrompt,
    handleRenameChange: handleRenameWorktreeChange,
    handleRenameCancel: handleRenameWorktreeCancel,
    handleRenameConfirm: handleRenameWorktreeConfirm,
  } = useRenameWorktreePrompt({
    workspaces,
    activeWorkspaceId,
    renameWorktree,
    renameWorktreeUpstream,
    onRenameSuccess: (workspace: any) => {
      resetWorkspaceThreads(workspace.id);
      void listThreadsForWorkspaceTracked(workspace);
      if (activeThreadId && activeWorkspaceId === workspace.id) {
        void refreshThread(workspace.id, activeThreadId);
      }
    },
  });

  const handleOpenRenameWorktree = useCallback(() => {
    if (activeWorkspace) {
      openRenameWorktreePrompt(activeWorkspace.id);
    }
  }, [activeWorkspace, openRenameWorktreePrompt]);

  const {
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    ensureTerminalWithTitle,
    restartTerminalSession,
  } = useTerminalController({
    activeWorkspaceId,
    activeWorkspace,
    terminalOpen,
    onCloseTerminalPanel: closeTerminalPanel,
    onDebug: addDebugEntry,
  });

  const ensureLaunchTerminal = useCallback(
    (workspaceId: string) => ensureTerminalWithTitle(workspaceId, "launch", "Launch"),
    [ensureTerminalWithTitle],
  );

  const pendingClaudeTuiOpenRef = useRef<PendingClaudeTuiOpen | null>(null);

  const handleOpenClaudeTui = useCallback(
    (input: { workspaceId: string; workspacePath: string; sessionId: string }) => {
      const command = buildClaudeResumeTerminalCommand(input.sessionId);
      if (!command) {
        return;
      }
      const terminalId = ensureTerminalWithTitle(
        input.workspaceId,
        `claude-tui:${input.sessionId}`,
        t("terminal.claudeTuiResumeTitle"),
      );
      pendingClaudeTuiOpenRef.current = {
        workspaceId: input.workspaceId,
        terminalId,
        command,
      };
      openTerminal();
      void restartTerminalSession(input.workspaceId, terminalId).catch((error) => {
        pendingClaudeTuiOpenRef.current = null;
        addDebugEntry({
          id: `${Date.now()}-claude-tui-resume-terminal-error`,
          timestamp: Date.now(),
          source: "error",
          label: "claude tui resume terminal error",
          payload: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [addDebugEntry, ensureTerminalWithTitle, openTerminal, restartTerminalSession, t],
  );

  useEffect(() => {
    const pending = pendingClaudeTuiOpenRef.current;
    const pendingKey = pending
      ? `${pending.workspaceId}:${pending.terminalId}`
      : null;
    if (
      !pending ||
      terminalState?.readyKey !== pendingKey ||
      activeTerminalId !== pending.terminalId ||
      activeWorkspace?.id !== pending.workspaceId
    ) {
      return;
    }
    pendingClaudeTuiOpenRef.current = null;
    writeTerminalSession(
      pending.workspaceId,
      pending.terminalId,
      `${pending.command}\n`,
    ).catch((error) => {
      addDebugEntry({
        id: `${Date.now()}-claude-tui-resume-write-error`,
        timestamp: Date.now(),
        source: "error",
        label: "claude tui resume write error",
        payload: error instanceof Error ? error.message : String(error),
      });
    });
  }, [activeTerminalId, activeWorkspace?.id, addDebugEntry, terminalState?.readyKey]);

  const launchScriptState = useWorkspaceLaunchScript({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal,
    ensureLaunchTerminal,
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const runtimeRunState = useWorkspaceRuntimeRun({ activeWorkspace });

  const handleToggleRuntimeConsole = useCallback(() => {
    if (runtimeRunState.runtimeConsoleVisible) {
      runtimeRunState.onCloseRuntimeConsole();
      return;
    }
    closeTerminalPanel();
    runtimeRunState.onOpenRuntimeConsole();
  }, [closeTerminalPanel, runtimeRunState]);

  const handleToggleTerminalPanel = useCallback(() => {
    if (terminalOpen) {
      runtimeRunState.onCloseRuntimeConsole();
    }
    handleToggleTerminal();
  }, [handleToggleTerminal, runtimeRunState, terminalOpen]);

  useEffect(() => {
    if (!terminalOpen || !runtimeRunState.runtimeConsoleVisible) {
      return;
    }
    closeTerminalPanel();
  }, [closeTerminalPanel, runtimeRunState.runtimeConsoleVisible, terminalOpen]);

  const launchScriptsState = useWorkspaceLaunchScripts({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal,
    ensureLaunchTerminal: (workspaceId, entry, title) => {
      const label = entry.label?.trim() || entry.icon;
      return ensureTerminalWithTitle(
        workspaceId,
        `launch:${entry.id}`,
        title || `Launch ${label}`,
      );
    },
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const worktreeSetupScriptState = useWorktreeSetupScript({
    ensureTerminalWithTitle,
    restartTerminalSession,
    openTerminal,
    onDebug: addDebugEntry,
  });

  const handleWorktreeCreated = useCallback(
    async (worktree: any, _parentWorkspace?: any) => {
      await worktreeSetupScriptState.maybeRunWorktreeSetupScript(worktree);
    },
    [worktreeSetupScriptState],
  );

  const resolveCloneProjectContext = useCallback(
    (workspace: any) => {
      const groupId = workspace.settings.groupId ?? null;
      const group = groupId
        ? appSettings.workspaceGroups.find((entry: any) => entry.id === groupId)
        : null;
      return {
        groupId,
        copiesFolder: group?.copiesFolder ?? null,
      };
    },
    [appSettings.workspaceGroups],
  );

  const handleSelectOpenAppId = useCallback(
    (id: string) => {
      writeClientStoreValue("app", "openWorkspaceApp", id);
      setAppSettings((current: any) => {
        if (current.selectedOpenAppId === id) {
          return current;
        }
        const nextSettings = {
          ...current,
          selectedOpenAppId: id,
        };
        void queueSaveSettings(nextSettings);
        return nextSettings;
      });
    },
    [queueSaveSettings, setAppSettings],
  );

  const navigateToThreadWithUiOptions = useCallback(
    (
      workspaceId: string,
      threadId: string,
      options: {
        collapseRightPanel?: boolean;
      } = {},
    ) => {
      const { collapseRightPanel: shouldCollapseRightPanel = true } = options;
      exitDiffView();
      setAppMode("chat");
      setActiveTab("codex");
      setHomeOpen(false);
      if (shouldCollapseRightPanel) {
        collapseRightPanel();
      }
      setSelectedKanbanTaskId(null);
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      const threads = threadsByWorkspace[workspaceId] ?? [];
      const targetThread = threads.find((entry: any) => entry.id === threadId);
      if (targetThread?.engineSource) {
        setActiveEngine(targetThread.engineSource);
      }
    },
    [
      exitDiffView,
      collapseRightPanel,
      selectWorkspace,
      setActiveEngine,
      setActiveTab,
      setActiveThreadId,
      setAppMode,
      setHomeOpen,
      setSelectedKanbanTaskId,
      threadsByWorkspace,
    ],
  );

  const navigateToThread = useCallback(
    (workspaceId: string, threadId: string) => {
      navigateToThreadWithUiOptions(workspaceId, threadId);
    },
    [navigateToThreadWithUiOptions],
  );

  useEffect(() => {
    setNotificationActionHandler((extra: NotificationActionExtra) => {
      const workspaceId = typeof extra.workspaceId === "string" ? extra.workspaceId : undefined;
      const threadId = typeof extra.threadId === "string" ? extra.threadId : undefined;
      if (workspaceId && threadId) {
        navigateToThread(workspaceId, threadId);
      }
    });
    return () => {
      setNotificationActionHandler(null);
    };
  }, [navigateToThread]);

  const handleSelectStatusPanelSubagent = useCallback(
    (agent: any) => {
      const target = agent.navigationTarget;
      if (!target) {
        return;
      }
      if (target.kind === "thread") {
        if (!activeWorkspaceId) {
          return;
        }
        navigateToThreadWithUiOptions(activeWorkspaceId, target.threadId, {
          collapseRightPanel: false,
        });
        return;
      }
      if (target.kind === "claude-task") {
        exitDiffView();
        setAppMode("chat");
        setCenterMode("chat");
        setActiveTab("codex");
        setAgentTaskScrollRequest({
          nonce: Date.now(),
          taskId: target.taskId ?? null,
          toolUseId: target.toolUseId ?? null,
        });
      }
    },
    [
      activeWorkspaceId,
      exitDiffView,
      navigateToThreadWithUiOptions,
      setActiveTab,
      setAgentTaskScrollRequest,
      setAppMode,
      setCenterMode,
    ],
  );

  const openAppIconById = EMPTY_OPEN_APP_ICON_MAP;

  const persistProjectCopiesFolder = useCallback(
    async (groupId: string, copiesFolder: string) => {
      await queueSaveSettings({
        ...appSettings,
        workspaceGroups: appSettings.workspaceGroups.map((entry: any) =>
          entry.id === groupId ? { ...entry, copiesFolder } : entry,
        ),
      });
    },
    [appSettings, queueSaveSettings],
  );

  const {
    clonePrompt,
    openPrompt: openClonePrompt,
    confirmPrompt: confirmClonePrompt,
    cancelPrompt: cancelClonePrompt,
    updateCopyName: updateCloneCopyName,
    chooseCopiesFolder: chooseCloneCopiesFolder,
    useSuggestedCopiesFolder: useSuggestedCloneCopiesFolder,
    clearCopiesFolder: clearCloneCopiesFolder,
  } = useClonePrompt({
    addCloneAgent,
    connectWorkspace,
    onSelectWorkspace: selectWorkspace,
    resolveProjectContext: resolveCloneProjectContext,
    persistProjectCopiesFolder,
    onCompactActivate: isCompact ? () => setActiveTab("codex") : undefined,
    onError: (message) => {
      addDebugEntry({
        id: `${Date.now()}-client-add-clone-error`,
        timestamp: Date.now(),
        source: "error",
        label: "clone/add error",
        payload: message,
      });
    },
  });

  const handleArchiveActiveThread = useCallback(async () => {
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    const result = await removeThread(activeWorkspaceId, activeThreadId);
    if (!result.success) {
      alertError(result.message ?? t("workspace.deleteConversationFailed"));
      return;
    }
    clearDraftForThread(activeThreadId);
    removeImagesForThread(activeThreadId);
  }, [
    activeThreadId,
    activeWorkspaceId,
    alertError,
    clearDraftForThread,
    removeImagesForThread,
    removeThread,
    t,
  ]);

  return {
    renameWorktreePrompt,
    renameWorktreeNotice,
    renameWorktreeUpstreamPrompt,
    confirmRenameWorktreeUpstream,
    openRenameWorktreePrompt,
    handleOpenRenameWorktree,
    handleRenameWorktreeChange,
    handleRenameWorktreeCancel,
    handleRenameWorktreeConfirm,
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    ensureLaunchTerminal,
    ensureTerminalWithTitle,
    restartTerminalSession,
    launchScriptState,
    runtimeRunState,
    handleToggleRuntimeConsole,
    handleToggleTerminalPanel,
    launchScriptsState,
    worktreeSetupScriptState,
    handleWorktreeCreated,
    resolveCloneProjectContext,
    handleSelectOpenAppId,
    navigateToThread,
    handleOpenClaudeTui,
    handleSelectStatusPanelSubagent,
    openAppIconById,
    persistProjectCopiesFolder,
    clonePrompt,
    openClonePrompt,
    confirmClonePrompt,
    cancelClonePrompt,
    updateCloneCopyName,
    chooseCloneCopiesFolder,
    useSuggestedCloneCopiesFolder,
    clearCloneCopiesFolder,
    handleArchiveActiveThread,
  };
}
