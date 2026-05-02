// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelOption, WorkspaceInfo } from "./types";
import { getThreadComposerSelectionStorageKey } from "./app-shell-parts/selectedComposerSession";
import { AppShell } from "./app-shell";

const startupState = vi.hoisted(() => {
  const workspace: WorkspaceInfo = {
    id: "workspace-1",
    name: "ccgui",
    path: "/tmp/ccgui",
    connected: true,
    settings: {
      sidebarCollapsed: false,
      gitRoot: null,
    },
  };

  const codexModels: ModelOption[] = [
    {
      id: "gpt-5.5",
      model: "gpt-5.5",
      displayName: "GPT-5.5",
      description: "",
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Medium" },
      ],
      defaultReasoningEffort: "medium",
      isDefault: true,
    },
    {
      id: "codex-alt",
      model: "codex-alt",
      displayName: "Codex Alt",
      description: "",
      supportedReasoningEfforts: [
        { reasoningEffort: "medium", description: "Medium" },
        { reasoningEffort: "high", description: "High" },
      ],
      defaultReasoningEffort: "medium",
      isDefault: false,
    },
  ];

  return {
    workspace,
    codexModels,
    activeEngine: "codex" as const,
    activeThreadId: "codex:thread-1" as string | null,
    canonicalThreadId: null as string | null,
    configModel: "gpt-5.5",
    appSettingsLoading: false,
    appSettings: {
      lastComposerModelId: "gpt-5.5",
      lastComposerReasoningEffort: "medium",
      notificationSoundsEnabled: false,
      notificationSoundId: "default",
      notificationSoundCustomPath: null,
      toggleDebugPanelShortcut: "Mod+Shift+D",
      toggleTerminalShortcut: "Mod+Shift+T",
      preloadGitDiffs: false,
      experimentalSteerEnabled: false,
      composerModelShortcut: "Mod+Shift+M",
      composerAccessShortcut: "Mod+Shift+A",
      composerReasoningShortcut: "Mod+Shift+R",
      composerCollaborationShortcut: "Mod+Shift+C",
      composerEditorPreset: "default",
      composerFenceExpandOnSpace: false,
      composerFenceExpandOnEnter: false,
      composerFenceLanguageTags: [],
      composerFenceWrapSelection: false,
      composerFenceAutoWrapPasteMultiline: false,
      composerFenceAutoWrapPasteCodeLike: false,
      composerListContinuation: false,
      chatCanvasUseNormalizedRealtime: false,
      chatCanvasUseUnifiedHistoryLoader: false,
      runtimeRestoreThreadsOnlyOnLaunch: true,
      newAgentShortcut: "Mod+N",
      workspaceGroups: [],
      selectedOpenAppId: null,
    },
    renderCtx: null as Record<string, unknown> | null,
    selectedComposerSelection: null as { modelId: string | null; effort: string | null } | null,
    clientStore: {
      app: {} as Record<string, unknown>,
      composer: {} as Record<string, unknown>,
      threads: {} as Record<string, unknown>,
      layout: {} as Record<string, unknown>,
      leida: {} as Record<string, unknown>,
    },
    setAppSettings: vi.fn(),
    queueSaveSettings: vi.fn(async (next) => next),
  };
});

function createNoopFunction() {
  return vi.fn();
}

function createAppSettings() {
  return {
    ...startupState.appSettings,
  };
}

function createThreadStatus(threadId: string | null) {
  if (!threadId) {
    return {};
  }
  return {
    [threadId]: {
      isProcessing: false,
      isReviewing: false,
      continuationPulse: 0,
      terminalPulse: 0,
    },
  };
}

function normalizeThreadComposerSelection(
  value: unknown,
): { modelId: string | null; effort: string | null } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const modelId =
    typeof record.modelId === "string" && record.modelId.trim().length > 0
      ? record.modelId.trim()
      : null;
  const effort =
    typeof record.effort === "string" && record.effort.trim().length > 0
      ? record.effort.trim()
      : null;
  if (!modelId && !effort) {
    return null;
  }
  return { modelId, effort };
}

function resolveStartupThreadComposerSelection(
  workspaceId: string | null,
  threadId: string | null,
  resolveCanonicalThreadId: (threadId: string) => string,
) {
  if (!threadId) {
    return null;
  }
  const directKey = getThreadComposerSelectionStorageKey(workspaceId, threadId);
  const directSelection = normalizeThreadComposerSelection(
    startupState.clientStore.composer[directKey],
  );
  if (directSelection) {
    return directSelection;
  }
  const canonicalThreadId = resolveCanonicalThreadId(threadId);
  const prefix = `selectedModelByThread.${workspaceId ?? "__workspace__unknown__"}:`;
  for (const [key, rawValue] of Object.entries(startupState.clientStore.composer)) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const candidateThreadId = key.slice(prefix.length);
    if (resolveCanonicalThreadId(candidateThreadId) !== canonicalThreadId) {
      continue;
    }
    const migratedSelection = normalizeThreadComposerSelection(rawValue);
    if (!migratedSelection) {
      continue;
    }
    startupState.clientStore.composer[directKey] = migratedSelection;
    return migratedSelection;
  }
  return null;
}

vi.mock("./services/clientStorage", () => ({
  getClientStoreSync: vi.fn((store: keyof typeof startupState.clientStore, key: string) => {
    return startupState.clientStore[store]?.[key];
  }),
  writeClientStoreValue: vi.fn(
    (store: keyof typeof startupState.clientStore, key: string, value: unknown) => {
      startupState.clientStore[store][key] = value;
    },
  ),
}));

