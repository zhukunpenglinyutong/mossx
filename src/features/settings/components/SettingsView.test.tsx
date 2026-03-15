// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";
import { SettingsView } from "./SettingsView";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  open: vi.fn(),
}));

vi.mock("../../../i18n", () => ({
  saveLanguage: vi.fn(),
  default: {
    use: () => ({ init: vi.fn() }),
  },
}));

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseSettings: AppSettings = {
  codexBin: null,
  codexArgs: null,
  backendMode: "local",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
  systemProxyEnabled: false,
  systemProxyUrl: null,
  defaultAccessMode: "current",
  composerModelShortcut: null,
  composerAccessShortcut: null,
  composerReasoningShortcut: null,
  composerCollaborationShortcut: null,
  interruptShortcut: null,
  newAgentShortcut: null,
  newWorktreeAgentShortcut: null,
  newCloneAgentShortcut: null,
  archiveThreadShortcut: null,
  toggleProjectsSidebarShortcut: null,
  toggleGitSidebarShortcut: null,
  toggleGlobalSearchShortcut: null,
  toggleDebugPanelShortcut: null,
  toggleTerminalShortcut: null,
  cycleAgentNextShortcut: null,
  cycleAgentPrevShortcut: null,
  cycleWorkspaceNextShortcut: null,
  cycleWorkspacePrevShortcut: null,
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  uiScale: 1,
  theme: "system",
  userMsgColor: "",
  usageShowRemaining: false,
  showMessageAnchors: true,
  uiFontFamily:
    "Monaco, \"SF Pro Text\", \"SF Pro Display\", -apple-system, \"Helvetica Neue\", sans-serif",
  codeFontFamily:
    "Monaco, \"SF Mono\", \"SFMono-Regular\", Menlo, monospace",
  codeFontSize: 11,
  notificationSoundsEnabled: true,
  notificationSoundId: "default",
  notificationSoundCustomPath: "",
  systemNotificationEnabled: true,
  preloadGitDiffs: true,
  experimentalCollabEnabled: false,
  experimentalCollaborationModesEnabled: false,
  experimentalSteerEnabled: false,
  experimentalUnifiedExecEnabled: false,
  chatCanvasUseNormalizedRealtime: false,
  chatCanvasUseUnifiedHistoryLoader: true,
  chatCanvasUsePresentationProfile: false,
  dictationEnabled: false,
  dictationModelId: "base",
  dictationPreferredLanguage: null,
  dictationHoldKey: null,
  composerEditorPreset: "default",
  composerSendShortcut: "enter",
  composerFenceExpandOnSpace: false,
  composerFenceExpandOnEnter: false,
  composerFenceLanguageTags: false,
  composerFenceWrapSelection: false,
  composerFenceAutoWrapPasteMultiline: false,
  composerFenceAutoWrapPasteCodeLike: false,
  composerListContinuation: false,
  composerCodeBlockCopyUseModifier: false,
  workspaceGroups: [],
  openAppTargets: [
    {
      id: "vscode",
      label: "VS Code",
      kind: "app",
      appName: "Visual Studio Code",
      command: null,
      args: [],
    },
  ],
  selectedOpenAppId: "vscode",
};

const createDoctorResult = () => ({
  ok: true,
  codexBin: null,
  version: null,
  appServerOk: true,
  appServerProbeStatus: "ok",
  details: null,
  path: null,
  pathEnvUsed: null,
  proxyEnvSnapshot: undefined,
  nodeOk: true,
  nodeVersion: null,
  nodeDetails: null,
  resolvedBinaryPath: null,
  wrapperKind: null,
  fallbackRetried: false,
});

