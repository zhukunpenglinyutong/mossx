import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./styles/base.css";
import "./styles/buttons.css";
import "./styles/sidebar.css";
import "./styles/home.css";
import "./styles/workspace-home.css";
import "./styles/main.css";
import "./styles/messages.css";
import "./styles/approval-toasts.css";
import "./styles/error-toasts.css";
import "./styles/request-user-input.css";
import "./styles/update-toasts.css";
import "./styles/composer.css";
import "./styles/review-inline.css";
import "./styles/diff.css";
import "./styles/diff-viewer.css";
import "./styles/file-tree.css";
import "./styles/file-view-panel.css";
import "./styles/panel-tabs.css";
import "./styles/prompts.css";
import "./styles/debug.css";
import "./styles/terminal.css";
import "./styles/plan.css";
import "./styles/about.css";
import "./styles/tabbar.css";
import "./styles/worktree-modal.css";
import "./styles/clone-modal.css";
import "./styles/settings.css";
import "./styles/compact-base.css";
import "./styles/compact-phone.css";
import "./styles/compact-tablet.css";
import "./styles/tool-blocks.css";
import "./styles/status-panel.css";
import "./styles/kanban.css";
import successSoundUrl from "./assets/success-notification.mp3";
import errorSoundUrl from "./assets/error-notification.mp3";
import { AppLayout } from "./features/app/components/AppLayout";
import { AppModals } from "./features/app/components/AppModals";
import { MainHeaderActions } from "./features/app/components/MainHeaderActions";
import { useLayoutNodes } from "./features/layout/hooks/useLayoutNodes";
import { useWorkspaceDropZone } from "./features/workspaces/hooks/useWorkspaceDropZone";
import { useThreads } from "./features/threads/hooks/useThreads";
import { useWindowDrag } from "./features/layout/hooks/useWindowDrag";
import { useGitPanelController } from "./features/app/hooks/useGitPanelController";
import { useGitRemote } from "./features/git/hooks/useGitRemote";
import { useGitRepoScan } from "./features/git/hooks/useGitRepoScan";
import { usePullRequestComposer } from "./features/git/hooks/usePullRequestComposer";
import { useGitActions } from "./features/git/hooks/useGitActions";
import { useAutoExitEmptyDiff } from "./features/git/hooks/useAutoExitEmptyDiff";
import { useModels } from "./features/models/hooks/useModels";
import { useCollaborationModes } from "./features/collaboration/hooks/useCollaborationModes";
import { useCollaborationModeSelection } from "./features/collaboration/hooks/useCollaborationModeSelection";
import { useSkills } from "./features/skills/hooks/useSkills";
import { useCustomCommands } from "./features/commands/hooks/useCustomCommands";
import { useCustomPrompts } from "./features/prompts/hooks/useCustomPrompts";
import { useWorkspaceFiles } from "./features/workspaces/hooks/useWorkspaceFiles";
import { useGitBranches } from "./features/git/hooks/useGitBranches";
import { useDebugLog } from "./features/debug/hooks/useDebugLog";
import { useWorkspaceRefreshOnFocus } from "./features/workspaces/hooks/useWorkspaceRefreshOnFocus";
import { useWorkspaceRestore } from "./features/workspaces/hooks/useWorkspaceRestore";
import { useOpenPaths } from "./features/workspaces/hooks/useOpenPaths";
import { useRenameWorktreePrompt } from "./features/workspaces/hooks/useRenameWorktreePrompt";
import { useLayoutController } from "./features/app/hooks/useLayoutController";
import { useWindowLabel } from "./features/layout/hooks/useWindowLabel";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  SidebarCollapseButton,
  TitlebarExpandControls,
} from "./features/layout/components/SidebarToggleControls";
import { useAppSettingsController } from "./features/app/hooks/useAppSettingsController";
import { useUpdaterController } from "./features/app/hooks/useUpdaterController";
import { useErrorToasts } from "./features/notifications/hooks/useErrorToasts";
import { useComposerShortcuts } from "./features/composer/hooks/useComposerShortcuts";
import { useComposerMenuActions } from "./features/composer/hooks/useComposerMenuActions";
import { useComposerEditorState } from "./features/composer/hooks/useComposerEditorState";
import { useDictationController } from "./features/app/hooks/useDictationController";
import { useComposerController } from "./features/app/hooks/useComposerController";
import { useComposerInsert } from "./features/app/hooks/useComposerInsert";
import { useEngineController } from "./features/engine/hooks/useEngineController";
import { useRenameThreadPrompt } from "./features/threads/hooks/useRenameThreadPrompt";
import { useWorktreePrompt } from "./features/workspaces/hooks/useWorktreePrompt";
import { useClonePrompt } from "./features/workspaces/hooks/useClonePrompt";
import { useWorkspaceController } from "./features/app/hooks/useWorkspaceController";
import { useWorkspaceSelection } from "./features/workspaces/hooks/useWorkspaceSelection";
import { useGitHubPanelController } from "./features/app/hooks/useGitHubPanelController";
import { useSettingsModalState } from "./features/app/hooks/useSettingsModalState";
import { usePersistComposerSettings } from "./features/app/hooks/usePersistComposerSettings";
import { useSyncSelectedDiffPath } from "./features/app/hooks/useSyncSelectedDiffPath";
import { useMenuAcceleratorController } from "./features/app/hooks/useMenuAcceleratorController";
import { useAppMenuEvents } from "./features/app/hooks/useAppMenuEvents";
import { useWorkspaceActions } from "./features/app/hooks/useWorkspaceActions";
import { useWorkspaceCycling } from "./features/app/hooks/useWorkspaceCycling";
import { useThreadRows } from "./features/app/hooks/useThreadRows";
import { useInterruptShortcut } from "./features/app/hooks/useInterruptShortcut";
import { useArchiveShortcut } from "./features/app/hooks/useArchiveShortcut";
import { useLiquidGlassEffect } from "./features/app/hooks/useLiquidGlassEffect";
import { useCopyThread } from "./features/threads/hooks/useCopyThread";
import { useTerminalController } from "./features/terminal/hooks/useTerminalController";
import { useWorkspaceLaunchScript } from "./features/app/hooks/useWorkspaceLaunchScript";
import { useKanbanStore } from "./features/kanban/hooks/useKanbanStore";
import { KanbanView } from "./features/kanban/components/KanbanView";
import type { KanbanTask } from "./features/kanban/types";
import {
  resolveKanbanThreadCreationStrategy,
  type KanbanContextMode,
} from "./features/kanban/utils/contextMode";
import { deriveKanbanTaskTitle } from "./features/kanban/utils/taskTitle";
import { useWorkspaceLaunchScripts } from "./features/app/hooks/useWorkspaceLaunchScripts";
import { useWorktreeSetupScript } from "./features/app/hooks/useWorktreeSetupScript";
import { useGitCommitController } from "./features/app/hooks/useGitCommitController";
import { WorkspaceHome } from "./features/workspaces/components/WorkspaceHome";
import { pickWorkspacePath } from "./services/tauri";
import type {
  AccessMode,
  ComposerEditorSettings,
  EngineType,
  WorkspaceInfo,
} from "./types";
import { writeClientStoreValue } from "./services/clientStorage";
import { useOpenAppIcons } from "./features/app/hooks/useOpenAppIcons";
import { useCodeCssVars } from "./features/app/hooks/useCodeCssVars";
import { useAccountSwitching } from "./features/app/hooks/useAccountSwitching";
import { useMenuLocalization } from "./features/app/hooks/useMenuLocalization";

const AboutView = lazy(() =>
  import("./features/about/components/AboutView").then((module) => ({
    default: module.AboutView,
  })),
);

const SettingsView = lazy(() =>
  import("./features/settings/components/SettingsView").then((module) => ({
    default: module.SettingsView,
  })),
);

const GitHubPanelData = lazy(() =>
  import("./features/git/components/GitHubPanelData").then((module) => ({
    default: module.GitHubPanelData,
  })),
);