vi.mock("./app-shell-parts/useSelectedComposerSession", () => ({
  useSelectedComposerSession: ({
    activeThreadId,
    activeWorkspaceId,
    resolveCanonicalThreadId,
  }: {
    activeThreadId: string | null;
    activeWorkspaceId: string | null;
    resolveCanonicalThreadId: (threadId: string) => string;
  }) => {
    const persistComposerSelectionForThread = (
      workspaceId: string | null,
      threadId: string | null,
      selection: unknown,
    ) => {
      if (!threadId) {
        return;
      }
      const sessionKey = getThreadComposerSelectionStorageKey(workspaceId, threadId);
      startupState.clientStore.composer[sessionKey] =
        normalizeThreadComposerSelection(selection);
    };
    const resolveComposerSelectionForThread = (
      workspaceId: string | null,
      threadId: string | null,
    ) =>
      resolveStartupThreadComposerSelection(
        workspaceId,
        threadId,
        resolveCanonicalThreadId,
      );
    const selectedComposerSelection = resolveComposerSelectionForThread(
      activeWorkspaceId,
      activeThreadId,
    );
    startupState.selectedComposerSelection = selectedComposerSelection;
    return {
      selectedComposerSelection,
      selectedComposerSelectionRef: { current: selectedComposerSelection },
      handleSelectComposerSelection: (selection: unknown) => {
        persistComposerSelectionForThread(activeWorkspaceId, activeThreadId, selection);
      },
      persistComposerSelectionForThread,
      reloadSelectedComposerSelection: vi.fn(),
      resolveComposerSelectionForThread,
    };
  },
}));

vi.mock("./services/tauri", () => ({
  getModelList: vi.fn(async () => ({
    result: {
      data: startupState.codexModels,
    },
  })),
  getConfigModel: vi.fn(async () => startupState.configModel),
  pickWorkspacePath: vi.fn(async () => null),
  ensureWorkspacePathDir: vi.fn(async () => null),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTitle: vi.fn(async () => undefined),
  }),
}));

vi.mock("@tauri-apps/api/path", () => ({
  homeDir: vi.fn(async () => "/tmp"),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(async () => false),
}));

vi.mock("./utils/platform", () => ({
  isMacPlatform: vi.fn(() => false),
  isWindowsPlatform: vi.fn(() => false),
}));

vi.mock("./features/models/refreshCodexModelConfig", () => ({
  refreshCodexModelConfig: vi.fn(async ({ refreshModels }) => {
    await refreshModels();
  }),
}));

vi.mock("./services/systemNotification", () => ({
  setNotificationActionHandler: vi.fn(),
}));