const renderDisplaySection = (
  options: {
    appSettings?: Partial<AppSettings>;
    reduceTransparency?: boolean;
    onUpdateAppSettings?: ComponentProps<typeof SettingsView>["onUpdateAppSettings"];
    onToggleTransparency?: ComponentProps<typeof SettingsView>["onToggleTransparency"];
  } = {},
) => {
  cleanup();
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  const onToggleTransparency = options.onToggleTransparency ?? vi.fn();
  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: options.reduceTransparency ?? false,
    onToggleTransparency,
    appSettings: { ...baseSettings, ...options.appSettings },
    openAppIconById: {},
    onUpdateAppSettings,
    workspaceGroups: [],
    groupedWorkspaces: [],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    activeWorkspace: null,
    activeEngine: "codex",
    onUpdateWorkspaceCodexBin: vi.fn().mockResolvedValue(undefined),
    onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
  };

  render(<SettingsView {...props} />);

  return { onUpdateAppSettings, onToggleTransparency };
};

const renderComposerSection = (
  options: {
    appSettings?: Partial<AppSettings>;
    onUpdateAppSettings?: ComponentProps<typeof SettingsView>["onUpdateAppSettings"];
  } = {},
) => {
  cleanup();
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: false,
    onToggleTransparency: vi.fn(),
    appSettings: { ...baseSettings, ...options.appSettings },
    openAppIconById: {},
    onUpdateAppSettings,
    workspaceGroups: [],
    groupedWorkspaces: [],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    activeWorkspace: null,
    activeEngine: "codex",
    onUpdateWorkspaceCodexBin: vi.fn().mockResolvedValue(undefined),
    onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
    initialSection: "composer",
  };

  render(<SettingsView {...props} />);

  return { onUpdateAppSettings };
};