function MainApp() {
  const { t } = useTranslation();
  const {
    appSettings,
    setAppSettings,
    doctor,
    appSettingsLoading,
    reduceTransparency,
    setReduceTransparency,
    scaleShortcutTitle,
    scaleShortcutText,
    queueSaveSettings,
  } = useAppSettingsController();
  useCodeCssVars(appSettings);
  const {
    dictationModel,
    dictationState,
    dictationLevel,
    dictationTranscript,
    dictationError,
    dictationHint,
    dictationReady,
    handleToggleDictation,
    clearDictationTranscript,
    clearDictationError,
    clearDictationHint,
  } = useDictationController(appSettings);
  const {
    debugOpen,
    setDebugOpen,
    debugEntries,
    showDebugButton,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  } = useDebugLog();
  useLiquidGlassEffect({ reduceTransparency, onDebug: addDebugEntry });
  const [accessMode, setAccessMode] = useState<AccessMode>("current");
  const [activeTab, setActiveTab] = useState<
    "projects" | "codex" | "git" | "log"
  >("codex");
  const tabletTab = activeTab === "projects" ? "codex" : activeTab;
  const {
    workspaces,
    workspaceGroups,
    groupedWorkspaces,
    getWorkspaceGroupName,
    ungroupedLabel,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    addWorkspace,
    addWorkspaceFromPath,
    addCloneAgent,
    addWorktreeAgent,
    connectWorkspace,
    markWorkspaceConnected,
    updateWorkspaceSettings,
    updateWorkspaceCodexBin,
    createWorkspaceGroup,
    renameWorkspaceGroup,
    moveWorkspaceGroup,
    deleteWorkspaceGroup,
    assignWorkspaceGroup,
    removeWorkspace,
    removeWorktree,
    renameWorktree,
    renameWorktreeUpstream,
    deletingWorktreeIds,
    hasLoaded,
    refreshWorkspaces,
  } = useWorkspaceController({
    appSettings,
    addDebugEntry,
    queueSaveSettings,
  });
  const workspacesById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const {
    sidebarWidth,
    rightPanelWidth,
    onSidebarResizeStart,
    onRightPanelResizeStart,
    planPanelHeight,
    onPlanPanelResizeStart,
    terminalPanelHeight,
    onTerminalPanelResizeStart,
    debugPanelHeight,
    onDebugPanelResizeStart,
    kanbanConversationWidth,
    onKanbanConversationResizeStart,
    isCompact,
    isTablet,
    isPhone,
    sidebarCollapsed,
    rightPanelCollapsed,
    collapseSidebar,
    expandSidebar,
    collapseRightPanel,
    expandRightPanel,
    terminalOpen,
    handleDebugClick,
    handleToggleTerminal,
    openTerminal,
    closeTerminal: closeTerminalPanel,
  } = useLayoutController({
    activeWorkspaceId,
    setActiveTab,
    setDebugOpen,
    toggleDebugPanelShortcut: appSettings.toggleDebugPanelShortcut,
    toggleTerminalShortcut: appSettings.toggleTerminalShortcut,
  });
  const sidebarToggleProps = {
    isCompact,
    sidebarCollapsed,
    rightPanelCollapsed,
    onCollapseSidebar: collapseSidebar,
    onExpandSidebar: expandSidebar,
    onCollapseRightPanel: collapseRightPanel,
    onExpandRightPanel: expandRightPanel,
  };
  const {
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
  } = useSettingsModalState();
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    updaterState,
    startUpdate,
    dismissUpdate,
    handleTestNotificationSound,
  } = useUpdaterController({
    notificationSoundsEnabled: appSettings.notificationSoundsEnabled,
    onDebug: addDebugEntry,
    successSoundUrl,
    errorSoundUrl,
  });

  const { errorToasts, dismissErrorToast } = useErrorToasts();

  useEffect(() => {
    setAccessMode((prev) =>
      prev === "current" ? appSettings.defaultAccessMode : prev
    );
  }, [appSettings.defaultAccessMode]);

  const {
    gitIssues,
    gitIssuesTotal,
    gitIssuesLoading,
    gitIssuesError,
    gitPullRequests,
    gitPullRequestsTotal,
    gitPullRequestsLoading,
    gitPullRequestsError,
    gitPullRequestDiffs,
    gitPullRequestDiffsLoading,
    gitPullRequestDiffsError,
    gitPullRequestComments,
    gitPullRequestCommentsLoading,
    gitPullRequestCommentsError,
    handleGitIssuesChange,
    handleGitPullRequestsChange,
    handleGitPullRequestDiffsChange,
    handleGitPullRequestCommentsChange,
    resetGitHubPanelState,
  } = useGitHubPanelController();

  const {
    centerMode,
    setCenterMode,
    selectedDiffPath,
    setSelectedDiffPath,
    diffScrollRequestId,
    gitPanelMode,
    setGitPanelMode,
    gitDiffViewStyle,
    setGitDiffViewStyle,
    filePanelMode,
    setFilePanelMode,
    selectedPullRequest,
    setSelectedPullRequest,
    selectedCommitSha,
    setSelectedCommitSha,
    diffSource,
    setDiffSource,
    gitStatus,
    refreshGitStatus,
    queueGitStatusRefresh,
    refreshGitDiffs,
    gitLogEntries,
    gitLogTotal,
    gitLogAhead,
    gitLogBehind,
    gitLogAheadEntries,
    gitLogBehindEntries,
    gitLogUpstream,
    gitLogLoading,
    gitLogError,
    refreshGitLog,
    gitCommitDiffs,
    shouldLoadDiffs,
    activeDiffs,
    activeDiffLoading,
    activeDiffError,
    handleSelectDiff,
    handleSelectCommit,
    handleActiveDiffPath,
    handleGitPanelModeChange,
    editorFilePath,
    handleOpenFile,
    handleExitEditor,
    activeWorkspaceIdRef,
    activeWorkspaceRef,
  } = useGitPanelController({
    activeWorkspace,
    gitDiffPreloadEnabled: appSettings.preloadGitDiffs,
    isCompact,
    isTablet,
    activeTab,
    tabletTab,
    setActiveTab,
    prDiffs: gitPullRequestDiffs,
    prDiffsLoading: gitPullRequestDiffsLoading,
    prDiffsError: gitPullRequestDiffsError,
  });

  const shouldLoadGitHubPanelData =
    gitPanelMode === "issues" ||
    gitPanelMode === "prs" ||
    (shouldLoadDiffs && diffSource === "pr");

  useEffect(() => {
    resetGitHubPanelState();
  }, [activeWorkspaceId, resetGitHubPanelState]);
  const { remote: gitRemoteUrl } = useGitRemote(activeWorkspace);
  const {
    repos: gitRootCandidates,
    isLoading: gitRootScanLoading,
    error: gitRootScanError,
    depth: gitRootScanDepth,
    hasScanned: gitRootScanHasScanned,
    scan: scanGitRoots,
    setDepth: setGitRootScanDepth,
    clear: clearGitRootCandidates,
  } = useGitRepoScan(activeWorkspace);
  const {
    models,
    selectedModelId,
    setSelectedModelId,
    reasoningSupported,
    reasoningOptions,
    selectedEffort,
    setSelectedEffort
  } = useModels({
    activeWorkspace,
    onDebug: addDebugEntry,
    preferredModelId: appSettings.lastComposerModelId,
    preferredEffort: appSettings.lastComposerReasoningEffort,
  });

  const {
    collaborationModes,
    selectedCollaborationMode,
    selectedCollaborationModeId,
    setSelectedCollaborationModeId,
  } = useCollaborationModes({
    activeWorkspace,
    enabled: appSettings.experimentalCollaborationModesEnabled,
    onDebug: addDebugEntry,
  });

  const { skills } = useSkills({ activeWorkspace, onDebug: addDebugEntry });
  const {
    activeEngine,
    installedEngines,
    setActiveEngine,
    engineModelsAsOptions,
    engineStatuses,
  } = useEngineController({ activeWorkspace, onDebug: addDebugEntry });

  // --- Kanban mode ---
  const [appMode, setAppMode] = useState<import("./types").AppMode>("chat");
  const {
    panels: kanbanPanels,
    tasks: kanbanTasks,
    kanbanViewState,
    setKanbanViewState,
    createPanel: kanbanCreatePanel,
    updatePanel: kanbanUpdatePanel,
    deletePanel: kanbanDeletePanel,
    createTask: kanbanCreateTask,
    updateTask: kanbanUpdateTask,
    deleteTask: kanbanDeleteTask,
    reorderTask: kanbanReorderTask,
  } = useKanbanStore();

  const [engineSelectedModelIdByType, setEngineSelectedModelIdByType] =
    useState<Partial<Record<EngineType, string | null>>>({});

  const handleSelectModel = useCallback(
    (id: string | null) => {
      if (id === null) return;
      if (activeEngine === "codex") {
        setSelectedModelId(id);
        return;
      }
      setEngineSelectedModelIdByType((prev) => ({
        ...prev,
        [activeEngine]: id,
      }));
    },
    [activeEngine, setSelectedModelId],
  );

  // Derive effective models based on active engine
  // For Codex, use models from useModels hook; for other engines, use engineModelsAsOptions
  const effectiveModels = useMemo(() => {
    if (activeEngine === "codex") {
      return models;
    }
    return engineModelsAsOptions;
  }, [activeEngine, models, engineModelsAsOptions]);

  useEffect(() => {
    if (activeEngine === "codex") {
      return;
    }
    if (engineModelsAsOptions.length === 0) {
      return;
    }
    setEngineSelectedModelIdByType((prev) => {
      const existing = prev[activeEngine] ?? null;
      const isValid =
        !!existing &&
        engineModelsAsOptions.some((model) => model.id === existing);
      if (isValid) {
        return prev;
      }
      const nextDefault =
        engineModelsAsOptions.find((model) => model.isDefault)?.id ??
        engineModelsAsOptions[0]?.id ??
        null;
      if (!nextDefault || nextDefault === existing) {
        return prev;
      }
      return { ...prev, [activeEngine]: nextDefault };
    });
  }, [activeEngine, engineModelsAsOptions]);

  // Derive effective selected model ID based on active engine
  const effectiveSelectedModelId = useMemo(() => {
    if (activeEngine === "codex") {
      return selectedModelId;
    }
    const engineSelection = engineSelectedModelIdByType[activeEngine] ?? null;
    if (engineModelsAsOptions.length === 0) {
      return null;
    }
    const validModel = engineModelsAsOptions.find(
      (model) => model.id === engineSelection,
    );
    if (validModel) {
      return engineSelection;
    }
    const defaultModel = engineModelsAsOptions.find((model) => model.isDefault);
    return defaultModel?.id ?? engineModelsAsOptions[0]?.id ?? null;
  }, [activeEngine, engineModelsAsOptions, engineSelectedModelIdByType, selectedModelId]);

  // Derive effective reasoning support based on active engine
  const effectiveReasoningSupported = useMemo(() => {
    if (activeEngine === "codex") {
      return reasoningSupported;
    }
    // Other engines don't support reasoning effort selection (yet)
    return false;
  }, [activeEngine, reasoningSupported]);

  // Derive effective selected model based on active engine
  const effectiveSelectedModel = useMemo(() => {
    return effectiveModels.find((m) => m.id === effectiveSelectedModelId) ?? null;
  }, [effectiveModels, effectiveSelectedModelId]);

  useComposerShortcuts({
    textareaRef: composerInputRef,
    modelShortcut: appSettings.composerModelShortcut,
    accessShortcut: appSettings.composerAccessShortcut,
    reasoningShortcut: appSettings.composerReasoningShortcut,
    collaborationShortcut: appSettings.experimentalCollaborationModesEnabled
      ? appSettings.composerCollaborationShortcut
      : null,
    models: effectiveModels,
    collaborationModes,
    selectedModelId: effectiveSelectedModelId,
    onSelectModel: handleSelectModel,
    selectedCollaborationModeId,
    onSelectCollaborationMode: setSelectedCollaborationModeId,
    accessMode,
    onSelectAccessMode: setAccessMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
    reasoningSupported: effectiveReasoningSupported,
  });

  useComposerMenuActions({
    models: effectiveModels,
    selectedModelId: effectiveSelectedModelId,
    onSelectModel: handleSelectModel,
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: setSelectedCollaborationModeId,
    accessMode,
    onSelectAccessMode: setAccessMode,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
    reasoningSupported: effectiveReasoningSupported,
    onFocusComposer: () => composerInputRef.current?.focus(),
  });

  const {
    prompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    movePrompt,
    getWorkspacePromptsDir,
    getGlobalPromptsDir,
  } = useCustomPrompts({ activeWorkspace, onDebug: addDebugEntry });
  const { commands } = useCustomCommands({ onDebug: addDebugEntry });
  const { files, directories, gitignoredFiles, isLoading: isFilesLoading, refreshFiles } = useWorkspaceFiles({
    activeWorkspace,
    onDebug: addDebugEntry,
  });
  const { branches, checkoutBranch, createBranch } = useGitBranches({
    activeWorkspace,
    onDebug: addDebugEntry
  });
  const handleCheckoutBranch = async (name: string) => {
    await checkoutBranch(name);
    refreshGitStatus();
  };
  const handleCreateBranch = async (name: string) => {
    await createBranch(name);
    refreshGitStatus();
  };
  const alertError = useCallback((error: unknown) => {
    alert(error instanceof Error ? error.message : String(error));
  }, []);
  const {
    applyWorktreeChanges: handleApplyWorktreeChanges,
    revertAllGitChanges: handleRevertAllGitChanges,
    revertGitFile: handleRevertGitFile,
    stageGitAll: handleStageGitAll,
    stageGitFile: handleStageGitFile,
    unstageGitFile: handleUnstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
  } = useGitActions({
    activeWorkspace,
    onRefreshGitStatus: refreshGitStatus,
    onRefreshGitDiffs: refreshGitDiffs,
    onError: alertError,
  });

  const resolvedModel = effectiveSelectedModel?.model ?? null;
  const resolvedEffort = effectiveReasoningSupported ? selectedEffort : null;
  const activeGitRoot = activeWorkspace?.settings.gitRoot ?? null;
  const normalizePath = useCallback((value: string) => {
    return value.replace(/\\/g, "/").replace(/\/+$/, "");
  }, []);
  const handleSetGitRoot = useCallback(
    async (path: string | null) => {
      if (!activeWorkspace) {
        return;
      }
      await updateWorkspaceSettings(activeWorkspace.id, {
        gitRoot: path,
      });
      clearGitRootCandidates();
      refreshGitStatus();
    },
    [
      activeWorkspace,
      clearGitRootCandidates,
      refreshGitStatus,
      updateWorkspaceSettings,
    ],
  );
  const handlePickGitRoot = useCallback(async () => {
    if (!activeWorkspace) {
      return;
    }
    const selection = await pickWorkspacePath();
    if (!selection) {
      return;
    }
    const workspacePath = normalizePath(activeWorkspace.path);
    const selectedPath = normalizePath(selection);
    let nextRoot: string | null = null;
    if (selectedPath === workspacePath) {
      nextRoot = null;
    } else if (selectedPath.startsWith(`${workspacePath}/`)) {
      nextRoot = selectedPath.slice(workspacePath.length + 1);
    } else {
      nextRoot = selectedPath;
    }
    await handleSetGitRoot(nextRoot);
  }, [activeWorkspace, handleSetGitRoot, normalizePath]);
  const fileStatus =
    gitStatus.error
      ? t("git.statusUnavailable")
      : gitStatus.files.length > 0
        ? t("git.filesChanged", { count: gitStatus.files.length })
        : t("git.workingTreeClean");

  usePersistComposerSettings({
    appSettingsLoading,
    selectedModelId,
    selectedEffort,
    setAppSettings,
    queueSaveSettings,
  });

  const { textareaHeight, onTextareaHeightChange } =
    useComposerEditorState();

  const composerEditorSettings = useMemo<ComposerEditorSettings>(
    () => ({
      preset: appSettings.composerEditorPreset,
      expandFenceOnSpace: appSettings.composerFenceExpandOnSpace,
      expandFenceOnEnter: appSettings.composerFenceExpandOnEnter,
      fenceLanguageTags: appSettings.composerFenceLanguageTags,
      fenceWrapSelection: appSettings.composerFenceWrapSelection,
      autoWrapPasteMultiline: appSettings.composerFenceAutoWrapPasteMultiline,
      autoWrapPasteCodeLike: appSettings.composerFenceAutoWrapPasteCodeLike,
      continueListOnShiftEnter: appSettings.composerListContinuation,
    }),
    [
      appSettings.composerEditorPreset,
      appSettings.composerFenceExpandOnSpace,
      appSettings.composerFenceExpandOnEnter,
      appSettings.composerFenceLanguageTags,
      appSettings.composerFenceWrapSelection,
      appSettings.composerFenceAutoWrapPasteMultiline,
      appSettings.composerFenceAutoWrapPasteCodeLike,
      appSettings.composerListContinuation,
    ],
  );


  useSyncSelectedDiffPath({
    diffSource,
    centerMode,
    gitPullRequestDiffs,
    gitCommitDiffs,
    selectedDiffPath,
    setSelectedDiffPath,
  });

  const { collaborationModePayload } = useCollaborationModeSelection({
    selectedCollaborationMode,
    selectedCollaborationModeId,
    selectedEffort: resolvedEffort,
    resolvedModel,
  });

  const {
    setActiveThreadId,
    activeThreadId,
    activeItems,
    approvals,
    userInputRequests,
    threadsByWorkspace,
    threadParentById,
    threadStatusById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    tokenUsageByThread,
    rateLimitsByWorkspace,
    accountByWorkspace,
    planByThread,
    lastAgentMessageByThread,
    interruptTurn,
    removeThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    pinnedThreadsVersion,
    renameThread,
    triggerAutoThreadTitle,
    isThreadAutoNaming,
    startThreadForWorkspace,
    forkThreadForWorkspace,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    resetWorkspaceThreads,
    refreshThread,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startMcp,
    startStatus,
    reviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
    refreshAccountInfo,
    refreshAccountRateLimits,
  } = useThreads({
    activeWorkspace,
    onWorkspaceConnected: markWorkspaceConnected,
    onDebug: addDebugEntry,
    model: resolvedModel,
    effort: resolvedEffort,
    collaborationMode: collaborationModePayload,
    accessMode,
    steerEnabled: appSettings.experimentalSteerEnabled,
    customPrompts: prompts,
    onMessageActivity: queueGitStatusRefresh,
    activeEngine,
  });
  const {
    activeAccount,
    accountSwitching,
    handleSwitchAccount,
    handleCancelSwitchAccount,
  } = useAccountSwitching({
    activeWorkspaceId,
    accountByWorkspace,
    refreshAccountInfo,
    refreshAccountRateLimits,
    alertError,
  });
  const activeThreadIdRef = useRef<string | null>(activeThreadId ?? null);
  const { getThreadRows } = useThreadRows(threadParentById);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId ?? null;
  }, [activeThreadId]);

  useAutoExitEmptyDiff({
    centerMode,
    autoExitEnabled: diffSource === "local",
    activeDiffCount: activeDiffs.length,
    activeDiffLoading,
    activeDiffError,
    activeThreadId,
    isCompact,
    setCenterMode,
    setSelectedDiffPath,
    setActiveTab,
  });

  const { handleCopyThread } = useCopyThread({
    activeItems,
    onDebug: addDebugEntry,
  });

  const {
    renamePrompt,
    openRenamePrompt,
    handleRenamePromptChange,
    handleRenamePromptCancel,
    handleRenamePromptConfirm,
  } = useRenameThreadPrompt({
    threadsByWorkspace,
    renameThread,
  });

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
    onRenameSuccess: (workspace) => {
      resetWorkspaceThreads(workspace.id);
      void listThreadsForWorkspace(workspace);
      if (activeThreadId && activeWorkspaceId === workspace.id) {
        void refreshThread(workspace.id, activeThreadId);
      }
    },
  });

  const handleRenameThread = useCallback(
    (workspaceId: string, threadId: string) => {
      openRenamePrompt(workspaceId, threadId);
    },
    [openRenamePrompt],
  );

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

  const launchScriptState = useWorkspaceLaunchScript({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal,
    ensureLaunchTerminal,
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

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
    async (worktree: WorkspaceInfo, _parentWorkspace?: WorkspaceInfo) => {
      await worktreeSetupScriptState.maybeRunWorktreeSetupScript(worktree);
    },
    [worktreeSetupScriptState],
  );

  const { exitDiffView, selectWorkspace, selectHome } = useWorkspaceSelection({
    workspaces,
    isCompact,
    activeWorkspaceId,
    setActiveTab,
    setActiveWorkspaceId,
    updateWorkspaceSettings,
    setCenterMode,
    setSelectedDiffPath,
  });
  const {
    worktreePrompt,
    openPrompt: openWorktreePrompt,
    confirmPrompt: confirmWorktreePrompt,
    cancelPrompt: cancelWorktreePrompt,
    updateBranch: updateWorktreeBranch,
    updateSetupScript: updateWorktreeSetupScript,
  } = useWorktreePrompt({
    addWorktreeAgent,
    updateWorkspaceSettings,
    connectWorkspace,
    onSelectWorkspace: selectWorkspace,
    onWorktreeCreated: handleWorktreeCreated,
    onCompactActivate: isCompact ? () => setActiveTab("codex") : undefined,
    onError: (message) => {
      addDebugEntry({
        id: `${Date.now()}-client-add-worktree-error`,
        timestamp: Date.now(),
        source: "error",
        label: "worktree/add error",
        payload: message,
      });
    },
  });

  const resolveCloneProjectContext = useCallback(
    (workspace: WorkspaceInfo) => {
      const groupId = workspace.settings.groupId ?? null;
      const group = groupId
        ? appSettings.workspaceGroups.find((entry) => entry.id === groupId)
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
      setAppSettings((current) => {
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

  const openAppIconById = useOpenAppIcons(appSettings.openAppTargets);

  const persistProjectCopiesFolder = useCallback(
    async (groupId: string, copiesFolder: string) => {
      await queueSaveSettings({
        ...appSettings,
        workspaceGroups: appSettings.workspaceGroups.map((entry) =>
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

  const latestAgentRuns = useMemo(() => {
    const entries: Array<{
      threadId: string;
      message: string;
      timestamp: number;
      projectName: string;
      groupName?: string | null;
      workspaceId: string;
      isProcessing: boolean;
    }> = [];
    workspaces.forEach((workspace) => {
      const threads = threadsByWorkspace[workspace.id] ?? [];
      threads.forEach((thread) => {
        const entry = lastAgentMessageByThread[thread.id];
        if (entry) {
          entries.push({
            threadId: thread.id,
            message: entry.text,
            timestamp: entry.timestamp,
            projectName: workspace.name,
            groupName: getWorkspaceGroupName(workspace.id),
            workspaceId: workspace.id,
            isProcessing: threadStatusById[thread.id]?.isProcessing ?? false
          });
        } else if (thread.id.startsWith("claude:")) {
          entries.push({
            threadId: thread.id,
            message: thread.name,
            timestamp: thread.updatedAt,
            projectName: workspace.name,
            groupName: getWorkspaceGroupName(workspace.id),
            workspaceId: workspace.id,
            isProcessing: false
          });
        }
      });
    });
    return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
  }, [
    lastAgentMessageByThread,
    getWorkspaceGroupName,
    threadStatusById,
    threadsByWorkspace,
    workspaces
  ]);
  const isLoadingLatestAgents = useMemo(
    () =>
      !hasLoaded ||
      workspaces.some(
        (workspace) => threadListLoadingByWorkspace[workspace.id] ?? false
      ),
    [hasLoaded, threadListLoadingByWorkspace, workspaces]
  );

  const activeRateLimits = activeWorkspaceId
    ? rateLimitsByWorkspace[activeWorkspaceId] ?? null
    : null;
  const activeTokenUsage = activeThreadId
    ? tokenUsageByThread[activeThreadId] ?? null
    : null;
  const activePlan = activeThreadId
    ? planByThread[activeThreadId] ?? null
    : null;
  const hasActivePlan = Boolean(
    activePlan && (activePlan.steps.length > 0 || activePlan.explanation)
  );
  const showKanban = appMode === "kanban";
  const [selectedKanbanTaskId, setSelectedKanbanTaskId] = useState<string | null>(null);
  const showHome = !activeWorkspace && !showKanban;
  const showWorkspaceHome = Boolean(activeWorkspace && !activeThreadId);
  const canInterrupt = activeThreadId
    ? threadStatusById[activeThreadId]?.isProcessing ?? false
    : false;
  const isProcessing = activeThreadId
    ? threadStatusById[activeThreadId]?.isProcessing ?? false
    : false;
  const isReviewing = activeThreadId
    ? threadStatusById[activeThreadId]?.isReviewing ?? false
    : false;
  const {
    activeImages,
    attachImages,
    pickImages,
    removeImage,
    clearActiveImages,
    removeImagesForThread,
    activeQueue,
    handleSend,
    queueMessage,
    prefillDraft,
    setPrefillDraft,
    composerInsert,
    setComposerInsert,
    activeDraft,
    handleDraftChange,
    handleSendPrompt,
    handleEditQueued,
    handleDeleteQueued,
    clearDraftForThread,
  } = useComposerController({
    activeThreadId,
    activeWorkspaceId,
    activeWorkspace,
    isProcessing,
    isReviewing,
    steerEnabled: appSettings.experimentalSteerEnabled,
    activeEngine,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startMcp,
    startStatus,
  });

  const handleInsertComposerText = useComposerInsert({
    activeThreadId,
    draftText: activeDraft,
    onDraftChange: handleDraftChange,
    textareaRef: composerInputRef,
  });

  const RECENT_THREAD_LIMIT = 8;
  const { recentThreads } = useMemo(() => {
    if (!activeWorkspaceId) {
      return { recentThreads: [] };
    }
    const threads = threadsByWorkspace[activeWorkspaceId] ?? [];
    if (threads.length === 0) {
      return { recentThreads: [] };
    }
    const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
    const slice = sorted.slice(0, RECENT_THREAD_LIMIT);
    const summaries = slice.map((thread) => {
      const status = threadStatusById[thread.id];
      const displayName = thread.name?.trim() || t("threads.untitledThread");
      return {
        id: thread.id,
        workspaceId: activeWorkspaceId,
        threadId: thread.id,
        title: displayName,
        updatedAt: thread.updatedAt,
        isProcessing: status?.isProcessing ?? false,
        isReviewing: status?.isReviewing ?? false,
      };
    });
    return {
      recentThreads: summaries,
    };
  }, [activeWorkspaceId, threadStatusById, threadsByWorkspace, t]);

  const {
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    commitLoading,
    pushLoading,
    syncLoading,
    commitError,
    pushError,
    syncError,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPush: handlePush,
    onSync: handleSync,
  } = useGitCommitController({
    activeWorkspace,
    activeWorkspaceId,
    activeWorkspaceIdRef,
    gitStatus,
    refreshGitStatus,
    refreshGitLog,
  });

  const handleSendPromptToNewAgent = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!activeWorkspace || !trimmed) {
        return;
      }
      if (!activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      const threadId = await startThreadForWorkspace(activeWorkspace.id, {
        activate: false,
      });
      if (!threadId) {
        return;
      }
      await sendUserMessageToThread(activeWorkspace, threadId, trimmed, []);
    },
    [activeWorkspace, connectWorkspace, sendUserMessageToThread, startThreadForWorkspace],
  );


  const handleCreatePrompt = useCallback(
    async (data: {
      scope: "workspace" | "global";
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      try {
        await createPrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, createPrompt],
  );

  const handleUpdatePrompt = useCallback(
    async (data: {
      path: string;
      name: string;
      description?: string | null;
      argumentHint?: string | null;
      content: string;
    }) => {
      try {
        await updatePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, updatePrompt],
  );

  const handleDeletePrompt = useCallback(
    async (path: string) => {
      try {
        await deletePrompt(path);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, deletePrompt],
  );

  const handleMovePrompt = useCallback(
    async (data: { path: string; scope: "workspace" | "global" }) => {
      try {
        await movePrompt(data);
      } catch (error) {
        alertError(error);
      }
    },
    [alertError, movePrompt],
  );

  const handleRevealWorkspacePrompts = useCallback(async () => {
    try {
      const path = await getWorkspacePromptsDir();
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getWorkspacePromptsDir]);

  const handleRevealGeneralPrompts = useCallback(async () => {
    try {
      const path = await getGlobalPromptsDir();
      if (!path) {
        return;
      }
      await revealItemInDir(path);
    } catch (error) {
      alertError(error);
    }
  }, [alertError, getGlobalPromptsDir]);

  const isWorktreeWorkspace = activeWorkspace?.kind === "worktree";
  const activeParentWorkspace = isWorktreeWorkspace
    ? workspacesById.get(activeWorkspace?.parentId ?? "") ?? null
    : null;
  const worktreeLabel = isWorktreeWorkspace
    ? activeWorkspace?.worktree?.branch ?? activeWorkspace?.name ?? null
    : null;
  const activeRenamePrompt =
    renameWorktreePrompt?.workspaceId === activeWorkspace?.id
      ? renameWorktreePrompt
      : null;
  const worktreeRename =
    isWorktreeWorkspace && activeWorkspace
      ? {
          name: activeRenamePrompt?.name ?? worktreeLabel ?? "",
          error: activeRenamePrompt?.error ?? null,
          notice: renameWorktreeNotice,
          isSubmitting: activeRenamePrompt?.isSubmitting ?? false,
          isDirty: activeRenamePrompt
            ? activeRenamePrompt.name.trim() !==
              activeRenamePrompt.originalName.trim()
            : false,
          upstream:
            renameWorktreeUpstreamPrompt?.workspaceId === activeWorkspace.id
              ? {
                  oldBranch: renameWorktreeUpstreamPrompt.oldBranch,
                  newBranch: renameWorktreeUpstreamPrompt.newBranch,
                  error: renameWorktreeUpstreamPrompt.error,
                  isSubmitting: renameWorktreeUpstreamPrompt.isSubmitting,
                  onConfirm: confirmRenameWorktreeUpstream,
                }
              : null,
          onFocus: handleOpenRenameWorktree,
          onChange: handleRenameWorktreeChange,
          onCancel: handleRenameWorktreeCancel,
          onCommit: handleRenameWorktreeConfirm,
        }
      : null;
  const baseWorkspaceRef = useRef(activeParentWorkspace ?? activeWorkspace);

  useEffect(() => {
    baseWorkspaceRef.current = activeParentWorkspace ?? activeWorkspace;
  }, [activeParentWorkspace, activeWorkspace]);

  useEffect(() => {
    if (!isPhone) {
      return;
    }
    if (!activeWorkspace && activeTab !== "projects") {
      setActiveTab("projects");
    }
  }, [activeTab, activeWorkspace, isPhone]);

  useEffect(() => {
    if (!isTablet) {
      return;
    }
    if (activeTab === "projects") {
      setActiveTab("codex");
    }
  }, [activeTab, isTablet]);

  useWindowDrag("titlebar");

  useEffect(() => {
    try {
      const title = activeWorkspace
        ? `CodeMoss - ${activeWorkspace.name}`
        : "CodeMoss";
      void getCurrentWindow().setTitle(title);
    } catch {
      // Non-Tauri environment, ignore.
    }
  }, [activeWorkspace]);

  useWorkspaceRestore({
    workspaces,
    hasLoaded,
    connectWorkspace,
    listThreadsForWorkspace
  });
  useWorkspaceRefreshOnFocus({
    workspaces,
    refreshWorkspaces,
    listThreadsForWorkspace
  });

  const {
    handleAddWorkspace,
    handleAddWorkspaceFromPath,
    handleAddAgent,
    handleAddWorktreeAgent,
    handleAddCloneAgent,
  } = useWorkspaceActions({
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
    onDebug: addDebugEntry,
  });

  const handleDropWorkspacePaths = useCallback(
    async (paths: string[]) => {
      const uniquePaths = Array.from(
        new Set(paths.filter((path) => path.length > 0)),
      );
      if (uniquePaths.length === 0) {
        return;
      }
      uniquePaths.forEach((path) => {
        void handleAddWorkspaceFromPath(path);
      });
    },
    [handleAddWorkspaceFromPath],
  );

  useOpenPaths({
    onOpenPaths: handleDropWorkspacePaths,
  });

  const {
    dropTargetRef: workspaceDropTargetRef,
    isDragOver: isWorkspaceDropActive,
    handleDragOver: handleWorkspaceDragOver,
    handleDragEnter: handleWorkspaceDragEnter,
    handleDragLeave: handleWorkspaceDragLeave,
    handleDrop: handleWorkspaceDrop,
  } = useWorkspaceDropZone({
    onDropPaths: handleDropWorkspacePaths,
  });

  const handleArchiveActiveThread = useCallback(() => {
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    removeThread(activeWorkspaceId, activeThreadId);
    clearDraftForThread(activeThreadId);
    removeImagesForThread(activeThreadId);
  }, [
    activeThreadId,
    activeWorkspaceId,
    clearDraftForThread,
    removeImagesForThread,
    removeThread,
  ]);

  useInterruptShortcut({
    isEnabled: canInterrupt,
    shortcut: appSettings.interruptShortcut,
    onTrigger: () => {
      void interruptTurn();
    },
  });

  const {
    handleSelectPullRequest,
    resetPullRequestSelection,
    isPullRequestComposer,
    composerSendLabel,
    handleComposerSend,
    handleComposerQueue,
  } = usePullRequestComposer({
    activeWorkspace,
    selectedPullRequest,
    gitPullRequestDiffs,
    filePanelMode,
    gitPanelMode,
    centerMode,
    isCompact,
    setSelectedPullRequest,
    setDiffSource,
    setSelectedDiffPath,
    setCenterMode,
    setGitPanelMode,
    setPrefillDraft,
    setActiveTab,
    connectWorkspace,
    startThreadForWorkspace,
    sendUserMessageToThread,
    clearActiveImages,
    handleSend,
    queueMessage,
  });

  const [selectedComposerKanbanPanelId, setSelectedComposerKanbanPanelId] =
    useState<string | null>(null);
  const [composerKanbanContextMode, setComposerKanbanContextMode] =
    useState<KanbanContextMode>("new");
  const composerKanbanWorkspaceIds = useMemo(() => {
    if (!activeWorkspace) {
      return [] as string[];
    }
    const ids = new Set<string>();
    ids.add(activeWorkspace.id);
    if (activeWorkspace.parentId) {
      ids.add(activeWorkspace.parentId);
    }
    // If current workspace is a parent/main workspace, include its worktrees too.
    for (const workspace of workspaces) {
      if (workspace.parentId === activeWorkspace.id) {
        ids.add(workspace.id);
      }
    }
    return Array.from(ids);
  }, [activeWorkspace, workspaces]);
  const composerLinkedKanbanPanels = useMemo(() => {
    if (composerKanbanWorkspaceIds.length === 0) {
      return [];
    }
    return kanbanPanels
      .filter((panel) => composerKanbanWorkspaceIds.includes(panel.workspaceId))
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((panel) => ({
        id: panel.id,
        name: panel.name,
        workspaceId: panel.workspaceId,
      }));
  }, [composerKanbanWorkspaceIds, kanbanPanels]);

  useEffect(() => {
    if (!selectedComposerKanbanPanelId) {
      return;
    }
    const stillExists = composerLinkedKanbanPanels.some(
      (panel) => panel.id === selectedComposerKanbanPanelId,
    );
    if (!stillExists) {
      setSelectedComposerKanbanPanelId(null);
    }
  }, [composerLinkedKanbanPanels, selectedComposerKanbanPanelId]);

  const handleOpenComposerKanbanPanel = useCallback(
    (panelId: string) => {
      const panel = composerLinkedKanbanPanels.find((entry) => entry.id === panelId);
      if (!panel) {
        return;
      }
      setKanbanViewState({
        view: "board",
        workspaceId: panel.workspaceId,
        panelId,
      });
      setAppMode("kanban");
    },
    [composerLinkedKanbanPanels, setKanbanViewState],
  );

  const resolveComposerKanbanPanel = useCallback(
    (text: string) => {
      const tagMatches = Array.from(text.matchAll(/&@([^\s]+)/g))
        .map((entry) => entry[1]?.trim())
        .filter((value): value is string => Boolean(value));
      const panelByName = new Map(
        composerLinkedKanbanPanels.map((panel) => [panel.name, panel.id]),
      );
      const firstTaggedPanelId =
        tagMatches.map((name) => panelByName.get(name)).find(Boolean) ?? null;
      const panelId =
        firstTaggedPanelId ??
        (selectedComposerKanbanPanelId &&
        composerLinkedKanbanPanels.some(
          (panel) => panel.id === selectedComposerKanbanPanelId,
        )
          ? selectedComposerKanbanPanelId
          : null);
      const cleanText = text.replace(/&@[^\s]+/g, " ").replace(/\s+/g, " ").trim();
      return { panelId, cleanText };
    },
    [composerLinkedKanbanPanels, selectedComposerKanbanPanelId],
  );

  const handleComposerSendWithKanban = useCallback(
    async (text: string, images: string[]) => {
      const trimmedOriginalText = text.trim();
      const { panelId, cleanText } = resolveComposerKanbanPanel(trimmedOriginalText);
      const textForSending = cleanText;

      if (!panelId || !activeWorkspaceId || isPullRequestComposer) {
        const fallbackText =
          textForSending.length > 0 ? textForSending : trimmedOriginalText;
        await handleComposerSend(fallbackText, images);
        return;
      }

      const workspace = workspacesById.get(activeWorkspaceId);
      if (!workspace) {
        await handleComposerSend(
          textForSending.length > 0 ? textForSending : trimmedOriginalText,
          images,
        );
        return;
      }

      // &@ 看板消息必须在新会话里执行，不能污染当前会话窗口
      if (!workspace.connected) {
        await connectWorkspace(workspace);
      }
      const engine = (activeEngine === "codex" ? "codex" : "claude") as
        | "codex"
        | "claude";
      const isActiveThreadInWorkspace = Boolean(
        activeWorkspaceId &&
          activeThreadId &&
          threadsByWorkspace[activeWorkspaceId]?.some(
            (thread) => thread.id === activeThreadId,
          ),
      );
      const threadCreationStrategy = resolveKanbanThreadCreationStrategy({
        mode: composerKanbanContextMode,
        engine,
        activeThreadId,
        activeWorkspaceId,
        targetWorkspaceId: workspace.id,
        isActiveThreadInWorkspace,
      });
      const canInheritViaFork = threadCreationStrategy === "inherit";
      const threadId =
        canInheritViaFork && activeThreadId
          ? await forkThreadForWorkspace(activeWorkspaceId, activeThreadId, {
              activate: false,
            })
          : await startThreadForWorkspace(activeWorkspaceId, {
              engine,
              activate: false,
            });
      const resolvedThreadId =
        threadId ??
        (await startThreadForWorkspace(activeWorkspaceId, {
          engine,
          activate: false,
        }));
      if (!resolvedThreadId) {
        return;
      }
      if (canInheritViaFork && !threadId) {
        addDebugEntry({
          id: `${Date.now()}-kanban-linked-fork-fallback`,
          timestamp: Date.now(),
          source: "client",
          label: "kanban/linked fork fallback",
          payload: {
            workspaceId: activeWorkspaceId,
            reason: "fork-unavailable",
          },
        });
      }

      if (textForSending.length > 0 || images.length > 0) {
        await sendUserMessageToThread(workspace, resolvedThreadId, textForSending, images);
      }

      const taskDescription = textForSending.length > 0 ? textForSending : trimmedOriginalText;
      const taskFallbackTitle =
        composerLinkedKanbanPanels.find((panel) => panel.id === panelId)?.name ||
        "Kanban Task";
      const taskTitle = deriveKanbanTaskTitle(taskDescription, taskFallbackTitle);
      const createdTask = kanbanCreateTask({
        workspaceId: activeWorkspaceId,
        panelId,
        title: taskTitle,
        description: taskDescription,
        engineType: engine,
        modelId: effectiveSelectedModelId,
        branchName: "main",
        images,
        autoStart: true,
      });

      kanbanUpdateTask(createdTask.id, {
        threadId: resolvedThreadId,
        status: "inprogress",
      });
    },
    [
      resolveComposerKanbanPanel,
      handleComposerSend,
      activeWorkspaceId,
      workspacesById,
      connectWorkspace,
      startThreadForWorkspace,
      forkThreadForWorkspace,
      sendUserMessageToThread,
      isPullRequestComposer,
      activeEngine,
      activeThreadId,
      threadsByWorkspace,
      addDebugEntry,
      composerKanbanContextMode,
      effectiveSelectedModelId,
      composerLinkedKanbanPanels,
      kanbanCreateTask,
      kanbanUpdateTask,
    ],
  );

  const handleSelectWorkspaceInstance = useCallback(
    (workspaceId: string, threadId: string) => {
      exitDiffView();
      resetPullRequestSelection();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    [
      exitDiffView,
      isCompact,
      resetPullRequestSelection,
      selectWorkspace,
      setActiveTab,
      setActiveThreadId,
    ],
  );

  const handleStartWorkspaceConversation = useCallback(async () => {
    if (!activeWorkspace) {
      return;
    }
    try {
      if (!activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      const threadId = await startThreadForWorkspace(activeWorkspace.id, {
        activate: true,
        engine: activeEngine,
      });
      if (!threadId) {
        return;
      }
      setActiveThreadId(threadId, activeWorkspace.id);
      if (isCompact) {
        setActiveTab("codex");
      }
    } catch (error) {
      alertError(error);
    }
  }, [
    activeEngine,
    activeWorkspace,
    alertError,
    connectWorkspace,
    isCompact,
    setActiveTab,
    setActiveThreadId,
    startThreadForWorkspace,
  ]);

  const handleContinueLatestConversation = useCallback(() => {
    const latest = recentThreads[0];
    if (!latest) {
      return;
    }
    handleSelectWorkspaceInstance(latest.workspaceId, latest.threadId);
  }, [handleSelectWorkspaceInstance, recentThreads]);

  const handleStartGuidedConversation = useCallback(
    async (prompt: string) => {
      const normalizedPrompt = prompt.trim();
      if (!activeWorkspace || !normalizedPrompt) {
        return;
      }
      try {
        if (!activeWorkspace.connected) {
          await connectWorkspace(activeWorkspace);
        }
        const threadId = await startThreadForWorkspace(activeWorkspace.id, {
          activate: true,
          engine: activeEngine,
        });
        if (!threadId) {
          return;
        }
        setActiveThreadId(threadId, activeWorkspace.id);
        await sendUserMessageToThread(activeWorkspace, threadId, normalizedPrompt);
        if (isCompact) {
          setActiveTab("codex");
        }
      } catch (error) {
        alertError(error);
      }
    },
    [
      activeEngine,
      activeWorkspace,
      alertError,
      connectWorkspace,
      isCompact,
      sendUserMessageToThread,
      setActiveTab,
      setActiveThreadId,
      startThreadForWorkspace,
    ],
  );

  const handleRevealActiveWorkspace = useCallback(async () => {
    if (!activeWorkspace?.path) {
      return;
    }
    try {
      await revealItemInDir(activeWorkspace.path);
    } catch (error) {
      alertError(error);
    }
  }, [activeWorkspace?.path, alertError]);

  // --- Kanban conversation handlers ---
  const handleOpenTaskConversation = useCallback(
    async (task: KanbanTask) => {
      setSelectedKanbanTaskId(task.id);
      const workspace = workspacesById.get(task.workspaceId);
      if (!workspace) return;

      await connectWorkspace(workspace);
      selectWorkspace(task.workspaceId);

      const engine = (task.engineType ?? activeEngine) as "claude" | "codex";
      await setActiveEngine(engine);

      // Apply the model that was selected when the task was created
      if (task.modelId) {
        if (engine === "codex") {
          setSelectedModelId(task.modelId);
        } else {
          setEngineSelectedModelIdByType((prev) => ({
            ...prev,
            [engine]: task.modelId,
          }));
        }
      }

      if (task.threadId) {
        let resolvedThreadId = task.threadId;
        // If the stored threadId is a stale claude-pending-* that was already renamed,
        // resolve to the new ID by checking threadsByWorkspace.
        if (
          resolvedThreadId.startsWith("claude-pending-") &&
          !threadStatusById[resolvedThreadId]
        ) {
          const threads = threadsByWorkspace[task.workspaceId] ?? [];
          const otherTaskThreadIds = new Set(
            kanbanTasks
              .filter((t) => t.id !== task.id && t.threadId && !t.threadId.startsWith("claude-pending-"))
              .map((t) => t.threadId as string)
          );
          const match = threads.find(
            (t) => t.id.startsWith("claude:") && !otherTaskThreadIds.has(t.id)
          );
          if (match) {
            resolvedThreadId = match.id;
            kanbanUpdateTask(task.id, { threadId: resolvedThreadId });
          }
        }
        setActiveThreadId(resolvedThreadId, task.workspaceId);
      } else {
        const threadId = await startThreadForWorkspace(task.workspaceId, { engine });
        if (threadId) {
          kanbanUpdateTask(task.id, { threadId });
          setActiveThreadId(threadId, task.workspaceId);
        }
      }
    },
    [
      workspacesById,
      connectWorkspace,
      selectWorkspace,
      setActiveThreadId,
      startThreadForWorkspace,
      kanbanUpdateTask,
      activeEngine,
      setActiveEngine,
      setSelectedModelId,
      setEngineSelectedModelIdByType,
      threadStatusById,
      threadsByWorkspace,
      kanbanTasks,
    ]
  );

  const handleCloseTaskConversation = useCallback(() => {
    setSelectedKanbanTaskId(null);
  }, []);

  const handleKanbanCreateTask = useCallback(
    (input: Parameters<typeof kanbanCreateTask>[0]) => {
      const task = kanbanCreateTask(input);
      if (input.autoStart) {
        // Auto-execute: create thread and send first message (without opening conversation panel)
        const executeAutoStart = async () => {
          const workspace = workspacesById.get(task.workspaceId);
          if (!workspace) return;

          await connectWorkspace(workspace);
          selectWorkspace(task.workspaceId);

          const engine = (task.engineType ?? activeEngine) as "claude" | "codex";
          await setActiveEngine(engine);

          // Apply the model that was selected when the task was created
          if (task.modelId) {
            if (engine === "codex") {
              setSelectedModelId(task.modelId);
            } else {
              setEngineSelectedModelIdByType((prev) => ({
                ...prev,
                [engine]: task.modelId,
              }));
            }
          }

          const threadId = await startThreadForWorkspace(task.workspaceId, { engine });
          if (!threadId) return;
          kanbanUpdateTask(task.id, { threadId });
          setActiveThreadId(threadId, task.workspaceId);

          // Send task description (or title if no description) as first message
          const firstMessage = task.description?.trim() || task.title;
          if (firstMessage) {
            // Small delay to let activeWorkspace state settle after selectWorkspace
            await new Promise((r) => setTimeout(r, 100));
            await sendUserMessageToThread(workspace, threadId, firstMessage, task.images ?? []);
          }
        };
        executeAutoStart().catch((err) => {
          console.error("[kanban] autoStart execute failed:", err);
        });
      }
      return task;
    },
    [
      kanbanCreateTask,
      kanbanUpdateTask,
      workspacesById,
      connectWorkspace,
      selectWorkspace,
      activeEngine,
      setActiveEngine,
      setSelectedModelId,
      setEngineSelectedModelIdByType,
      startThreadForWorkspace,
      setActiveThreadId,
      sendUserMessageToThread,
    ]
  );

  // Sync kanban task threadIds when Claude renames pending → session.
  // Must cover ALL tasks (not just selected) because background tasks get renamed too.
  useEffect(() => {
    const usedNewIds = new Set<string>();
    for (const task of kanbanTasks) {
      if (!task.threadId || !task.threadId.startsWith("claude-pending-")) continue;
      // If the old ID still exists in the thread system, no rename happened yet
      if (threadStatusById[task.threadId] !== undefined) continue;
      // Thread was renamed — find the new ID from threadsByWorkspace
      const threads = threadsByWorkspace[task.workspaceId] ?? [];
      const otherTaskThreadIds = new Set(
        kanbanTasks
          .filter((t) => t.id !== task.id && t.threadId && !t.threadId.startsWith("claude-pending-"))
          .map((t) => t.threadId as string)
      );
      const newThread = threads.find(
        (t) =>
          t.id.startsWith("claude:") &&
          !otherTaskThreadIds.has(t.id) &&
          !usedNewIds.has(t.id)
      );
      if (newThread) {
        usedNewIds.add(newThread.id);
        kanbanUpdateTask(task.id, { threadId: newThread.id });
      }
    }
  }, [kanbanTasks, threadStatusById, threadsByWorkspace, kanbanUpdateTask]);

  useEffect(() => {
    if (appMode !== "kanban") {
      setSelectedKanbanTaskId(null);
    }
  }, [appMode]);

  // Sync activeWorkspaceId when kanban navigates to a workspace
  useEffect(() => {
    if (appMode === "kanban" && "workspaceId" in kanbanViewState) {
      const kanbanWsId = kanbanViewState.workspaceId;
      if (kanbanWsId && kanbanWsId !== activeWorkspaceId) {
        setActiveWorkspaceId(kanbanWsId);
      }
    }
  }, [appMode, kanbanViewState, activeWorkspaceId, setActiveWorkspaceId]);

  // Compute which kanban tasks are currently processing (AI responding)
  const taskProcessingMap = useMemo(() => {
    const map: Record<string, { isProcessing: boolean; startedAt: number | null }> = {};
    for (const task of kanbanTasks) {
      if (task.threadId) {
        const status = threadStatusById[task.threadId];
        map[task.id] = {
          isProcessing: status?.isProcessing ?? false,
          startedAt: status?.processingStartedAt ?? null,
        };
      }
    }
    return map;
  }, [kanbanTasks, threadStatusById]);

  // Track previous processing state to detect transitions
  const prevProcessingMapRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const prev = prevProcessingMapRef.current;
    for (const task of kanbanTasks) {
      const wasProcessing = prev[task.id] ?? false;
      const nowProcessing = taskProcessingMap[task.id]?.isProcessing ?? false;
      if (wasProcessing === nowProcessing) continue;

      // AI finished processing (true → false): auto-move inprogress → testing
      if (wasProcessing && !nowProcessing && task.status === "inprogress") {
        kanbanUpdateTask(task.id, { status: "testing" });
      }
      // User sent follow-up (false → true): auto-move testing → inprogress
      if (!wasProcessing && nowProcessing && task.status === "testing") {
        kanbanUpdateTask(task.id, { status: "inprogress" });
      }
    }
    const boolMap: Record<string, boolean> = {};
    for (const [id, val] of Object.entries(taskProcessingMap)) {
      boolMap[id] = val.isProcessing;
    }
    prevProcessingMapRef.current = boolMap;
  }, [taskProcessingMap, kanbanTasks, kanbanUpdateTask]);

  // Drag to "inprogress" auto-execute: create thread and send first message (without opening conversation panel)
  const handleDragToInProgress = useCallback(
    (task: KanbanTask) => {
      // Auto-execute regardless of existing threadId — reuse thread if present
      const executeTask = async () => {
        const workspace = workspacesById.get(task.workspaceId);
        if (!workspace) return;

        await connectWorkspace(workspace);
        selectWorkspace(task.workspaceId);

        const engine = (task.engineType ?? activeEngine) as "claude" | "codex";
        await setActiveEngine(engine);

        // Apply the model that was selected when the task was created
        if (task.modelId) {
          if (engine === "codex") {
            setSelectedModelId(task.modelId);
          } else {
            setEngineSelectedModelIdByType((prev) => ({
              ...prev,
              [engine]: task.modelId,
            }));
          }
        }

        let threadId = task.threadId;
        if (!threadId) {
          // activate: false — this is background execution, must not switch
          // the global active thread (which would hijack any conversation
          // panel the user is currently viewing).
          threadId = await startThreadForWorkspace(task.workspaceId, {
            engine,
            activate: false,
          });
          if (!threadId) return;
          kanbanUpdateTask(task.id, { threadId });
        }

        const firstMessage = task.description?.trim() || task.title;
        if (firstMessage) {
          await new Promise((r) => setTimeout(r, 100));
          await sendUserMessageToThread(workspace, threadId, firstMessage, task.images ?? []);
        }
      };
      executeTask().catch((err) => {
        console.error("[kanban] drag-to-inprogress auto-execute failed:", err);
      });
    },
    [
      workspacesById,
      connectWorkspace,
      selectWorkspace,
      activeEngine,
      setActiveEngine,
      setSelectedModelId,
      setEngineSelectedModelIdByType,
      startThreadForWorkspace,
      kanbanUpdateTask,
      sendUserMessageToThread,
    ]
  );

  const orderValue = (entry: WorkspaceInfo) =>
    typeof entry.settings.sortOrder === "number"
      ? entry.settings.sortOrder
      : Number.MAX_SAFE_INTEGER;

  const handleMoveWorkspace = async (
    workspaceId: string,
    direction: "up" | "down"
  ) => {
    const target = workspacesById.get(workspaceId);
    if (!target || (target.kind ?? "main") === "worktree") {
      return;
    }
    const targetGroupId = target.settings.groupId ?? null;
    const ordered = workspaces
      .filter(
        (entry) =>
          (entry.kind ?? "main") !== "worktree" &&
          (entry.settings.groupId ?? null) === targetGroupId,
      )
      .slice()
      .sort((a, b) => {
        const orderDiff = orderValue(a) - orderValue(b);
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return a.name.localeCompare(b.name);
      });
    const index = ordered.findIndex((entry) => entry.id === workspaceId);
    if (index === -1) {
      return;
    }
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= ordered.length) {
      return;
    }
    const next = ordered.slice();
    const temp = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = temp;
    await Promise.all(
      next.map((entry, idx) =>
        updateWorkspaceSettings(entry.id, {
          sortOrder: idx
        })
      )
    );
  };

  const showComposer = Boolean(selectedKanbanTaskId) || ((!isCompact
    ? centerMode === "chat" || centerMode === "diff"
    : (isTablet ? tabletTab : activeTab) === "codex") && !showWorkspaceHome);
  const showGitDetail = Boolean(selectedDiffPath) && isPhone;
  const isThreadOpen = Boolean(activeThreadId && showComposer);

  useArchiveShortcut({
    isEnabled: isThreadOpen,
    shortcut: appSettings.archiveThreadShortcut,
    onTrigger: handleArchiveActiveThread,
  });

  const { handleCycleAgent, handleCycleWorkspace } = useWorkspaceCycling({
    workspaces,
    groupedWorkspaces,
    threadsByWorkspace,
    getThreadRows,
    getPinTimestamp,
    activeWorkspaceIdRef,
    activeThreadIdRef,
    exitDiffView,
    resetPullRequestSelection,
    selectWorkspace,
    setActiveThreadId,
  });

  useAppMenuEvents({
    activeWorkspaceRef,
    baseWorkspaceRef,
    onAddWorkspace: () => {
      void handleAddWorkspace();
    },
    onAddAgent: (workspace) => {
      void handleAddAgent(workspace);
    },
    onAddWorktreeAgent: (workspace) => {
      void handleAddWorktreeAgent(workspace);
    },
    onAddCloneAgent: (workspace) => {
      void handleAddCloneAgent(workspace);
    },
    onOpenSettings: () => openSettings(),
    onCycleAgent: handleCycleAgent,
    onCycleWorkspace: handleCycleWorkspace,
    onToggleDebug: handleDebugClick,
    onToggleTerminal: handleToggleTerminal,
    sidebarCollapsed,
    rightPanelCollapsed,
    onExpandSidebar: expandSidebar,
    onCollapseSidebar: collapseSidebar,
    onExpandRightPanel: expandRightPanel,
    onCollapseRightPanel: collapseRightPanel,
  });

  useMenuAcceleratorController({ appSettings, onDebug: addDebugEntry });
  useMenuLocalization();
  const dropOverlayActive = isWorkspaceDropActive;
  const dropOverlayText = "Drop Project Here";
  const appClassName = `app ${isCompact ? "layout-compact" : "layout-desktop"}${
    isPhone ? " layout-phone" : ""
  }${isTablet ? " layout-tablet" : ""}${
    reduceTransparency ? " reduced-transparency" : ""
  }${!isCompact && sidebarCollapsed ? " sidebar-collapsed" : ""}${
    !isCompact && rightPanelCollapsed ? " right-panel-collapsed" : ""
  }${showKanban ? " kanban-active" : ""}`;
  const {
    sidebarNode,
    messagesNode,
    composerNode,
    approvalToastsNode,
    updateToastNode,
    errorToastsNode,
    homeNode,
    mainHeaderNode,
    desktopTopbarLeftNode,
    tabletNavNode,
    tabBarNode,
    gitDiffPanelNode,
    gitDiffViewerNode,
    fileViewPanelNode,
    planPanelNode,
    debugPanelNode,
    debugPanelFullNode,
    terminalDockNode,
    compactEmptyCodexNode,
    compactEmptyGitNode,
    compactGitBackNode,
  } = useLayoutNodes({
    workspaces,
    groupedWorkspaces,
    hasWorkspaceGroups: workspaceGroups.length > 0,
    deletingWorktreeIds,
    threadsByWorkspace,
    threadParentById,
    threadStatusById,
    threadListLoadingByWorkspace,
    threadListPagingByWorkspace,
    threadListCursorByWorkspace,
    activeWorkspaceId,
    activeThreadId,
    activeItems,
    activeRateLimits,
    usageShowRemaining: appSettings.usageShowRemaining,
    accountInfo: activeAccount,
    onSwitchAccount: handleSwitchAccount,
    onCancelSwitchAccount: handleCancelSwitchAccount,
    accountSwitching,
    codeBlockCopyUseModifier: appSettings.composerCodeBlockCopyUseModifier,
    openAppTargets: appSettings.openAppTargets,
    openAppIconById,
    selectedOpenAppId: appSettings.selectedOpenAppId,
    onSelectOpenAppId: handleSelectOpenAppId,
    approvals,
    userInputRequests,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
    onOpenSettings: () => openSettings(),
    onOpenDictationSettings: () => openSettings("dictation"),
    onOpenDebug: handleDebugClick,
    showDebugButton,
    onAddWorkspace: handleAddWorkspace,
    onSelectHome: () => {
      resetPullRequestSelection();
      selectHome();
    },
    onSelectWorkspace: (workspaceId) => {
      exitDiffView();
      resetPullRequestSelection();
      selectWorkspace(workspaceId);
      setActiveThreadId(null, workspaceId);
    },
    onConnectWorkspace: async (workspace) => {
      await connectWorkspace(workspace);
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    onAddAgent: handleAddAgent,
    onAddWorktreeAgent: handleAddWorktreeAgent,
    onAddCloneAgent: handleAddCloneAgent,
    onToggleWorkspaceCollapse: (workspaceId, collapsed) => {
      const target = workspacesById.get(workspaceId);
      if (!target) {
        return;
      }
      void updateWorkspaceSettings(workspaceId, {
        sidebarCollapsed: collapsed,
      });
    },
    onSelectThread: (workspaceId, threadId) => {
      exitDiffView();
      resetPullRequestSelection();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      // Auto-switch engine based on thread's engineSource
      const threads = threadsByWorkspace[workspaceId] ?? [];
      const thread = threads.find((t) => t.id === threadId);
      if (thread?.engineSource) {
        setActiveEngine(thread.engineSource);
      }
    },
    onDeleteThread: (workspaceId, threadId) => {
      removeThread(workspaceId, threadId);
      clearDraftForThread(threadId);
      removeImagesForThread(threadId);
    },
    onSyncThread: (workspaceId, threadId) => {
      void refreshThread(workspaceId, threadId);
    },
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    pinnedThreadsVersion,
    isThreadAutoNaming,
    onRenameThread: (workspaceId, threadId) => {
      handleRenameThread(workspaceId, threadId);
    },
    onAutoNameThread: (workspaceId, threadId) => {
      addDebugEntry({
        id: `${Date.now()}-thread-title-manual-trigger`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/title manual trigger",
        payload: { workspaceId, threadId },
      });
      void triggerAutoThreadTitle(workspaceId, threadId, { force: true }).then(
        (title) => {
          if (!title) {
            addDebugEntry({
              id: `${Date.now()}-thread-title-manual-empty`,
              timestamp: Date.now(),
              source: "client",
              label: "thread/title manual skipped",
              payload: { workspaceId, threadId },
            });
            return;
          }
          addDebugEntry({
            id: `${Date.now()}-thread-title-manual-success`,
            timestamp: Date.now(),
            source: "server",
            label: "thread/title manual generated",
            payload: { workspaceId, threadId, title },
          });
        },
      ).catch((error) => {
        addDebugEntry({
          id: `${Date.now()}-thread-title-manual-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/title manual error",
          payload: error instanceof Error ? error.message : String(error),
        });
      });
    },
    onDeleteWorkspace: (workspaceId) => {
      void removeWorkspace(workspaceId);
    },
    onDeleteWorktree: (workspaceId) => {
      void removeWorktree(workspaceId);
    },
    onLoadOlderThreads: (workspaceId) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) {
        return;
      }
      void loadOlderThreadsForWorkspace(workspace);
    },
    onReloadWorkspaceThreads: (workspaceId) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) {
        return;
      }
      void listThreadsForWorkspace(workspace);
    },
    updaterState,
    onUpdate: startUpdate,
    onDismissUpdate: dismissUpdate,
    errorToasts,
    onDismissErrorToast: dismissErrorToast,
    latestAgentRuns,
    isLoadingLatestAgents,
    onSelectHomeThread: (workspaceId, threadId) => {
      exitDiffView();
      selectWorkspace(workspaceId);
      setActiveThreadId(threadId, workspaceId);
      // Auto-switch engine based on thread's engineSource
      const threads = threadsByWorkspace[workspaceId] ?? [];
      const thread = threads.find((t) => t.id === threadId);
      if (thread?.engineSource) {
        setActiveEngine(thread.engineSource);
      }
      if (isCompact) {
        setActiveTab("codex");
      }
    },
    activeWorkspace,
    activeParentWorkspace,
    worktreeLabel,
    worktreeRename: worktreeRename ?? undefined,
    isWorktreeWorkspace,
    branchName: gitStatus.branchName || "unknown",
    branches,
    onCheckoutBranch: handleCheckoutBranch,
    onCreateBranch: handleCreateBranch,
    onCopyThread: handleCopyThread,
    onToggleTerminal: handleToggleTerminal,
    showTerminalButton: !isCompact,
    launchScript: launchScriptState.launchScript,
    launchScriptEditorOpen: launchScriptState.editorOpen,
    launchScriptDraft: launchScriptState.draftScript,
    launchScriptSaving: launchScriptState.isSaving,
    launchScriptError: launchScriptState.error,
    onRunLaunchScript: launchScriptState.onRunLaunchScript,
    onOpenLaunchScriptEditor: launchScriptState.onOpenEditor,
    onCloseLaunchScriptEditor: launchScriptState.onCloseEditor,
    onLaunchScriptDraftChange: launchScriptState.onDraftScriptChange,
    onSaveLaunchScript: launchScriptState.onSaveLaunchScript,
    launchScriptsState,
    mainHeaderActionsNode: (
      <MainHeaderActions
        centerMode={centerMode}
        gitDiffViewStyle={gitDiffViewStyle}
        onSelectDiffViewStyle={setGitDiffViewStyle}
        isCompact={isCompact}
        rightPanelCollapsed={rightPanelCollapsed}
        sidebarToggleProps={sidebarToggleProps}
      />
    ),
    filePanelMode,
    onFilePanelModeChange: setFilePanelMode,
    fileTreeLoading: isFilesLoading,
    onRefreshFiles: refreshFiles,
    centerMode,
    editorFilePath,
    onOpenFile: handleOpenFile,
    onExitEditor: handleExitEditor,
    onExitDiff: () => {
      setCenterMode("chat");
      setSelectedDiffPath(null);
    },
    activeTab,
    onSelectTab: setActiveTab,
    tabletNavTab: tabletTab,
    gitPanelMode,
    onGitPanelModeChange: handleGitPanelModeChange,
    gitDiffViewStyle,
    worktreeApplyLabel: t("git.applyWorktreeChangesAction"),
    worktreeApplyTitle: activeParentWorkspace?.name
      ? t("git.applyWorktreeChanges") + ` ${activeParentWorkspace.name}`
      : t("git.applyWorktreeChanges"),
    worktreeApplyLoading: isWorktreeWorkspace ? worktreeApplyLoading : false,
    worktreeApplyError: isWorktreeWorkspace ? worktreeApplyError : null,
    worktreeApplySuccess: isWorktreeWorkspace ? worktreeApplySuccess : false,
    onApplyWorktreeChanges: isWorktreeWorkspace
      ? handleApplyWorktreeChanges
      : undefined,
    gitStatus,
    fileStatus,
    selectedDiffPath,
    diffScrollRequestId,
    onSelectDiff: handleSelectDiff,
    gitLogEntries,
    gitLogTotal,
    gitLogAhead,
    gitLogBehind,
    gitLogAheadEntries,
    gitLogBehindEntries,
    gitLogUpstream,
    gitLogError,
    gitLogLoading,
    selectedCommitSha,
    gitIssues,
    gitIssuesTotal,
    gitIssuesLoading,
    gitIssuesError,
    gitPullRequests,
    gitPullRequestsTotal,
    gitPullRequestsLoading,
    gitPullRequestsError,
    selectedPullRequestNumber: selectedPullRequest?.number ?? null,
    selectedPullRequest: diffSource === "pr" ? selectedPullRequest : null,
    selectedPullRequestComments: diffSource === "pr" ? gitPullRequestComments : [],
    selectedPullRequestCommentsLoading: gitPullRequestCommentsLoading,
    selectedPullRequestCommentsError: gitPullRequestCommentsError,
    onSelectPullRequest: (pullRequest) => {
      setSelectedCommitSha(null);
      handleSelectPullRequest(pullRequest);
    },
    onSelectCommit: (entry) => {
      handleSelectCommit(entry.sha);
    },
    gitRemoteUrl,
    gitRoot: activeGitRoot,
    gitRootCandidates,
    gitRootScanDepth,
    gitRootScanLoading,
    gitRootScanError,
    gitRootScanHasScanned,
    onGitRootScanDepthChange: setGitRootScanDepth,
    onScanGitRoots: scanGitRoots,
    onSelectGitRoot: (path) => {
      void handleSetGitRoot(path);
    },
    onClearGitRoot: () => {
      void handleSetGitRoot(null);
    },
    onPickGitRoot: handlePickGitRoot,
    onStageGitAll: handleStageGitAll,
    onStageGitFile: handleStageGitFile,
    onUnstageGitFile: handleUnstageGitFile,
    onRevertGitFile: handleRevertGitFile,
    onRevertAllGitChanges: handleRevertAllGitChanges,
    gitDiffs: activeDiffs,
    gitDiffLoading: activeDiffLoading,
    gitDiffError: activeDiffError,
    onDiffActivePathChange: handleActiveDiffPath,
    commitMessage,
    commitMessageLoading,
    commitMessageError,
    onCommitMessageChange: handleCommitMessageChange,
    onGenerateCommitMessage: handleGenerateCommitMessage,
    onCommit: handleCommit,
    onCommitAndPush: handleCommitAndPush,
    onCommitAndSync: handleCommitAndSync,
    onPush: handlePush,
    onSync: handleSync,
    commitLoading,
    pushLoading,
    syncLoading,
    commitError,
    pushError,
    syncError,
    commitsAhead: gitLogAhead,
    onSendPrompt: handleSendPrompt,
    onSendPromptToNewAgent: handleSendPromptToNewAgent,
    onCreatePrompt: handleCreatePrompt,
    onUpdatePrompt: handleUpdatePrompt,
    onDeletePrompt: handleDeletePrompt,
    onMovePrompt: handleMovePrompt,
    onRevealWorkspacePrompts: handleRevealWorkspacePrompts,
    onRevealGeneralPrompts: handleRevealGeneralPrompts,
    canRevealGeneralPrompts: Boolean(activeWorkspace),
    onSend: handleComposerSendWithKanban,
    onQueue: handleComposerQueue,
    onStop: interruptTurn,
    canStop: canInterrupt,
    isReviewing,
    isProcessing,
    steerEnabled: appSettings.experimentalSteerEnabled,
    reviewPrompt,
    onReviewPromptClose: closeReviewPrompt,
    onReviewPromptShowPreset: showPresetStep,
    onReviewPromptChoosePreset: choosePreset,
    highlightedPresetIndex,
    onReviewPromptHighlightPreset: setHighlightedPresetIndex,
    highlightedBranchIndex,
    onReviewPromptHighlightBranch: setHighlightedBranchIndex,
    highlightedCommitIndex,
    onReviewPromptHighlightCommit: setHighlightedCommitIndex,
    onReviewPromptKeyDown: handleReviewPromptKeyDown,
    onReviewPromptSelectBranch: selectBranch,
    onReviewPromptSelectBranchAtIndex: selectBranchAtIndex,
    onReviewPromptConfirmBranch: confirmBranch,
    onReviewPromptSelectCommit: selectCommit,
    onReviewPromptSelectCommitAtIndex: selectCommitAtIndex,
    onReviewPromptConfirmCommit: confirmCommit,
    onReviewPromptUpdateCustomInstructions: updateCustomInstructions,
    onReviewPromptConfirmCustom: confirmCustom,
    activeTokenUsage,
    activeQueue,
    draftText: activeDraft,
    onDraftChange: handleDraftChange,
    activeImages,
    onPickImages: pickImages,
    onAttachImages: attachImages,
    onRemoveImage: removeImage,
    prefillDraft,
    onPrefillHandled: (id) => {
      if (prefillDraft?.id === id) {
        setPrefillDraft(null);
      }
    },
    insertText: composerInsert,
    onInsertHandled: (id) => {
      if (composerInsert?.id === id) {
        setComposerInsert(null);
      }
    },
    onEditQueued: handleEditQueued,
    onDeleteQueued: handleDeleteQueued,
    collaborationModes,
    selectedCollaborationModeId,
    onSelectCollaborationMode: setSelectedCollaborationModeId,
    engines: installedEngines,
    selectedEngine: activeEngine,
    onSelectEngine: setActiveEngine,
    models: effectiveModels,
    selectedModelId: effectiveSelectedModelId,
    onSelectModel: handleSelectModel,
    reasoningOptions,
    selectedEffort,
    onSelectEffort: setSelectedEffort,
    reasoningSupported: effectiveReasoningSupported,
    accessMode,
    onSelectAccessMode: setAccessMode,
    skills,
    prompts,
    commands,
    files,
    directories,
    gitignoredFiles,
    onInsertComposerText: handleInsertComposerText,
    textareaRef: composerInputRef,
    composerEditorSettings,
    textareaHeight,
    onTextareaHeightChange,
    dictationEnabled: appSettings.dictationEnabled && dictationReady,
    dictationState,
    dictationLevel,
    onToggleDictation: handleToggleDictation,
    dictationTranscript,
    onDictationTranscriptHandled: (id) => {
      clearDictationTranscript(id);
    },
    dictationError,
    onDismissDictationError: clearDictationError,
    dictationHint,
    onDismissDictationHint: clearDictationHint,
    composerSendLabel,
    composerLinkedKanbanPanels,
    selectedComposerKanbanPanelId,
    composerKanbanContextMode,
    onSelectComposerKanbanPanel: setSelectedComposerKanbanPanelId,
    onComposerKanbanContextModeChange: setComposerKanbanContextMode,
    onOpenComposerKanbanPanel: handleOpenComposerKanbanPanel,
    showComposer,
    plan: activePlan,
    debugEntries,
    debugOpen,
    terminalOpen,
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    onClearDebug: clearDebugEntries,
    onCopyDebug: handleCopyDebug,
    onResizeDebug: onDebugPanelResizeStart,
    onResizeTerminal: onTerminalPanelResizeStart,
    onBackFromDiff: () => {
      setSelectedDiffPath(null);
      setCenterMode("chat");
    },
    onGoProjects: () => setActiveTab("projects"),
    workspaceDropTargetRef,
    isWorkspaceDropActive: dropOverlayActive,
    workspaceDropText: dropOverlayText,
    onWorkspaceDragOver: handleWorkspaceDragOver,
    onWorkspaceDragEnter: handleWorkspaceDragEnter,
    onWorkspaceDragLeave: handleWorkspaceDragLeave,
    onWorkspaceDrop: handleWorkspaceDrop,
    appMode,
    onAppModeChange: setAppMode,
    onOpenMemory: () => setCenterMode("memory"),
  });

  const workspaceHomeNode = activeWorkspace ? (
    <WorkspaceHome
      workspace={activeWorkspace}
      currentBranch={gitStatus.branchName || null}
      recentThreads={recentThreads}
      onSelectConversation={handleSelectWorkspaceInstance}
      onStartConversation={handleStartWorkspaceConversation}
      onContinueLatestConversation={handleContinueLatestConversation}
      onStartGuidedConversation={handleStartGuidedConversation}
      onRevealWorkspace={handleRevealActiveWorkspace}
    />
  ) : null;

  const mainMessagesNode = showWorkspaceHome ? workspaceHomeNode : messagesNode;

  const kanbanConversationNode = selectedKanbanTaskId ? (
    <div className="kanban-conversation-content">
      {messagesNode}
      {composerNode}
    </div>
  ) : null;

  const desktopTopbarLeftNodeWithToggle = !isCompact ? (
    <div className="topbar-leading">
      <SidebarCollapseButton {...sidebarToggleProps} />
      {desktopTopbarLeftNode}
    </div>
  ) : (
    desktopTopbarLeftNode
  );

  return (
    <div
      className={appClassName}
      style={
        {
          "--sidebar-width": `${
            isCompact ? sidebarWidth : sidebarCollapsed ? 0 : sidebarWidth
          }px`,
          "--right-panel-width": `${
            isCompact ? rightPanelWidth : rightPanelCollapsed ? 0 : rightPanelWidth
          }px`,
          "--plan-panel-height": `${planPanelHeight}px`,
          "--terminal-panel-height": `${terminalPanelHeight}px`,
          "--debug-panel-height": `${debugPanelHeight}px`,
          "--ui-font-family": appSettings.uiFontFamily,
          "--code-font-family": appSettings.codeFontFamily,
          "--code-font-size": `${appSettings.codeFontSize}px`
        } as React.CSSProperties
      }
    >
      <div className="drag-strip" id="titlebar" data-tauri-drag-region />
      <TitlebarExpandControls {...sidebarToggleProps} />
      {shouldLoadGitHubPanelData ? (
        <Suspense fallback={null}>
          <GitHubPanelData
            activeWorkspace={activeWorkspace}
            gitPanelMode={gitPanelMode}
            shouldLoadDiffs={shouldLoadDiffs}
            diffSource={diffSource}
            selectedPullRequestNumber={selectedPullRequest?.number ?? null}
            onIssuesChange={handleGitIssuesChange}
            onPullRequestsChange={handleGitPullRequestsChange}
            onPullRequestDiffsChange={handleGitPullRequestDiffsChange}
            onPullRequestCommentsChange={handleGitPullRequestCommentsChange}
          />
        </Suspense>
      ) : null}
      <AppLayout
        isPhone={isPhone}
        isTablet={isTablet}
        showHome={showHome}
        showKanban={showKanban}
        kanbanNode={
          showKanban ? (
            <KanbanView
              viewState={kanbanViewState}
              onViewStateChange={setKanbanViewState}
              workspaces={workspaces}
              panels={kanbanPanels}
              tasks={kanbanTasks}
              onCreateTask={handleKanbanCreateTask}
              onUpdateTask={kanbanUpdateTask}
              onDeleteTask={kanbanDeleteTask}
              onReorderTask={kanbanReorderTask}
              onCreatePanel={kanbanCreatePanel}
              onUpdatePanel={kanbanUpdatePanel}
              onDeletePanel={kanbanDeletePanel}
              onAddWorkspace={handleAddWorkspace}
              onAppModeChange={setAppMode}
              engineStatuses={engineStatuses}
              conversationNode={kanbanConversationNode}
              selectedTaskId={selectedKanbanTaskId}
              taskProcessingMap={taskProcessingMap}
              onOpenTaskConversation={handleOpenTaskConversation}
              onCloseTaskConversation={handleCloseTaskConversation}
              onDragToInProgress={handleDragToInProgress}
              kanbanConversationWidth={kanbanConversationWidth}
              onKanbanConversationResizeStart={onKanbanConversationResizeStart}
              gitPanelNode={gitDiffPanelNode}
            />
          ) : null
        }
        showGitDetail={showGitDetail}
        activeTab={activeTab}
        tabletTab={tabletTab}
        centerMode={centerMode}
        hasActivePlan={hasActivePlan}
        activeWorkspace={Boolean(activeWorkspace)}
        sidebarNode={sidebarNode}
        messagesNode={mainMessagesNode}
        composerNode={composerNode}
        approvalToastsNode={approvalToastsNode}
        updateToastNode={updateToastNode}
        errorToastsNode={errorToastsNode}
        homeNode={homeNode}
        mainHeaderNode={mainHeaderNode}
        desktopTopbarLeftNode={desktopTopbarLeftNodeWithToggle}
        tabletNavNode={tabletNavNode}
        tabBarNode={tabBarNode}
        gitDiffPanelNode={gitDiffPanelNode}
        gitDiffViewerNode={gitDiffViewerNode}
        fileViewPanelNode={fileViewPanelNode}
        planPanelNode={planPanelNode}
        debugPanelNode={debugPanelNode}
        debugPanelFullNode={debugPanelFullNode}
        terminalDockNode={terminalDockNode}
        compactEmptyCodexNode={compactEmptyCodexNode}
        compactEmptyGitNode={compactEmptyGitNode}
        compactGitBackNode={compactGitBackNode}
        onSidebarResizeStart={onSidebarResizeStart}
        onRightPanelResizeStart={onRightPanelResizeStart}
        onPlanPanelResizeStart={onPlanPanelResizeStart}
      />
      <AppModals
        renamePrompt={renamePrompt}
        onRenamePromptChange={handleRenamePromptChange}
        onRenamePromptCancel={handleRenamePromptCancel}
        onRenamePromptConfirm={handleRenamePromptConfirm}
        worktreePrompt={worktreePrompt}
        onWorktreePromptChange={updateWorktreeBranch}
        onWorktreeSetupScriptChange={updateWorktreeSetupScript}
        onWorktreePromptCancel={cancelWorktreePrompt}
        onWorktreePromptConfirm={confirmWorktreePrompt}
        clonePrompt={clonePrompt}
        onClonePromptCopyNameChange={updateCloneCopyName}
        onClonePromptChooseCopiesFolder={chooseCloneCopiesFolder}
        onClonePromptUseSuggestedFolder={useSuggestedCloneCopiesFolder}
        onClonePromptClearCopiesFolder={clearCloneCopiesFolder}
        onClonePromptCancel={cancelClonePrompt}
        onClonePromptConfirm={confirmClonePrompt}
        settingsOpen={settingsOpen}
        settingsSection={settingsSection ?? undefined}
        onCloseSettings={closeSettings}
        SettingsViewComponent={SettingsView}
        settingsProps={{
          workspaceGroups,
          groupedWorkspaces,
          ungroupedLabel,
          onMoveWorkspace: handleMoveWorkspace,
          onDeleteWorkspace: (workspaceId) => {
            void removeWorkspace(workspaceId);
          },
          onCreateWorkspaceGroup: createWorkspaceGroup,
          onRenameWorkspaceGroup: renameWorkspaceGroup,
          onMoveWorkspaceGroup: moveWorkspaceGroup,
          onDeleteWorkspaceGroup: deleteWorkspaceGroup,
          onAssignWorkspaceGroup: assignWorkspaceGroup,
          reduceTransparency,
          onToggleTransparency: setReduceTransparency,
          appSettings,
          openAppIconById,
          onUpdateAppSettings: async (next) => {
            await queueSaveSettings(next);
          },
          onRunDoctor: doctor,
          onUpdateWorkspaceCodexBin: async (id, codexBin) => {
            await updateWorkspaceCodexBin(id, codexBin);
          },
          onUpdateWorkspaceSettings: async (id, settings) => {
            await updateWorkspaceSettings(id, settings);
          },
          scaleShortcutTitle,
          scaleShortcutText,
          onTestNotificationSound: handleTestNotificationSound,
          dictationModelStatus: dictationModel.status,
          onDownloadDictationModel: dictationModel.download,
          onCancelDictationDownload: dictationModel.cancel,
          onRemoveDictationModel: dictationModel.remove,
        }}
      />
    </div>
  );
}

function App() {
  const windowLabel = useWindowLabel();
  if (windowLabel === "about") {
    return (
      <Suspense fallback={null}>
        <AboutView />
      </Suspense>
    );
  }
  return <MainApp />;
}

export default App;