vi.mock("./services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

vi.mock("./features/vendors/modelManagerRequest", () => ({
  requestVendorModelManager: vi.fn(),
}));

vi.mock("./features/composer/components/ChatInputBox/providers", () => ({
  forceRefreshAgents: vi.fn(),
}));

vi.mock("./features/app/hooks/useAppSettingsController", () => ({
  useAppSettingsController: () => ({
    appSettings: createAppSettings(),
    setAppSettings: startupState.setAppSettings,
    doctor: null,
    claudeDoctor: null,
    appSettingsLoading: startupState.appSettingsLoading,
    reduceTransparency: false,
    setReduceTransparency: createNoopFunction(),
    scaleShortcutTitle: "",
    scaleShortcutText: "",
    queueSaveSettings: startupState.queueSaveSettings,
  }),
}));

vi.mock("./features/app/hooks/useDictationController", () => ({
  useDictationController: () => ({
    dictationModel: null,
    dictationState: "idle",
    dictationLevel: null,
    dictationTranscript: "",
    dictationError: null,
    dictationHint: null,
    dictationReady: false,
    handleToggleDictation: createNoopFunction(),
    clearDictationTranscript: createNoopFunction(),
    clearDictationError: createNoopFunction(),
    clearDictationHint: createNoopFunction(),
  }),
}));

vi.mock("./features/debug/hooks/useDebugLog", () => ({
  useDebugLog: () => ({
    debugOpen: false,
    setDebugOpen: createNoopFunction(),
    debugEntries: [],
    showDebugButton: false,
    addDebugEntry: createNoopFunction(),
    handleCopyDebug: createNoopFunction(),
    clearDebugEntries: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useLayoutController", () => ({
  useLayoutController: () => ({
    sidebarWidth: 280,
    rightPanelWidth: 360,
    setRightPanelWidth: createNoopFunction(),
    onSidebarResizeStart: createNoopFunction(),
    onRightPanelResizeStart: createNoopFunction(),
    planPanelHeight: 260,
    onPlanPanelResizeStart: createNoopFunction(),
    terminalPanelHeight: 260,
    onTerminalPanelResizeStart: createNoopFunction(),
    debugPanelHeight: 260,
    onDebugPanelResizeStart: createNoopFunction(),
    kanbanConversationWidth: 360,
    onKanbanConversationResizeStart: createNoopFunction(),
    isCompact: false,
    isTablet: false,
    isPhone: false,
    sidebarCollapsed: false,
    rightPanelCollapsed: false,
    collapseSidebar: createNoopFunction(),
    expandSidebar: createNoopFunction(),
    collapseRightPanel: createNoopFunction(),
    expandRightPanel: createNoopFunction(),
    terminalOpen: false,
    handleDebugClick: createNoopFunction(),
    handleToggleTerminal: createNoopFunction(),
    openTerminal: createNoopFunction(),
    closeTerminal: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useGitHistoryPanelResize", () => ({
  useGitHistoryPanelResize: () => ({
    gitHistoryPanelHeight: 320,
    gitHistoryPanelHeightRef: { current: 320 },
    onGitHistoryPanelResizeStart: createNoopFunction(),
    setGitHistoryPanelHeight: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useSettingsModalState", () => ({
  useSettingsModalState: () => ({
    settingsOpen: false,
    settingsSection: null,
    settingsHighlightTarget: null,
    openSettings: createNoopFunction(),
    closeSettings: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useLoadingProgressDialogState", () => ({
  useLoadingProgressDialogState: () => ({
    loadingProgressDialog: null,
    showLoadingProgressDialog: createNoopFunction(),
    hideLoadingProgressDialog: createNoopFunction(),
    dismissLoadingProgressDialog: createNoopFunction(),
  }),
}));

vi.mock("./app-shell-parts/useCreateSessionLoading", () => ({
  useCreateSessionLoading: () => vi.fn(async (run: () => Promise<unknown>) => run()),
}));

vi.mock("./features/app/hooks/useUpdaterController", () => ({
  useUpdaterController: () => ({
    updaterState: null,
    startUpdate: createNoopFunction(),
    dismissUpdate: createNoopFunction(),
    handleTestNotificationSound: createNoopFunction(),
  }),
}));

vi.mock("./features/update/hooks/useReleaseNotes", () => ({
  useReleaseNotes: () => ({
    isOpen: false,
    entries: [],
    activeIndex: 0,
    loading: false,
    error: null,
    openReleaseNotes: createNoopFunction(),
    closeReleaseNotes: createNoopFunction(),
    goToPrevious: createNoopFunction(),
    goToNext: createNoopFunction(),
    retryLoad: createNoopFunction(),
  }),
}));

vi.mock("./features/notifications/hooks/useErrorToasts", () => ({
  useErrorToasts: () => ({
    errorToasts: [],
    dismissErrorToast: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useGitHubPanelController", () => ({
  useGitHubPanelController: () => ({
    gitIssues: [],
    gitIssuesTotal: 0,
    gitIssuesLoading: false,
    gitIssuesError: null,
    gitPullRequests: [],
    gitPullRequestsTotal: 0,
    gitPullRequestsLoading: false,
    gitPullRequestsError: null,
    gitPullRequestDiffs: [],
    gitPullRequestDiffsLoading: false,
    gitPullRequestDiffsError: null,
    gitPullRequestComments: [],
    gitPullRequestCommentsLoading: false,
    gitPullRequestCommentsError: null,
    handleGitIssuesChange: createNoopFunction(),
    handleGitPullRequestsChange: createNoopFunction(),
    handleGitPullRequestDiffsChange: createNoopFunction(),
    handleGitPullRequestCommentsChange: createNoopFunction(),
    resetGitHubPanelState: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useGitPanelController", () => ({
  useGitPanelController: () => ({
    centerMode: "chat",
    setCenterMode: createNoopFunction(),
    selectedDiffPath: null,
    setSelectedDiffPath: createNoopFunction(),
    diffScrollRequestId: 0,
    gitPanelMode: "status",
    setGitPanelMode: createNoopFunction(),
    gitDiffViewStyle: "split",
    setGitDiffViewStyle: createNoopFunction(),
    gitDiffListView: "list",
    setGitDiffListView: createNoopFunction(),
    filePanelMode: "files",
    setFilePanelMode: createNoopFunction(),
    selectedPullRequest: null,
    setSelectedPullRequest: createNoopFunction(),
    selectedCommitSha: null,
    setSelectedCommitSha: createNoopFunction(),
    diffSource: "local",
    setDiffSource: createNoopFunction(),
    gitStatus: {
      error: null,
      files: [],
      branchName: null,
    },
    refreshGitStatus: createNoopFunction(),
    queueGitStatusRefresh: createNoopFunction(),
    refreshGitDiffs: createNoopFunction(),
    gitLogEntries: [],
    gitLogTotal: 0,
    gitLogAhead: 0,
    gitLogBehind: 0,
    gitLogAheadEntries: [],
    gitLogBehindEntries: [],
    gitLogUpstream: null,
    gitLogLoading: false,
    gitLogError: null,
    refreshGitLog: createNoopFunction(),
    gitCommitDiffs: [],
    shouldLoadDiffs: false,
    activeDiffs: [],
    activeDiffLoading: false,
    activeDiffError: null,
    handleSelectDiff: createNoopFunction(),
    handleSelectCommit: createNoopFunction(),
    handleActiveDiffPath: createNoopFunction(),
    handleGitPanelModeChange: createNoopFunction(),
    activeEditorFilePath: null,
    editorNavigationTarget: null,
    editorHighlightTarget: null,
    openFileTabs: [],
    handleOpenFile: createNoopFunction(),
    handleActivateFileTab: createNoopFunction(),
    handleCloseFileTab: createNoopFunction(),
    handleCloseAllFileTabs: createNoopFunction(),
    handleExitEditor: createNoopFunction(),
    activeWorkspaceIdRef: { current: startupState.workspace.id },
    activeWorkspaceRef: { current: startupState.workspace },
  }),
}));

vi.mock("./features/app/hooks/useWorkspaceController", () => ({
  useWorkspaceController: () => ({
    workspaces: [startupState.workspace],
    workspaceGroups: [],
    groupedWorkspaces: [],
    getWorkspaceGroupName: () => null,
    ungroupedLabel: "Ungrouped",
    activeWorkspace: startupState.workspace,
    activeWorkspaceId: startupState.workspace.id,
    setActiveWorkspaceId: createNoopFunction(),
    addWorkspace: createNoopFunction(),
    addWorkspaceFromPath: createNoopFunction(),
    addCloneAgent: createNoopFunction(),
    addWorktreeAgent: createNoopFunction(),
    connectWorkspace: createNoopFunction(),
    markWorkspaceConnected: createNoopFunction(),
    updateWorkspaceSettings: createNoopFunction(),
    updateWorkspaceCodexBin: createNoopFunction(),
    createWorkspaceGroup: createNoopFunction(),
    renameWorkspaceGroup: createNoopFunction(),
    moveWorkspaceGroup: createNoopFunction(),
    deleteWorkspaceGroup: createNoopFunction(),
    assignWorkspaceGroup: createNoopFunction(),
    removeWorkspace: createNoopFunction(),
    removeWorktree: createNoopFunction(),
    renameWorktree: createNoopFunction(),
    renameWorktreeUpstream: createNoopFunction(),
    deletingWorktreeIds: [],
    hasLoaded: true,
    refreshWorkspaces: createNoopFunction(),
  }),
}));

vi.mock("./features/git/hooks/useGitRemote", () => ({
  useGitRemote: () => ({
    remote: null,
  }),
}));

vi.mock("./features/git/hooks/useGitRepoScan", () => ({
  useGitRepoScan: () => ({
    repos: [],
    isLoading: false,
    error: null,
    depth: 0,
    hasScanned: false,
    scan: createNoopFunction(),
    setDepth: createNoopFunction(),
    clear: createNoopFunction(),
  }),
}));

vi.mock("./features/collaboration/hooks/useCollaborationModes", () => ({
  useCollaborationModes: () => ({
    collaborationModes: [],
    collaborationModesEnabled: false,
    selectedCollaborationMode: null,
    selectedCollaborationModeId: null,
    setSelectedCollaborationModeId: createNoopFunction(),
  }),
}));

vi.mock("./app-shell-parts/useThreadScopedCollaborationMode", () => ({
  useThreadScopedCollaborationMode: () => ({
    collaborationUiModeByThread: {},
    setCollaborationUiModeByThread: createNoopFunction(),
    collaborationRuntimeModeByThread: {},
    setCollaborationRuntimeModeByThread: createNoopFunction(),
    activeThreadIdForModeRef: { current: null },
    lastCodexModeSyncThreadRef: { current: null },
    codexComposerModeRef: { current: null },
    applySelectedCollaborationMode: createNoopFunction(),
    setCodexCollaborationMode: createNoopFunction(),
    resolveCollaborationRuntimeMode: () => null,
    resolveCollaborationUiMode: () => null,
    handleCollaborationModeResolved: createNoopFunction(),
  }),
}));

vi.mock("./features/skills/hooks/useSkills", () => ({
  useSkills: () => ({
    skills: [],
  }),
}));

vi.mock("./features/engine/hooks/useEngineController", () => ({
  useEngineController: () => ({
    activeEngine: startupState.activeEngine,
    availableEngines: ["codex"],
    installedEngines: ["codex"],
    setActiveEngine: createNoopFunction(),
    engineModelsAsOptions: [],
    engineStatuses: {},
    refreshEngineModels: createNoopFunction(),
    refreshEngines: createNoopFunction(),
  }),
}));

vi.mock("./app-shell-parts/useOpenCodeSelection", () => ({
  useOpenCodeSelection: () => ({
    openCodeAgents: [],
    resolveOpenCodeAgentForThread: () => null,
    resolveOpenCodeVariantForThread: () => null,
    selectOpenCodeAgentForThread: createNoopFunction(),
    selectOpenCodeVariantForThread: createNoopFunction(),
    syncActiveOpenCodeThread: createNoopFunction(),
  }),
}));

vi.mock("./features/kanban/hooks/useKanbanStore", () => ({
  useKanbanStore: () => ({
    panels: [],
    tasks: [],
    kanbanViewState: null,
    setKanbanViewState: createNoopFunction(),
    createPanel: createNoopFunction(),
    updatePanel: createNoopFunction(),
    deletePanel: createNoopFunction(),
    createTask: createNoopFunction(),
    updateTask: createNoopFunction(),
    deleteTask: createNoopFunction(),
    reorderTask: createNoopFunction(),
  }),
}));

vi.mock("./features/composer/hooks/useComposerShortcuts", () => ({
  useComposerShortcuts: () => undefined,
}));

vi.mock("./features/composer/hooks/useComposerMenuActions", () => ({
  useComposerMenuActions: () => undefined,
}));

vi.mock("./features/prompts/hooks/useCustomPrompts", () => ({
  useCustomPrompts: () => ({
    prompts: [],
    createPrompt: createNoopFunction(),
    updatePrompt: createNoopFunction(),
    deletePrompt: createNoopFunction(),
    movePrompt: createNoopFunction(),
    getWorkspacePromptsDir: createNoopFunction(),
    getGlobalPromptsDir: createNoopFunction(),
  }),
}));

vi.mock("./features/commands/hooks/useCustomCommands", () => ({
  useCustomCommands: () => ({
    commands: [],
  }),
}));

vi.mock("./features/workspaces/hooks/useWorkspaceFiles", () => ({
  useWorkspaceFiles: () => ({
    files: [],
    directories: [],
    gitignoredFiles: [],
    gitignoredDirectories: [],
    isLoading: false,
    loadError: null,
    refreshFiles: createNoopFunction(),
  }),
}));

vi.mock("./features/git/hooks/useGitBranches", () => ({
  useGitBranches: () => ({
    branches: [],
    checkoutBranch: createNoopFunction(),
    createBranch: createNoopFunction(),
  }),
}));

vi.mock("./features/git/hooks/useGitActions", () => ({
  useGitActions: () => ({
    applyWorktreeChanges: createNoopFunction(),
    revertAllGitChanges: createNoopFunction(),
    revertGitFile: createNoopFunction(),
    stageGitAll: createNoopFunction(),
    stageGitFile: createNoopFunction(),
    unstageGitFile: createNoopFunction(),
    worktreeApplyError: null,
    worktreeApplyLoading: false,
    worktreeApplySuccess: false,
  }),
}));

vi.mock("./features/composer/hooks/useComposerEditorState", () => ({
  useComposerEditorState: () => ({
    textareaHeight: 0,
    onTextareaHeightChange: createNoopFunction(),
  }),
}));

vi.mock("./features/collaboration/hooks/useCollaborationModeSelection", () => ({
  useCollaborationModeSelection: () => ({
    collaborationModePayload: null,
  }),
}));

vi.mock("./features/threads/hooks/useThreads", () => ({
  useThreads: () => {
    const threadId = startupState.activeThreadId;
    return {
      setActiveThreadId: createNoopFunction(),
      activeThreadId: threadId,
      activeItems: [],
      threadItemsByThread: threadId ? { [threadId]: [] } : {},
      historyRestoredAtMsByThread: {},
      approvals: [],
      userInputRequests: [],
      threadsByWorkspace: {
        [startupState.workspace.id]: threadId
          ? [
              {
                id: threadId,
                name: "Thread 1",
                updatedAt: 123,
                engineSource: "codex",
              },
            ]
          : [],
      },
      threadParentById: {},
      threadStatusById: createThreadStatus(threadId),
      historyLoadingByThreadId: {},
      activeTurnIdByThread: {},
      completionEmailIntentByThread: {},
      toggleCompletionEmailIntent: createNoopFunction(),
      threadListLoadingByWorkspace: {},
      threadListPagingByWorkspace: {},
      threadListCursorByWorkspace: {},
      tokenUsageByThread: {},
      rateLimitsByWorkspace: {},
      accountByWorkspace: {},
      planByThread: {},
      lastAgentMessageByThread: {},
      interruptTurn: createNoopFunction(),
      removeThread: vi.fn(async () => ({ success: true })),
      removeThreads: createNoopFunction(),
      pinThread: createNoopFunction(),
      unpinThread: createNoopFunction(),
      isThreadPinned: () => false,
      getPinTimestamp: () => null,
      pinnedThreadsVersion: 0,
      renameThread: createNoopFunction(),
      triggerAutoThreadTitle: createNoopFunction(),
      isThreadAutoNaming: () => false,
      startThreadForWorkspace: createNoopFunction(),
      forkThreadForWorkspace: createNoopFunction(),
      forkSessionFromMessageForWorkspace: createNoopFunction(),
      forkClaudeSessionFromMessageForWorkspace: createNoopFunction(),
      listThreadsForWorkspace: createNoopFunction(),
      loadOlderThreadsForWorkspace: createNoopFunction(),
      resetWorkspaceThreads: createNoopFunction(),
      refreshThread: createNoopFunction(),
      sendUserMessage: createNoopFunction(),
      sendUserMessageToThread: createNoopFunction(),
      handleFusionStalled: createNoopFunction(),
      startFork: createNoopFunction(),
      startReview: createNoopFunction(),
      startResume: createNoopFunction(),
      startMcp: createNoopFunction(),
      startSpecRoot: createNoopFunction(),
      startStatus: createNoopFunction(),
      startContext: createNoopFunction(),
      startCompact: createNoopFunction(),
      startFast: createNoopFunction(),
      startMode: createNoopFunction(),
      startExport: createNoopFunction(),
      startImport: createNoopFunction(),
      startLsp: createNoopFunction(),
      startShare: createNoopFunction(),
      startSharedSessionForWorkspace: createNoopFunction(),
      updateSharedSessionEngineSelection: createNoopFunction(),
      resolveCanonicalThreadId: (value: string) => startupState.canonicalThreadId ?? value,
      reviewPrompt: null,
      closeReviewPrompt: createNoopFunction(),
      showPresetStep: false,
      choosePreset: createNoopFunction(),
      highlightedPresetIndex: 0,
      setHighlightedPresetIndex: createNoopFunction(),
      highlightedBranchIndex: 0,
      setHighlightedBranchIndex: createNoopFunction(),
      highlightedCommitIndex: 0,
      setHighlightedCommitIndex: createNoopFunction(),
      handleReviewPromptKeyDown: createNoopFunction(),
      confirmBranch: createNoopFunction(),
      selectBranch: createNoopFunction(),
      selectBranchAtIndex: createNoopFunction(),
      selectCommit: createNoopFunction(),
      selectCommitAtIndex: createNoopFunction(),
      confirmCommit: createNoopFunction(),
      updateCustomInstructions: createNoopFunction(),
      confirmCustom: createNoopFunction(),
      handleApprovalBatchAccept: createNoopFunction(),
      handleApprovalDecision: createNoopFunction(),
      handleApprovalRemember: createNoopFunction(),
      handleUserInputSubmit: createNoopFunction(),
      refreshAccountInfo: createNoopFunction(),
      refreshAccountRateLimits: createNoopFunction(),
    };
  },
}));

vi.mock("./app-shell-parts/useSelectedAgentSession", () => ({
  useSelectedAgentSession: () => ({
    selectedAgent: null,
    selectedAgentRef: { current: null },
    handleSelectAgent: createNoopFunction(),
    reloadSelectedAgent: createNoopFunction(),
    reloadAgentCatalog: vi.fn(async () => undefined),
  }),
}));

vi.mock("./app-shell-parts/usePlanApplyHandlers", () => ({
  usePlanApplyHandlers: () => ({
    handleUserInputSubmitWithPlanApply: createNoopFunction(),
    handleExitPlanModeExecute: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useAccountSwitching", () => ({
  useAccountSwitching: () => ({
    activeAccount: null,
    accountSwitching: false,
    handleSwitchAccount: createNoopFunction(),
    handleCancelSwitchAccount: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useThreadRows", () => ({
  useThreadRows: () => ({
    getThreadRows: () => [],
  }),
}));

vi.mock("./features/threads/hooks/useCopyThread", () => ({
  useCopyThread: () => ({
    handleCopyThread: createNoopFunction(),
  }),
}));

vi.mock("./features/threads/hooks/useRenameThreadPrompt", () => ({
  useRenameThreadPrompt: () => ({
    renamePrompt: null,
    openRenamePrompt: createNoopFunction(),
    handleRenamePromptChange: createNoopFunction(),
    handleRenamePromptCancel: createNoopFunction(),
    handleRenamePromptConfirm: createNoopFunction(),
  }),
}));

vi.mock("./features/threads/hooks/useDeleteThreadPrompt", () => ({
  useDeleteThreadPrompt: () => ({
    deletePrompt: null,
    isDeleting: false,
    openDeletePrompt: createNoopFunction(),
    handleDeletePromptCancel: createNoopFunction(),
    handleDeletePromptConfirm: createNoopFunction(),
  }),
}));

vi.mock("./features/workspaces/hooks/useRenameWorktreePrompt", () => ({
  useRenameWorktreePrompt: () => ({
    renamePrompt: null,
    notice: null,
    upstreamPrompt: null,
    confirmUpstream: createNoopFunction(),
    openRenamePrompt: createNoopFunction(),
    handleRenameChange: createNoopFunction(),
    handleRenameCancel: createNoopFunction(),
    handleRenameConfirm: createNoopFunction(),
  }),
}));

vi.mock("./features/terminal/hooks/useTerminalController", () => ({
  useTerminalController: () => ({
    terminalTabs: [],
    activeTerminalId: null,
    onSelectTerminal: createNoopFunction(),
    onNewTerminal: createNoopFunction(),
    onCloseTerminal: createNoopFunction(),
    terminalState: {},
    ensureTerminalWithTitle: createNoopFunction(),
    restartTerminalSession: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useWorkspaceLaunchScript", () => ({
  useWorkspaceLaunchScript: () => ({
    isVisible: false,
  }),
}));

vi.mock("./features/app/hooks/useWorkspaceRuntimeRun", () => ({
  useWorkspaceRuntimeRun: () => ({
    runtimeConsoleVisible: false,
    onCloseRuntimeConsole: createNoopFunction(),
    onOpenRuntimeConsole: createNoopFunction(),
  }),
}));

vi.mock("./features/workspaces/hooks/useWorkspaceSelection", () => ({
  useWorkspaceSelection: () => ({
    exitDiffView: createNoopFunction(),
    selectWorkspace: createNoopFunction(),
    selectHome: createNoopFunction(),
  }),
}));

vi.mock("./features/workspaces/hooks/useWorktreePrompt", () => ({
  useWorktreePrompt: () => ({
    worktreePrompt: null,
    worktreeCreateResult: null,
    openPrompt: createNoopFunction(),
    confirmPrompt: createNoopFunction(),
    cancelPrompt: createNoopFunction(),
    closeWorktreeCreateResult: createNoopFunction(),
    updateBranch: createNoopFunction(),
    updateBaseRef: createNoopFunction(),
    updatePublishToOrigin: createNoopFunction(),
    updateSetupScript: createNoopFunction(),
  }),
}));

vi.mock("./features/workspaces/hooks/useClonePrompt", () => ({
  useClonePrompt: () => ({
    clonePrompt: null,
    openPrompt: createNoopFunction(),
    confirmPrompt: createNoopFunction(),
    cancelPrompt: createNoopFunction(),
    updateCopyName: createNoopFunction(),
    chooseCopiesFolder: createNoopFunction(),
    useSuggestedCopiesFolder: createNoopFunction(),
    clearCopiesFolder: createNoopFunction(),
  }),
}));

vi.mock("./app-shell-parts/useAppShellSearchRadarSection", () => ({
  useAppShellSearchRadarSection: () => ({
    activePath: null,
    activeWorkspaceKanbanTasks: [],
    activeWorkspaceThreads: [],
    ensureWorkspaceThreadListLoaded: createNoopFunction(),
    handleEnsureWorkspaceThreadsForSettings: createNoopFunction(),
    handleInsertComposerText: createNoopFunction(),
    historySearchItems: [],
    hydratedThreadListWorkspaceIdsRef: { current: {} },
    listThreadsForWorkspaceTracked: createNoopFunction(),
    lockLiveSessions: createNoopFunction(),
    perfSnapshotRef: { current: null },
    RECENT_THREAD_LIMIT: 5,
    recentThreads: [],
    scopedKanbanTasks: [],
    searchResults: [],
    sessionRadarFeed: {
      runningSessions: [],
      recentCompletedSessions: [],
      runningCountByWorkspaceId: {},
      recentCountByWorkspaceId: {},
    },
    workspaceActivity: {},
    workspaceNameByPath: {},
    workspaceSearchSources: [],
  }),
}));

vi.mock("./features/app/hooks/useGitCommitController", () => ({
  useGitCommitController: () => ({
    commitMessage: "",
    commitMessageLoading: false,
    commitMessageError: null,
    commitLoading: false,
    pushLoading: false,
    syncLoading: false,
    commitError: null,
    pushError: null,
    syncError: null,
    onCommitMessageChange: createNoopFunction(),
    onGenerateCommitMessage: createNoopFunction(),
    onCommit: createNoopFunction(),
    onCommitAndPush: createNoopFunction(),
    onCommitAndSync: createNoopFunction(),
    onPush: createNoopFunction(),
    onSync: createNoopFunction(),
  }),
}));

vi.mock("./app-shell-parts/useAppShellPromptActionsSection", () => ({
  useAppShellPromptActionsSection: () => ({
    handleSendPromptToNewAgent: createNoopFunction(),
    handleCreatePrompt: createNoopFunction(),
    handleUpdatePrompt: createNoopFunction(),
    handleDeletePrompt: createNoopFunction(),
    handleMovePrompt: createNoopFunction(),
    handleRevealWorkspacePrompts: createNoopFunction(),
    handleRevealGeneralPrompts: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useWorkspaceActions", () => ({
  useWorkspaceActions: () => ({
    handleAddWorkspace: createNoopFunction(),
    handleOpenNewWindow: createNoopFunction(),
    handleAddWorkspaceFromPath: createNoopFunction(),
    handleAddAgent: createNoopFunction(),
    handleAddWorktreeAgent: createNoopFunction(),
    handleAddCloneAgent: createNoopFunction(),
  }),
}));

vi.mock("./features/workspaces/hooks/useOpenPaths", () => ({
  useOpenPaths: () => undefined,
}));

vi.mock("./features/workspaces/hooks/useWorkspaceDropZone", () => ({
  useWorkspaceDropZone: () => ({
    dropTargetRef: { current: null },
    isDragOver: false,
    handleDragOver: createNoopFunction(),
    handleDragEnter: createNoopFunction(),
    handleDragLeave: createNoopFunction(),
    handleDrop: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useWorkspaceRefreshOnFocus", () => ({
  useWorkspaceRefreshOnFocus: () => undefined,
}));

vi.mock("./features/workspaces/hooks/useWorkspaceRestore", () => ({
  useWorkspaceRestore: () => undefined,
}));

vi.mock("./features/layout/hooks/useWindowDrag", () => ({
  useWindowDrag: () => undefined,
}));

vi.mock("./features/app/hooks/useSyncSelectedDiffPath", () => ({
  useSyncSelectedDiffPath: () => undefined,
}));

vi.mock("./features/app/hooks/useMenuAcceleratorController", () => ({
  useMenuAcceleratorController: () => undefined,
}));

vi.mock("./features/app/hooks/useAppMenuEvents", () => ({
  useAppMenuEvents: () => undefined,
}));

vi.mock("./features/app/hooks/useWorkspaceCycling", () => ({
  useWorkspaceCycling: () => undefined,
}));

vi.mock("./features/app/hooks/useInterruptShortcut", () => ({
  useInterruptShortcut: () => undefined,
}));

vi.mock("./features/app/hooks/useArchiveShortcut", () => ({
  useArchiveShortcut: () => undefined,
}));

vi.mock("./features/app/hooks/useGlobalSearchShortcut", () => ({
  useGlobalSearchShortcut: () => undefined,
}));

vi.mock("./features/app/hooks/useLiquidGlassEffect", () => ({
  useLiquidGlassEffect: () => undefined,
}));

vi.mock("./features/app/hooks/useCodeCssVars", () => ({
  useCodeCssVars: () => undefined,
}));

vi.mock("./features/app/hooks/useMenuLocalization", () => ({
  useMenuLocalization: () => undefined,
}));

vi.mock("./features/git/hooks/useAutoExitEmptyDiff", () => ({
  useAutoExitEmptyDiff: () => undefined,
}));

vi.mock("./features/app/hooks/useWorkspaceLaunchScripts", () => ({
  useWorkspaceLaunchScripts: () => ({
    entries: [],
  }),
}));

vi.mock("./features/app/hooks/useWorktreeSetupScript", () => ({
  useWorktreeSetupScript: () => ({
    maybeRunWorktreeSetupScript: vi.fn(async () => undefined),
  }),
}));

vi.mock("./features/app/hooks/useComposerController", () => ({
  useComposerController: () => ({
    activeImages: [],
    attachImages: createNoopFunction(),
    pickImages: createNoopFunction(),
    removeImage: createNoopFunction(),
    clearActiveImages: createNoopFunction(),
    removeImagesForThread: createNoopFunction(),
    activeQueue: [],
    activeQueuedHandoffBubble: null,
    handleSend: createNoopFunction(),
    queueMessage: createNoopFunction(),
    prefillDraft: null,
    setPrefillDraft: createNoopFunction(),
    composerInsert: null,
    setComposerInsert: createNoopFunction(),
    activeDraft: "",
    handleDraftChange: createNoopFunction(),
    handleSendPrompt: createNoopFunction(),
    handleEditQueued: createNoopFunction(),
    handleDeleteQueued: createNoopFunction(),
    handleFuseQueued: createNoopFunction(),
    canFuseActiveQueue: false,
    activeFusingMessageId: null,
    clearDraftForThread: createNoopFunction(),
  }),
}));

vi.mock("./features/app/hooks/useLiveEditPreview", () => ({
  useLiveEditPreview: () => ({
    enabled: false,
  }),
}));

vi.mock("./features/git/hooks/usePullRequestComposer", () => ({
  usePullRequestComposer: () => ({
    activeDraft: null,
  }),
}));

vi.mock("./features/layout/hooks/useSoloMode", () => ({
  useSoloMode: () => ({
    isSoloMode: false,
    soloModeEnabled: false,
    toggleSoloMode: createNoopFunction(),
    resetSoloSplitToHalf: createNoopFunction(),
  }),
}));

vi.mock("./app-shell-parts/useAppShellSearchAndComposerSection", () => ({
  useAppShellSearchAndComposerSection: () => ({
    handleComposerSend: createNoopFunction(),
    isPullRequestComposer: false,
    composerSendLabel: "Send",
    resetPullRequestSelection: createNoopFunction(),
    handleToggleSearchPalette: createNoopFunction(),
    handleComposerQueue: createNoopFunction(),
  }),
}));

vi.mock("./app-shell-parts/useAppShellSections", () => ({
  useAppShellSections: () => ({
    isPullRequestComposer: false,
  }),
}));

vi.mock("./app-shell-parts/useAppShellLayoutNodesSection", () => ({
  useAppShellLayoutNodesSection: () => ({}),
}));

vi.mock("./app-shell-parts/renderAppShell", () => ({
  renderAppShell: (ctx: Record<string, unknown>) => {
    startupState.renderCtx = ctx;
    const threadSelection =
      typeof ctx.resolveComposerSelectionForThread === "function"
        ? ctx.resolveComposerSelectionForThread(
            startupState.workspace.id,
            startupState.activeThreadId,
          )
        : null;
    return (
      <div
        data-testid="app-shell-sentinel"
        data-model={String(ctx.effectiveSelectedModelId ?? "")}
        data-effort={String(ctx.resolvedEffort ?? "")}
        data-thread-model={String(threadSelection?.modelId ?? "")}
        data-thread-effort={String(threadSelection?.effort ?? "")}
      />
    );
  },
}));

describe("AppShell startup", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    startupState.activeEngine = "codex";
    startupState.activeThreadId = "codex:thread-1";
    startupState.canonicalThreadId = null;
    startupState.configModel = "gpt-5.5";
    startupState.appSettingsLoading = false;
    startupState.appSettings = createAppSettings();
    startupState.renderCtx = null;
    startupState.clientStore = {
      app: {},
      composer: {},
      threads: {},
      layout: {},
      leida: {},
    };
    startupState.setAppSettings = vi.fn((updater) =>
      typeof updater === "function" ? updater(startupState.appSettings) : updater,
    );
    startupState.queueSaveSettings = vi.fn(async (next) => next);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("mounts with a stored thread-scoped codex composer selection without entering an update loop", async () => {
    const sessionKey = getThreadComposerSelectionStorageKey(
      startupState.workspace.id,
      "codex:thread-1",
    );
    startupState.clientStore.composer[sessionKey] = {
      modelId: "codex-alt",
      effort: "high",
    };

    const view = render(<AppShell />);

    await waitFor(() => {
      const sentinel = view.getByTestId("app-shell-sentinel");
      expect(sentinel.getAttribute("data-model")).toBe("codex-alt");
      expect(sentinel.getAttribute("data-effort")).toBe("high");
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Maximum update depth exceeded"),
    );
    expect(startupState.renderCtx?.effectiveSelectedModelId).toBe("codex-alt");
    expect(startupState.queueSaveSettings).not.toHaveBeenCalled();
  });

  it("mounts without an active thread and keeps the global composer defaults", async () => {
    startupState.activeThreadId = null;
    startupState.appSettings.lastComposerModelId = "gpt-5.5";
    startupState.appSettings.lastComposerReasoningEffort = "medium";

    const view = render(<AppShell />);

    await waitFor(() => {
      const sentinel = view.getByTestId("app-shell-sentinel");
      expect(sentinel.getAttribute("data-model")).toBe("gpt-5.5");
      expect(sentinel.getAttribute("data-effort")).toBe("medium");
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Maximum update depth exceeded"),
    );
    expect(startupState.renderCtx?.effectiveSelectedModelId).toBe("gpt-5.5");
  });

  it("does not clear the global composer defaults before app settings finish loading", async () => {
    startupState.activeThreadId = null;
    startupState.appSettingsLoading = true;
    startupState.appSettings.lastComposerModelId = "gpt-5.5";
    startupState.appSettings.lastComposerReasoningEffort = "medium";

    const view = render(<AppShell />);

    await waitFor(() => {
      const sentinel = view.getByTestId("app-shell-sentinel");
      expect(sentinel.getAttribute("data-model")).toBe("gpt-5.5");
    });

    expect(startupState.setAppSettings).not.toHaveBeenCalled();
    expect(startupState.queueSaveSettings).not.toHaveBeenCalled();
  });

  it("persists the effective global composer defaults instead of clearing them during a cold start", async () => {
    startupState.activeThreadId = null;
    startupState.appSettings.lastComposerModelId = "missing-model";
    startupState.appSettings.lastComposerReasoningEffort = "ultra";

    const view = render(<AppShell />);

    await waitFor(() => {
      const sentinel = view.getByTestId("app-shell-sentinel");
      expect(sentinel.getAttribute("data-model")).toBe("gpt-5.5");
      expect(sentinel.getAttribute("data-effort")).toBe("medium");
    });

    expect(startupState.queueSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        lastComposerModelId: "gpt-5.5",
        lastComposerReasoningEffort: "medium",
      }),
    );
  });

  it("keeps the thread selection stable when a pending codex thread finalizes", async () => {
    startupState.activeThreadId = "codex-pending-1";
    startupState.canonicalThreadId = "codex:session-1";
    startupState.clientStore.composer[
      getThreadComposerSelectionStorageKey(startupState.workspace.id, "codex-pending-1")
    ] = {
      modelId: "codex-alt",
      effort: "high",
    };

    const view = render(<AppShell />);

    await waitFor(() => {
      const sentinel = view.getByTestId("app-shell-sentinel");
      expect(sentinel.getAttribute("data-model")).toBe("codex-alt");
      expect(sentinel.getAttribute("data-effort")).toBe("high");
    });

    startupState.activeThreadId = "codex:session-1";
    startupState.canonicalThreadId = "codex:session-1";
    view.rerender(<AppShell />);

    await waitFor(() => {
      const sentinel = view.getByTestId("app-shell-sentinel");
      expect(sentinel.getAttribute("data-model")).toBe("codex-alt");
      expect(sentinel.getAttribute("data-effort")).toBe("high");
    });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Maximum update depth exceeded"),
    );
    expect(startupState.renderCtx?.effectiveSelectedModelId).toBe("codex-alt");
  });

  it("repairs an invalid stored thread composer selection to the effective model and effort", async () => {
    const sessionKey = getThreadComposerSelectionStorageKey(
      startupState.workspace.id,
      "codex:thread-1",
    );
    startupState.clientStore.composer[sessionKey] = {
      modelId: "missing-model",
      effort: "ultra",
    };

    const view = render(<AppShell />);

    await waitFor(() => {
      const sentinel = view.getByTestId("app-shell-sentinel");
      expect(sentinel.getAttribute("data-model")).toBe("gpt-5.5");
      expect(sentinel.getAttribute("data-effort")).toBe("medium");
    });

    await waitFor(() => {
      expect(startupState.clientStore.composer[sessionKey]).toEqual({
        modelId: "gpt-5.5",
        effort: "medium",
      });
    });
  });
});