describe("SettingsView Display", () => {
  it("keeps codex, dictation, git, and experimental sidebar entries hidden", () => {
    renderDisplaySection();

    expect(screen.queryByRole("button", { name: "Dictation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Git" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Codex" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Experimental" })).toBeNull();
  });

  it("renders codex doctor probe metadata including proxy context", async () => {
    cleanup();
    const onRunDoctor = vi.fn().mockResolvedValue({
      ...createDoctorResult(),
      version: "1.0.0",
      path: "/usr/local/bin:/usr/bin",
      pathEnvUsed: "/usr/local/bin:/usr/bin",
      resolvedBinaryPath: "C:/Users/test/AppData/Roaming/npm/codex.cmd",
      wrapperKind: "cmd-wrapper",
      fallbackRetried: true,
      proxyEnvSnapshot: {
        HTTP_PROXY: "http://127.0.0.1:7890",
        HTTPS_PROXY: null,
      },
      appServerProbeStatus: "fallback-ok",
    });
    render(
      <SettingsView
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRunDoctor={onRunDoctor}
        activeWorkspace={null}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="codex"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run doctor" }));

    await waitFor(() => {
      expect(onRunDoctor).toHaveBeenCalled();
    });
    const doctorBody = document.querySelector(".settings-doctor-body");
    expect(doctorBody?.textContent).toContain("App Server Probe: fallback-ok");
    expect(doctorBody?.textContent).toContain(
      "Resolved Binary: C:/Users/test/AppData/Roaming/npm/codex.cmd",
    );
    expect(doctorBody?.textContent).toContain("Wrapper Kind: cmd-wrapper");
    expect(doctorBody?.textContent).toContain("Wrapper Fallback Retry: attempted");
    expect(doctorBody?.textContent).toContain("HTTP_PROXY=http://127.0.0.1:7890");
    expect(doctorBody?.textContent).toContain("HTTPS_PROXY=Not set");
  });

  it("updates the theme selection", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark" }),
      );
    });
  });

  it("updates user message color using reference-compatible format", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    fireEvent.click(screen.getByTestId("settings-user-msg-color-preset-6e40c9"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ userMsgColor: "#6e40c9" }),
      );
    });

    fireEvent.change(screen.getByTestId("settings-user-msg-color-hex-input"), {
      target: { value: "#cf222e" },
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ userMsgColor: "#cf222e" }),
      );
    });

    const callCountBeforeInvalid = onUpdateAppSettings.mock.calls.length;
    fireEvent.change(screen.getByTestId("settings-user-msg-color-hex-input"), {
      target: { value: "#zzzzzz" },
    });

    expect(onUpdateAppSettings).toHaveBeenCalledTimes(callCountBeforeInvalid);
  });

  it("hides remaining limits, message anchors, and transparency toggles", () => {
    renderDisplaySection();

    expect(screen.queryByText("Show remaining Codex limits")).toBeNull();
    expect(screen.queryByText("Show message anchors")).toBeNull();
    expect(screen.queryByText("Reduce transparency")).toBeNull();
  });

  it("updates ui scale from the basic font size selector", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const fontSizeSelect = screen.getByLabelText("Font size");

    fireEvent.change(fontSizeSelect, { target: { value: "1.4" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiScale: 1.4 }),
      );
    });

    fireEvent.change(fontSizeSelect, { target: { value: "0.8" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiScale: 0.8 }),
      );
    });
  });

  it("commits font family changes on blur and enter", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const uiFontInput = screen.getByLabelText("UI font family");
    fireEvent.change(uiFontInput, { target: { value: "Avenir, sans-serif" } });
    fireEvent.blur(uiFontInput);

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ uiFontFamily: "Avenir, sans-serif" }),
      );
    });

    const codeFontInput = screen.getByLabelText("Code font family");
    fireEvent.change(codeFontInput, {
      target: { value: "JetBrains Mono, monospace" },
    });
    fireEvent.keyDown(codeFontInput, { key: "Enter" });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ codeFontFamily: "JetBrains Mono, monospace" }),
      );
    });
  });

  it("resets font families to defaults", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const uiFontInput = screen.getByLabelText("UI font family");
    const uiFontRow = uiFontInput.closest(".settings-field-row");
    if (!uiFontRow) {
      throw new Error("Expected UI font row");
    }
    fireEvent.click(within(uiFontRow as HTMLElement).getByRole("button", { name: "Reset" }));

    const codeFontInput = screen.getByLabelText("Code font family");
    const codeFontRow = codeFontInput.closest(".settings-field-row");
    if (!codeFontRow) {
      throw new Error("Expected code font row");
    }
    fireEvent.click(within(codeFontRow as HTMLElement).getByRole("button", { name: "Reset" }));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          uiFontFamily: expect.stringMatching(/^Monaco,/),
        }),
      );
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          codeFontFamily: expect.stringMatching(/^Monaco,/),
        }),
      );
    });
  });

  it("updates code font size from the slider", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({ onUpdateAppSettings });

    const slider = screen.getByLabelText("Code font size");
    fireEvent.change(slider, { target: { value: "14" } });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ codeFontSize: 14 }),
      );
    });
  });

  it("toggles notification sounds", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: { notificationSoundsEnabled: false },
    });

    fireEvent.click(screen.getByRole("button", { name: "Behavior" }));

    const row = screen
      .getByText("Notification sounds")
      .closest(".settings-sound-toggle-row") as HTMLElement | null;
    if (!row) {
      throw new Error("Expected notification sounds row");
    }
    fireEvent.click(within(row).getByRole("switch"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationSoundsEnabled: true }),
      );
    });
  });

  it("updates selected notification sound option", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: { notificationSoundsEnabled: true, notificationSoundId: "default" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Behavior" }));

    const nativeSelect = screen
      .getAllByLabelText("Notification sound")
      .find((node) => node.tagName.toLowerCase() === "select");
    if (!nativeSelect) {
      throw new Error("Expected native notification sound select");
    }
    fireEvent.change(nativeSelect, {
      target: { value: "bell" },
    });

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ notificationSoundId: "bell" }),
      );
    });
  });

  it("auto applies network proxy when toggled on", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: { systemProxyEnabled: false, systemProxyUrl: null },
    });
    vi.mocked(pushErrorToast).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Behavior" }));
    const proxyCard = document.querySelector(".settings-basic-proxy-card") as HTMLElement | null;
    if (!proxyCard) {
      throw new Error("Expected network proxy card");
    }
    fireEvent.change(screen.getByLabelText("settings.behaviorProxyAddress"), {
      target: { value: "http://127.0.0.1:7890" },
    });
    fireEvent.click(within(proxyCard).getByRole("switch"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          systemProxyEnabled: true,
          systemProxyUrl: "http://127.0.0.1:7890",
        }),
      );
    });

    expect(document.querySelector(".settings-basic-proxy-card.is-enabled")).toBeTruthy();
    expect(document.querySelector(".settings-proxy-header-badge")).toBeTruthy();
    expect(document.querySelectorAll(".settings-basic-proxy-card .proxy-status-badge")).toHaveLength(1);
    expect(screen.getByRole("status").textContent ?? "").toContain(
      "settings.behaviorProxyEnabledSuccess",
    );
  });

  it("auto disables network proxy when toggled off", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: {
        systemProxyEnabled: true,
        systemProxyUrl: "http://127.0.0.1:7890",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Behavior" }));
    const proxyCard = document.querySelector(".settings-basic-proxy-card") as HTMLElement | null;
    if (!proxyCard) {
      throw new Error("Expected network proxy card");
    }

    fireEvent.click(within(proxyCard).getByRole("switch"));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          systemProxyEnabled: false,
          systemProxyUrl: "http://127.0.0.1:7890",
        }),
      );
    });

    expect(screen.getByRole("status").textContent ?? "").toContain(
      "settings.behaviorProxyDisabledSuccess",
    );
  });

  it("rolls back proxy toggle and shows failure feedback when auto apply fails", async () => {
    const onUpdateAppSettings = vi.fn().mockRejectedValue(new Error("proxy apply failed"));
    renderDisplaySection({
      onUpdateAppSettings,
      appSettings: { systemProxyEnabled: false, systemProxyUrl: null },
    });

    fireEvent.click(screen.getByRole("button", { name: "Behavior" }));
    const proxyCard = document.querySelector(".settings-basic-proxy-card") as HTMLElement | null;
    if (!proxyCard) {
      throw new Error("Expected network proxy card");
    }

    fireEvent.change(screen.getByLabelText("settings.behaviorProxyAddress"), {
      target: { value: "http://127.0.0.1:7890" },
    });
    fireEvent.click(within(proxyCard).getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent ?? "").toContain("proxy apply failed");
    });

    expect(within(proxyCard).getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(pushErrorToast).toHaveBeenCalledWith({
      title: "common.error",
      message: "proxy apply failed",
    });
  });
});

