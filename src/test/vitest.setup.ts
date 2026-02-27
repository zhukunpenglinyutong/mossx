import { vi } from "vitest";

if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Object.defineProperty(Element.prototype, "getAnimations", {
    value: () => [],
    configurable: true,
  });
}

// Mock react-i18next to return keys or fallback text during tests
vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      // Map keys to Chinese text for tests (matching default language)
      const translations: Record<string, string> = {
        "update.title": "Update",
        "update.checkingForUpdates": "Checking for updates...",
        "update.updateAvailable": "A new version is available.",
        "update.upToDate": "You're up to date.",
        "update.downloading": "Downloading update…",
        "update.installing": "Installing update…",
        "update.restarting": "Restarting…",
        "update.failed": "Update failed.",
        "update.downloaded": "downloaded",
        "common.later": "Later",
        "common.dismiss": "Dismiss",
        "common.retry": "Retry",
        "sidebar.searchProjects": "Search projects",
        "sidebar.clearSearch": "Clear search",
        "sidebar.pinned": "Pinned",
        "sidebar.newAgent": "New agent",
        "sidebar.newWorktreeAgent": "New worktree agent",
        "sidebar.newCloneAgent": "New clone agent",
        "sidebar.noProjectsMatch": "No projects match your search.",
        "sidebar.addWorkspaceToStart": "Add a workspace to start.",
        "sidebar.quickNewThread": "New Thread",
        "sidebar.quickAutomation": "Automation",
        "sidebar.quickSkills": "Skills",
        "sidebar.threadsSection": "Threads",
        "sidebar.dropProjectHere": "Drop Project Here",
        "sidebar.addingProject": "Adding Project...",
        "sidebar.apiKey": "API key",
        "sidebar.signInToCodex": "Sign in to Codex",
        "sidebar.switchAccount": "Switch account",
        "sidebar.signIn": "Sign in",
        "app.title": "MossX",
        "app.subtitle": "Orchestrate agents across your local projects.",
        "home.latestAgents": "Latest agents",
        "home.agentReplied": "Agent replied.",
        "home.running": "Running",
        "home.loadingAgents": "Loading agents",
        "home.noAgentActivity": "No agent activity yet",
        "home.startThreadToSee": "Start a thread to see the latest responses here.",
        "home.openProject": "Add project",
        "home.addWorkspace": "Add Workspace",
        "home.usageSnapshot": "Usage snapshot",
        "home.refreshUsage": "Refresh usage",
        "home.workspace": "Workspace",
        "home.allWorkspaces": "All workspaces",
        "home.view": "View",
        "home.tokens": "Tokens",
        "home.time": "Time",
        "settings.title": "Settings",
        "settings.theme": "Theme",
        "settings.themeSystem": "System",
        "settings.themeLight": "Light",
        "settings.themeDark": "Dark",
        "settings.themeDim": "Dim",
        "settings.language": "Language",
        "settings.languageZh": "中文",
        "settings.languageEn": "English",
        "settings.projectsTitle": "Projects",
        "settings.projectsDescription": "Group related workspaces and reorder projects within each group.",
        "settings.groupsTitle": "GROUPS",
        "settings.groupsDescription": "Create group labels for related repositories.",
        "settings.newGroupPlaceholder": "New group name",
        "settings.addGroupButton": "Add group",
        "settings.noGroupsYet": "No groups yet.",
        "settings.projectsSubsectionTitle": "PROJECTS",
        "settings.projectsSubsectionDescription": "Assign projects to groups and adjust their order.",
        "settings.ungrouped": "Ungrouped",
        "settings.sidebarProjects": "Projects",
        "settings.sidebarDisplay": "Display & Sound",
        "settings.sidebarComposer": "Composer",
        "settings.sidebarDictation": "Dictation",
        "settings.sidebarShortcuts": "Shortcuts",
        "settings.sidebarOpenIn": "Open in",
        "settings.sidebarGit": "Git",
        "settings.sidebarCodex": "Codex",
        "settings.sidebarExperimental": "Experimental",
        "settings.showRemainingLimits": "Show remaining Codex limits",
        "settings.reduceTransparency": "Reduce transparency",
        "settings.notificationSounds": "Notification sounds",
        "settings.systemNotification": "System Notifications",
        "settings.systemNotificationDesc": "Send system-level notifications when sessions complete, even when the window is not in focus.",
        // Common actions
        "settings.close": "Close",
        "settings.closeSettings": "Close settings",
        "settings.save": "Save",
        "settings.saving": "Saving...",
        "settings.reset": "Reset",
        "settings.clear": "Clear",
        "settings.browse": "Browse",
        "settings.chooseEllipsis": "Choose…",
        "settings.notSet": "Not set",
        "settings.notFound": "Not found",
        "settings.truncated": "Truncated",
        "settings.loading": "Loading…",
        "settings.test": "Test",
        "settings.testSound": "Test sound",
        "settings.default": "Default",
        "settings.defaultColon": "Default:",
        "settings.ok": "OK",
        "settings.moveUp": "Move up",
        "settings.moveDown": "Move down",
        "settings.remove": "Remove",
        "settings.add": "Add",
        // Composer presets
        "settings.composerPresetDefault": "Default (no helpers)",
        "settings.composerPresetHelpful": "Helpful",
        "settings.composerPresetSmart": "Smart",
        // Dictation models
        "settings.dictationModelTiny": "Tiny",
        "settings.dictationModelBase": "Base",
        "settings.dictationModelSmall": "Small",
        "settings.dictationModelMedium": "Medium",
        "settings.dictationModelLargeV3": "Large V3",
        "settings.dictationModelFastest": "Fastest, least accurate.",
        "settings.dictationModelBalanced": "Balanced default.",
        "settings.dictationModelBetter": "Better accuracy.",
        "settings.dictationModelHigh": "High accuracy.",
        "settings.dictationModelBest": "Best accuracy, heavy download.",
        // Projects section (additional)
        "settings.copiesFolder": "Copies folder",
        "settings.deleteGroupTitle": "Delete Group",
        "settings.deleteGroupWarning": "Projects in this group will move to",
        "settings.moveGroupUp": "Move group up",
        "settings.moveGroupDown": "Move group down",
        "settings.deleteGroup": "Delete group",
        "settings.moveProjectUp": "Move project up",
        "settings.moveProjectDown": "Move project down",
        "settings.deleteProject": "Delete project",
        "settings.noProjectsYet": "No projects yet.",
        // Display & Sound section
        "settings.displayTitle": "Display & Sound",
        "settings.displayDescription": "Tune visuals and audio alerts to your preferences.",
        "settings.displaySubtitle": "Display",
        "settings.displaySubDescription": "Adjust how the window renders backgrounds and effects.",
        "settings.showRemainingLimitsDesc": "Display what is left instead of what is used.",
        "settings.reduceTransparencyDesc": "Use solid surfaces instead of glass.",
        "settings.interfaceScale": "Interface scale",
        "settings.interfaceScaleAriaLabel": "Interface scale",
        "settings.uiFontFamily": "UI font family",
        "settings.uiFontFamilyDesc": "Applies to all UI text. Leave empty to use the default system font stack.",
        "settings.codeFontFamily": "Code font family",
        "settings.codeFontFamilyDesc": "Applies to git diffs and other mono-spaced readouts.",
        "settings.codeFontSize": "Code font size",
        "settings.codeFontSizeDesc": "Adjusts code and diff text size.",
        "settings.soundsSubtitle": "Sounds",
        "settings.soundsSubDescription": "Control notification audio alerts.",
        "settings.notificationSoundsDesc": "Play a sound when a long-running agent finishes while the window is unfocused.",
        // Composer section
        "settings.composerTitle": "Composer",
        "settings.composerDescription": "Control helpers and formatting behavior inside the message editor.",
        "settings.presetsSubtitle": "Presets",
        "settings.presetsSubDescription": "Choose a starting point and fine-tune the toggles below.",
        "settings.preset": "Preset",
        "settings.presetDesc": "Presets update the toggles below. Customize any setting after selecting.",
        "settings.codeFencesSubtitle": "Code fences",
        "settings.expandFencesOnSpace": "Expand fences on Space",
        "settings.expandFencesOnSpaceDesc": "Typing ``` then Space inserts a fenced block.",
        "settings.expandFencesOnEnter": "Expand fences on Enter",
        "settings.expandFencesOnEnterDesc": "Use Enter to expand ``` lines when enabled.",
        "settings.supportLanguageTags": "Support language tags",
        "settings.supportLanguageTagsDesc": "Allows ```lang + Space to include a language.",
        "settings.wrapSelectionInFences": "Wrap selection in fences",
        "settings.wrapSelectionInFencesDesc": "Wraps selected text when creating a fence.",
        "settings.copyBlocksWithoutFences": "Copy blocks without fences",
        "settings.copyBlocksWithoutFencesDesc": "When enabled, Copy is plain text. Hold Option to include ``` fences.",
        "settings.pastingSubtitle": "Pasting",
        "settings.autoWrapMultiLinePaste": "Auto-wrap multi-line paste",
        "settings.autoWrapMultiLinePasteDesc": "Wraps multi-line paste inside a fenced block.",
        "settings.autoWrapCodeLikeSingleLines": "Auto-wrap code-like single lines",
        "settings.autoWrapCodeLikeSingleLinesDesc": "Wraps long single-line code snippets on paste.",
        "settings.listsSubtitle": "Lists",
        "settings.continueListsOnShiftEnter": "Continue lists on Shift+Enter",
        "settings.continueListsOnShiftEnterDesc": "Continues numbered and bulleted lists when the line has content.",
        // Dictation section
        "settings.dictationTitle": "Dictation",
        "settings.dictationDescription": "Enable microphone dictation with on-device transcription.",
        "settings.enableDictation": "Enable dictation",
        "settings.enableDictationDesc": "Downloads the selected Whisper model on first use.",
        "settings.dictationModel": "Dictation model",
        "settings.downloadSize": "Download size:",
        "settings.preferredDictationLanguage": "Preferred dictation language",
        "settings.autoDetectOnly": "Auto-detect only",
        "settings.languageEnglish": "English",
        "settings.languageSpanish": "Spanish",
        "settings.languageFrench": "French",
        "settings.languageGerman": "German",
        "settings.languageItalian": "Italian",
        "settings.languagePortuguese": "Portuguese",
        "settings.languageDutch": "Dutch",
        "settings.languageSwedish": "Swedish",
        "settings.languageNorwegian": "Norwegian",
        "settings.languageDanish": "Danish",
        "settings.languageFinnish": "Finnish",
        "settings.languagePolish": "Polish",
        "settings.languageTurkish": "Turkish",
        "settings.languageRussian": "Russian",
        "settings.languageUkrainian": "Ukrainian",
        "settings.languageJapanese": "Japanese",
        "settings.languageKorean": "Korean",
        "settings.languageChinese": "Chinese",
        "settings.languageDetectionDesc": "Auto-detect stays on; this nudges the decoder toward your preference.",
        "settings.holdToDictateKey": "Hold-to-dictate key",
        "settings.holdToDictateOff": "Off",
        "settings.holdToDictateOption": "Option / Alt",
        "settings.holdToDictateShift": "Shift",
        "settings.holdToDictateControl": "Control",
        "settings.holdToDictateCommand": "Command / Meta",
        "settings.holdToDictateDesc": "Hold the key to start dictation, release to stop and process.",
        "settings.modelStatus": "Model status",
        "settings.modelReady": "Ready for dictation.",
        "settings.modelNotDownloaded": "Model not downloaded yet.",
        "settings.modelDownloading": "Downloading model...",
        "settings.modelDownloadError": "Download error.",
        "settings.downloadModel": "Download model",
        "settings.cancelDownload": "Cancel download",
        "settings.removeModel": "Remove model",
        // Shortcuts section
        "settings.shortcutsTitle": "Shortcuts",
        "settings.shortcutsDescription": "Customize keyboard shortcuts for file actions, composer, panels, and navigation.",
        "settings.fileSubtitle": "File",
        "settings.fileSubDescription": "Create agents and worktrees from the keyboard.",
        "settings.newAgent": "New Agent",
        "settings.newWorktreeAgent": "New Worktree Agent",
        "settings.newCloneAgent": "New Clone Agent",
        "settings.archiveActiveThread": "Archive active thread",
        "settings.typeShortcut": "Type shortcut",
        "settings.pressNewShortcut": "Press a new shortcut while focused. Default:",
        "settings.composerSubtitle": "Composer",
        "settings.composerSubDescription": "Cycle between model, access, reasoning, and collaboration modes.",
        "settings.cycleModel": "Cycle model",
        "settings.cycleAccessMode": "Cycle access mode",
        "settings.cycleReasoningMode": "Cycle reasoning mode",
        "settings.cycleCollaborationMode": "Cycle collaboration mode",
        "settings.stopActiveRun": "Stop active run",
        "settings.panelsSubtitle": "Panels",
        "settings.panelsSubDescription": "Toggle sidebars and panels.",
        "settings.toggleProjectsSidebar": "Toggle projects sidebar",
        "settings.toggleGitSidebar": "Toggle right sidebar",
        "settings.toggleGlobalSearch": "Toggle global search",
        "settings.toggleDebugPanel": "Toggle debug panel",
        "settings.toggleTerminalPanel": "Toggle terminal panel",
        "settings.navigationSubtitle": "Navigation",
        "settings.navigationSubDescription": "Cycle between agents and workspaces.",
        "settings.nextAgent": "Next agent",
        "settings.previousAgent": "Previous agent",
        "settings.nextWorkspace": "Next workspace",
        "settings.previousWorkspace": "Previous workspace",
        // Open in section
        "settings.openInTitle": "Open in",
        "settings.openInDescription": "Customize the Open in menu shown in the title bar and file previews.",
        "settings.label": "Label",
        "settings.type": "Type",
        "settings.typeApp": "App",
        "settings.typeCommand": "Command",
        "settings.typeFinder": "Finder",
        "settings.appName": "App name",
        "settings.command": "Command",
        "settings.args": "Args",
        "settings.defaultRadio": "Default",
        "settings.removeApp": "Remove app",
        "settings.removeAppAriaLabel": "Remove app",
        "settings.addApp": "Add app",
        "settings.openInHelp": "Commands receive the selected path as the final argument. Apps use macOS open with optional args.",
        "settings.newApp": "New App",
        // Git section
        "settings.gitTitle": "Git",
        "settings.gitDescription": "Manage how diffs are loaded in the Git sidebar.",
        "settings.preloadGitDiffs": "Preload git diffs",
        "settings.preloadGitDiffsDesc": "Make viewing git diff faster.",
        // Codex section
        "settings.codexTitle": "Codex",
        "settings.codexDescription": "Configure the Codex CLI used by MossX and validate the install.",
        "settings.defaultCodexPath": "Default Codex path",
        "settings.codexPlaceholder": "codex",
        "settings.usePath": "Use PATH",
        "settings.pathResolutionDesc": "Leave empty to use the system PATH resolution.",
        "settings.defaultCodexArgs": "Default Codex args",
        "settings.codexArgsPlaceholder": "--profile personal",
        "settings.codexArgsDesc": "Extra flags passed before",
        "settings.appServer": "app-server",
        "settings.codexArgsDescSuffix": ". Use quotes for values with spaces.",
        "settings.runDoctor": "Run doctor",
        "settings.running": "Running...",
        "settings.codexLooksGood": "Codex looks good",
        "settings.codexIssueDetected": "Codex issue detected",
        "settings.versionLabel": "Version:",
        "settings.appServerLabel": "App-server:",
        "settings.nodeLabel": "Node:",
        "settings.pathLabel": "PATH:",
        "settings.statusOk": "ok",
        "settings.statusFailed": "failed",
        "settings.statusMissing": "missing",
        "settings.statusUnknown": "unknown",
        "settings.defaultAccessMode": "Default access mode",
        "settings.readOnly": "Read only",
        "settings.onRequest": "On-request",
        "settings.fullAccess": "Full access",
        "settings.backendMode": "Backend mode",
        "settings.backendLocal": "Local (default)",
        "settings.backendRemote": "Remote (daemon)",
        "settings.backendRemoteDesc": "Remote mode connects to a separate daemon running the backend on another machine (e.g. WSL2/Linux).",
        "settings.remoteBackend": "Remote backend",
        "settings.remoteBackendHost": "127.0.0.1:4732",
        "settings.remoteBackendToken": "Token (optional)",
        "settings.remoteBackendHostAriaLabel": "Remote backend host",
        "settings.remoteBackendTokenAriaLabel": "Remote backend token",
        "settings.remoteBackendDesc": "Start the daemon separately and point MossX to it (host:port + token).",
        "settings.globalAgentsMd": "Global AGENTS.md",
        "settings.globalAgentsMdPlaceholder": "Add global instructions for Codex agents…",
        "settings.storedAt": "Stored at",
        "settings.globalConfigToml": "Global config.toml",
        "settings.globalConfigTomlPlaceholder": "Edit the global Codex config.toml…",
        "settings.workspaceOverrides": "Workspace overrides",
        "settings.codexBinaryOverride": "Codex binary override",
        "settings.codexHomeOverride": "CODEX_HOME override",
        "settings.codexArgsOverride": "Codex args override",
        // Experimental section
        "settings.experimentalTitle": "Experimental",
        "settings.experimentalDescription": "Preview features that may change or be removed.",
        "settings.experimentalWarning1": "Experimental flags are stored in the default CODEX_HOME config.toml.",
        "settings.experimentalWarning2": "Workspace overrides are not updated.",
        "settings.configFile": "Config file",
        "settings.configFileDesc": "Open the Codex config in Finder.",
        "settings.openInFinder": "Open in Finder",
        "settings.multiAgent": "Multi-agent",
        "settings.multiAgentDesc": "Enable multi-agent collaboration tools in Codex.",
        "settings.collaborationModes": "Collaboration modes",
        "settings.collaborationModesDesc": "Enable collaboration mode presets (Code, Plan).",
        "settings.backgroundTerminal": "Background terminal",
        "settings.backgroundTerminalDesc": "Run long-running terminal commands in the background.",
        "settings.steerMode": "Steer mode",
        "settings.steerModeDesc": "Send messages immediately. Use Tab to queue while a run is active.",
        "composer.collaborationCode": "Code",
        "composer.collaborationPlan": "Plan",
        "composer.collaborationModeDisabledHint":
          "Enable collaboration modes in Settings > Experimental",
        "composer.collaborationPlanHint":
          "Plan mode enables interactive questions. It is different from the update_plan checklist tool.",
        "composer.collaborationCodeInlineHint":
          "{{mode}} · directly implement code changes",
        "approval.showSecret": "Show",
        "approval.hideSecret": "Hide",
        "approval.submitFailed": "Submit failed. Please retry.",
        "tools.userInputRequest": "User Input Request",
        "tools.planQuickView": "Plan",
        "tools.openFullPlanPanel": "Open full Plan panel",
        "statusPanel.tabPlan": "Plan",
        "statusPanel.emptyPlan": "No plan",
        "statusPanel.planGenerating": "Generating plan...",
        "statusPanel.planSwitchHint": "Switch to Plan mode to view plan",
        // Error messages
        "settings.unableToOpenConfig": "Unable to open config.",
        // Thread error messages
        "threads.sessionStopped": "会话已停止。",
        "threads.turnFailed": "会话失败。",
        "threads.turnFailedWithMessage": "会话失败：{{message}}",
        "threads.turnFailedToStart": "会话启动失败。",
        "threads.turnFailedToStartWithMessage": "会话启动失败：{{message}}",
      };
      // Simple interpolation for test environment
      let template = translations[key] ?? key;
      if (params && typeof template === "string") {
        Object.entries(params).forEach(([paramKey, value]) => {
          template = template.replace(new RegExp(`{{${paramKey}}}`, "g"), value);
        });
      }
      return template;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

if (!("IS_REACT_ACT_ENVIRONMENT" in globalThis)) {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    writable: true,
  });
} else {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
}

if (!("matchMedia" in globalThis)) {
  Object.defineProperty(globalThis, "matchMedia", {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
}

if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverMock });
}

if (!("IntersectionObserver" in globalThis)) {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(globalThis, "IntersectionObserver", {
    value: IntersectionObserverMock,
  });
}

if (!("requestAnimationFrame" in globalThis)) {
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: (id: number) => clearTimeout(id),
  });
}

const hasLocalStorage = "localStorage" in globalThis;
const existingLocalStorage = hasLocalStorage
  ? (globalThis as { localStorage?: Storage }).localStorage
  : null;

if (!existingLocalStorage || typeof existingLocalStorage.clear !== "function") {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key) ?? null : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorage,
    writable: true,
    configurable: true,
  });
}

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(() => Promise.resolve(null)),
}));

// Mock client storage to use in-memory cache without Tauri backend
vi.mock("../services/clientStorage", () => {
  const cache: Record<string, Record<string, unknown>> = {};
  return {
    preloadClientStores: vi.fn(() => Promise.resolve()),
    isPreloaded: vi.fn(() => true),
    getClientStoreSync: vi.fn((store: string, key: string) => {
      return cache[store]?.[key];
    }),
    getClientStoreFullSync: vi.fn((store: string) => {
      return cache[store];
    }),
    writeClientStoreValue: vi.fn((store: string, key: string, value: unknown) => {
      if (!cache[store]) cache[store] = {};
      cache[store][key] = value;
    }),
    writeClientStoreData: vi.fn((store: string, data: Record<string, unknown>) => {
      cache[store] = data;
    }),
  };
});

vi.mock("../services/dragDrop", () => ({
  subscribeWindowDragDrop: vi.fn(() => () => {}),
}));