describe("SettingsView Composer", () => {
  it("updates send shortcut mode", async () => {
    const onUpdateAppSettings = vi.fn().mockResolvedValue(undefined);
    renderComposerSection({ onUpdateAppSettings });

    fireEvent.click(screen.getByRole("radio", { name: /⌘\/Ctrl\+Enter sends/i }));

    await waitFor(() => {
      expect(onUpdateAppSettings).toHaveBeenCalledWith(
        expect.objectContaining({ composerSendShortcut: "cmdEnter" }),
      );
    });
  });
});

describe("SettingsView Other", () => {
  it("toggles project session management collapse in other settings", async () => {
    const workspace: WorkspaceInfo = {
      id: "ws-1",
      name: "Workspace",
      path: "/tmp/workspace",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false, codexArgs: null },
    };

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[{ id: null, name: "Ungrouped", workspaces: [workspace] }]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={workspace}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        workspaceThreadsById={{
          "ws-1": [
            {
              id: "thread-a",
              name: "Session A",
              updatedAt: Date.now(),
              engineSource: "codex",
            },
          ],
        }}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="other"
      />,
    );

    const collapseButton = screen.getByTestId("settings-project-sessions-expand-toggle");

    expect(screen.getByText("Session A")).toBeTruthy();

    fireEvent.click(collapseButton);
    expect(screen.queryByText("Session A")).toBeNull();

    fireEvent.click(collapseButton);
    await waitFor(() => {
      expect(screen.getByText("Session A")).toBeTruthy();
    });
  });

  it("deletes selected project sessions from other settings", async () => {
    const workspace: WorkspaceInfo = {
      id: "ws-1",
      name: "Workspace",
      path: "/tmp/workspace",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false, codexArgs: null },
    };
    const onDeleteWorkspaceThreads = vi.fn().mockResolvedValue({
      succeededThreadIds: ["thread-a"],
      failed: [],
    });

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[{ id: null, name: "Ungrouped", workspaces: [workspace] }]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={workspace}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        workspaceThreadsById={{
          "ws-1": [
            {
              id: "thread-a",
              name: "Session A",
              updatedAt: Date.now(),
              engineSource: "codex",
            },
          ],
        }}
        onDeleteWorkspaceThreads={onDeleteWorkspaceThreads}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="other"
      />,
    );

    const sessionTitle = screen.getByText("Session A");
    const sessionButton = sessionTitle.closest("button");
    if (!sessionButton) {
      throw new Error("Expected session selection button");
    }
    fireEvent.click(sessionButton);

    const deleteButton = screen.getByTestId("settings-project-sessions-delete-selected");
    fireEvent.click(deleteButton);
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(onDeleteWorkspaceThreads).toHaveBeenCalledWith("ws-1", ["thread-a"]);
    });
  });

  it("switches workspace from project session picker", async () => {
    const workspaceOne: WorkspaceInfo = {
      id: "ws-1",
      name: "Workspace One",
      path: "/tmp/workspace-one",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false, codexArgs: null },
    };
    const workspaceTwo: WorkspaceInfo = {
      id: "ws-2",
      name: "Workspace Two",
      path: "/tmp/workspace-two",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false, codexArgs: null },
    };

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[
          { id: "group-1", name: "Github", workspaces: [workspaceOne, workspaceTwo] },
        ]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={workspaceOne}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        workspaceThreadsById={{
          "ws-1": [
            {
              id: "thread-a",
              name: "Session A",
              updatedAt: Date.now(),
              engineSource: "codex",
            },
          ],
          "ws-2": [
            {
              id: "thread-b",
              name: "Session B",
              updatedAt: Date.now(),
              engineSource: "codex",
            },
          ],
        }}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="other"
      />,
    );

    expect(screen.getByText("Session A")).toBeTruthy();
    expect(screen.queryByText("Session B")).toBeNull();

    fireEvent.click(screen.getByTestId("settings-project-sessions-workspace-picker-trigger"));
    fireEvent.change(screen.getByLabelText("workspace.searchProjects"), {
      target: { value: "two" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Workspace Two" }));

    await waitFor(() => {
      expect(screen.getByText("Session B")).toBeTruthy();
    });
    expect(screen.queryByText("Session A")).toBeNull();
  });

  it("shows and selects worktree entries in project session picker", async () => {
    const workspaceRoot: WorkspaceInfo = {
      id: "ws-root",
      name: "codemoss",
      path: "/tmp/codemoss",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false, codexArgs: null },
    };
    const workspaceWorktree: WorkspaceInfo = {
      id: "ws-worktree",
      name: "codex/feature-a",
      path: "/tmp/codemoss/worktrees/feature-a",
      connected: false,
      codex_bin: null,
      kind: "worktree",
      parentId: "ws-root",
      worktree: {
        branch: "feature-a",
      },
      settings: { sidebarCollapsed: false, codexArgs: null },
    };

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[
          { id: "group-1", name: "Github", workspaces: [workspaceRoot] },
        ]}
        allWorkspaces={[workspaceRoot, workspaceWorktree]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={workspaceRoot}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        workspaceThreadsById={{
          "ws-root": [
            {
              id: "thread-root",
              name: "Root Session",
              updatedAt: Date.now(),
              engineSource: "codex",
            },
          ],
          "ws-worktree": [
            {
              id: "thread-worktree",
              name: "Worktree Session",
              updatedAt: Date.now(),
              engineSource: "codex",
            },
          ],
        }}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="other"
      />,
    );

    expect(screen.getByText("Root Session")).toBeTruthy();

    fireEvent.click(screen.getByTestId("settings-project-sessions-workspace-picker-trigger"));
    const worktreeLabel = screen.getByText("↳ codex/feature-a");
    const worktreeOption = worktreeLabel.closest("button");
    if (!worktreeOption) {
      throw new Error("Expected worktree option button");
    }
    fireEvent.click(worktreeOption);

    await waitFor(() => {
      expect(screen.getByText("Worktree Session")).toBeTruthy();
    });
    expect(screen.queryByText("Root Session")).toBeNull();
  });
});

describe("SettingsView Codex overrides", () => {
  it("updates workspace Codex args override on blur", async () => {
    const onUpdateWorkspaceSettings = vi.fn().mockResolvedValue(undefined);
    const workspace: WorkspaceInfo = {
      id: "w1",
      name: "Workspace",
      path: "/tmp/workspace",
      connected: false,
      codex_bin: null,
      kind: "main",
      parentId: null,
      worktree: null,
      settings: { sidebarCollapsed: false, codexArgs: null },
    };

    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[
          { id: null, name: "Ungrouped", workspaces: [workspace] },
        ]}
        ungroupedLabel="Ungrouped"
        onClose={vi.fn()}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={workspace}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={onUpdateWorkspaceSettings}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
        initialSection="codex"
      />,
    );

    const input = screen.getByLabelText("Codex args override for Workspace");
    fireEvent.change(input, { target: { value: "--profile dev" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onUpdateWorkspaceSettings).toHaveBeenCalledWith("w1", {
        codexArgs: "--profile dev",
      });
    });
  });
});

describe("SettingsView Shortcuts", () => {
  it("closes when clicking back to app", async () => {
    const onClose = vi.fn();
    render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={onClose}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={null}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Back to app" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("closes on Cmd+W", async () => {
    let unmount = () => {};
    const onClose = vi.fn(() => {
      unmount();
    });
    const rendered = render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={onClose}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={null}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
      />,
    );
    unmount = rendered.unmount;

    fireEvent.keyDown(window, { key: "w", metaKey: true, bubbles: true });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("closes on Escape", async () => {
    let unmount = () => {};
    const onClose = vi.fn(() => {
      unmount();
    });
    const rendered = render(
      <SettingsView
        workspaceGroups={[]}
        groupedWorkspaces={[]}
        ungroupedLabel="Ungrouped"
        onClose={onClose}
        onMoveWorkspace={vi.fn()}
        onDeleteWorkspace={vi.fn()}
        onCreateWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onRenameWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onMoveWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onDeleteWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        onAssignWorkspaceGroup={vi.fn().mockResolvedValue(null)}
        reduceTransparency={false}
        onToggleTransparency={vi.fn()}
        appSettings={baseSettings}
        openAppIconById={{}}
        onUpdateAppSettings={vi.fn().mockResolvedValue(undefined)}
        onRunDoctor={vi.fn().mockResolvedValue(createDoctorResult())}
        activeWorkspace={null}
        activeEngine="codex"
        onUpdateWorkspaceCodexBin={vi.fn().mockResolvedValue(undefined)}
        onUpdateWorkspaceSettings={vi.fn().mockResolvedValue(undefined)}
        scaleShortcutTitle="Scale shortcut"
        scaleShortcutText="Use Command +/-"
        onTestNotificationSound={vi.fn()}
        dictationModelStatus={null}
        onDownloadDictationModel={vi.fn()}
        onCancelDictationDownload={vi.fn()}
        onRemoveDictationModel={vi.fn()}
      />,
    );
    unmount = rendered.unmount;

    fireEvent.keyDown(window, { key: "Escape", bubbles: true });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
