// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../types";
import * as systemNotification from "../services/systemNotification";
import { writeTerminalSession } from "../services/tauri";
import { useTerminalController } from "../features/terminal/hooks/useTerminalController";
import type { TerminalSessionState } from "../features/terminal/hooks/useTerminalSession";
import { useWorkspaceRuntimeRun } from "../features/app/hooks/useWorkspaceRuntimeRun";
import { useAppShellWorkspaceFlowsSection } from "./useAppShellWorkspaceFlowsSection";

vi.mock("../services/systemNotification", () => ({
  setNotificationActionHandler: vi.fn(),
}));

vi.mock("../services/clientStorage", () => ({
  writeClientStoreValue: vi.fn(),
}));

vi.mock("../services/tauri", () => ({
  writeTerminalSession: vi.fn(),
}));

vi.mock("../features/workspaces/hooks/useRenameWorktreePrompt", () => ({
  useRenameWorktreePrompt: vi.fn(() => ({
    renamePrompt: null,
    notice: null,
    upstreamPrompt: null,
    confirmUpstream: vi.fn(),
    openRenamePrompt: vi.fn(),
    handleRenameChange: vi.fn(),
    handleRenameCancel: vi.fn(),
    handleRenameConfirm: vi.fn(),
  })),
}));

vi.mock("../features/workspaces/hooks/useClonePrompt", () => ({
  useClonePrompt: vi.fn(() => ({
    clonePrompt: null,
    openPrompt: vi.fn(),
    confirmPrompt: vi.fn(),
    cancelPrompt: vi.fn(),
    updateCopyName: vi.fn(),
    chooseCopiesFolder: vi.fn(),
    useSuggestedCopiesFolder: vi.fn(),
    clearCopiesFolder: vi.fn(),
  })),
}));

vi.mock("../features/terminal/hooks/useTerminalController", () => ({
  useTerminalController: vi.fn(() => ({
    terminalTabs: [],
    activeTerminalId: null,
    onSelectTerminal: vi.fn(),
    onNewTerminal: vi.fn(),
    onCloseTerminal: vi.fn(),
    terminalState: {},
    ensureTerminalWithTitle: vi.fn(() => "terminal-id"),
    restartTerminalSession: vi.fn(),
  })),
}));

vi.mock("../features/app/hooks/useWorkspaceLaunchScript", () => ({
  useWorkspaceLaunchScript: vi.fn(() => ({})),
}));

vi.mock("../features/app/hooks/useWorkspaceRuntimeRun", () => ({
  useWorkspaceRuntimeRun: vi.fn(() => ({
    onOpenRuntimeConsole: vi.fn(),
    onSelectRuntimeCommandPreset: vi.fn(),
    onChangeRuntimeCommandInput: vi.fn(),
    onRunProject: vi.fn(),
    onStopProject: vi.fn(),
    onClearRuntimeLogs: vi.fn(),
    onCopyRuntimeLogs: vi.fn(),
    onToggleRuntimeAutoScroll: vi.fn(),
    onToggleRuntimeWrapLines: vi.fn(),
    onCloseRuntimeConsole: vi.fn(),
    runtimeAutoScroll: true,
    runtimeWrapLines: true,
    runtimeConsoleVisible: false,
    runtimeConsoleStatus: "idle",
    runtimeConsoleCommandPreview: null,
    runtimeCommandPresetOptions: ["auto"],
    runtimeCommandPresetId: "auto",
    runtimeCommandInput: "",
    runtimeConsoleLog: "",
    runtimeConsoleError: null,
    runtimeConsoleTruncated: false,
    runtimeConsoleExitCode: null,
  })),
}));

vi.mock("../features/app/hooks/useWorkspaceLaunchScripts", () => ({
  useWorkspaceLaunchScripts: vi.fn(() => ({})),
}));

vi.mock("../features/app/hooks/useWorktreeSetupScript", () => ({
  useWorktreeSetupScript: vi.fn(() => ({
    maybeRunWorktreeSetupScript: vi.fn(),
  })),
}));

function createWorkspace(id: string): WorkspaceInfo {
  return {
    id,
    name: id,
    path: `/tmp/${id}`,
    connected: true,
    settings: { sidebarCollapsed: false },
  };
}

function createContext(overrides: Partial<Parameters<typeof useAppShellWorkspaceFlowsSection>[0]> = {}) {
  const workspace = createWorkspace("ws-1");
  return {
    activeWorkspace: workspace,
    activeWorkspaceId: workspace.id,
    activeThreadId: "thread-1",
    addCloneAgent: vi.fn(),
    addDebugEntry: vi.fn(),
    alertError: vi.fn(),
    appSettings: { workspaceGroups: [] },
    clearDraftForThread: vi.fn(),
    closeTerminalPanel: vi.fn(),
    collapseRightPanel: vi.fn(),
    connectWorkspace: vi.fn(),
    exitDiffView: vi.fn(),
    handleToggleTerminal: vi.fn(),
    isCompact: false,
    listThreadsForWorkspaceTracked: vi.fn(),
    openTerminal: vi.fn(),
    queueSaveSettings: vi.fn(),
    refreshThread: vi.fn(),
    removeImagesForThread: vi.fn(),
    removeThread: vi.fn().mockResolvedValue({ success: true }),
    renameWorktree: vi.fn(),
    renameWorktreeUpstream: vi.fn(),
    resetWorkspaceThreads: vi.fn(),
    selectWorkspace: vi.fn(),
    setActiveEngine: vi.fn(),
    setActiveTab: vi.fn(),
    setActiveThreadId: vi.fn(),
    setAgentTaskScrollRequest: vi.fn(),
    setAppMode: vi.fn(),
    setAppSettings: vi.fn(),
    setCenterMode: vi.fn(),
    setHomeOpen: vi.fn(),
    setSelectedKanbanTaskId: vi.fn(),
    t: (key: string) => key,
    terminalOpen: false,
    threadsByWorkspace: {
      [workspace.id]: [{ id: "thread-1", engineSource: "codex" }],
    },
    updateWorkspaceSettings: vi.fn(),
    workspaces: [workspace],
    ...overrides,
  };
}

describe("useAppShellWorkspaceFlowsSection", () => {
  const setNotificationActionHandlerMock = vi.mocked(
    systemNotification.setNotificationActionHandler,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers and cleans up the notification action handler", async () => {
    const context = createContext();
    const { unmount } = renderHook(() =>
      useAppShellWorkspaceFlowsSection(context),
    );

    expect(setNotificationActionHandlerMock).toHaveBeenCalledTimes(1);
    expect(setNotificationActionHandlerMock).toHaveBeenLastCalledWith(
      expect.any(Function),
    );

    unmount();

    expect(setNotificationActionHandlerMock).toHaveBeenCalledTimes(2);
    expect(setNotificationActionHandlerMock).toHaveBeenLastCalledWith(null);
  });

  it("navigates to a notified thread and syncs engine from thread metadata", async () => {
    const context = createContext();
    renderHook(() => useAppShellWorkspaceFlowsSection(context));

    const handler = setNotificationActionHandlerMock.mock.calls.at(-1)?.[0] as
      | ((extra: Record<string, unknown>) => void)
      | undefined;

    expect(handler).toBeTypeOf("function");

    act(() => {
      handler?.({ workspaceId: "ws-1", threadId: "thread-1" });
    });

    expect(context.exitDiffView).toHaveBeenCalled();
    expect(context.setAppMode).toHaveBeenCalledWith("chat");
    expect(context.setActiveTab).toHaveBeenCalledWith("codex");
    expect(context.setHomeOpen).toHaveBeenCalledWith(false);
    expect(context.collapseRightPanel).toHaveBeenCalled();
    expect(context.setSelectedKanbanTaskId).toHaveBeenCalledWith(null);
    expect(context.selectWorkspace).toHaveBeenCalledWith("ws-1");
    expect(context.setActiveThreadId).toHaveBeenCalledWith("thread-1", "ws-1");
    expect(context.setActiveEngine).toHaveBeenCalledWith("codex");
  });

  it("archives the active thread and clears draft/image state after success", async () => {
    const context = createContext();
    const { result } = renderHook(() =>
      useAppShellWorkspaceFlowsSection(context),
    );

    await act(async () => {
      await result.current.handleArchiveActiveThread();
    });

    expect(context.removeThread).toHaveBeenCalledWith("ws-1", "thread-1");
    expect(context.clearDraftForThread).toHaveBeenCalledWith("thread-1");
    expect(context.removeImagesForThread).toHaveBeenCalledWith("thread-1");
    expect(context.alertError).not.toHaveBeenCalled();
  });

  it("surfaces archive failure without clearing local thread state", async () => {
    const context = createContext({
      removeThread: vi.fn().mockResolvedValue({
        success: false,
        message: "archive failed",
      }),
    });
    const { result } = renderHook(() =>
      useAppShellWorkspaceFlowsSection(context),
    );

    await act(async () => {
      await result.current.handleArchiveActiveThread();
    });

    expect(context.alertError).toHaveBeenCalledWith("archive failed");
    expect(context.clearDraftForThread).not.toHaveBeenCalled();
    expect(context.removeImagesForThread).not.toHaveBeenCalled();
  });

  it("closes runtime console when toggling an already-open terminal panel", () => {
    const onCloseRuntimeConsole = vi.fn();
    vi.mocked(useWorkspaceRuntimeRun).mockReturnValue({
      onOpenRuntimeConsole: vi.fn(),
      onSelectRuntimeCommandPreset: vi.fn(),
      onChangeRuntimeCommandInput: vi.fn(),
      onRunProject: vi.fn(),
      onStopProject: vi.fn(),
      onClearRuntimeLogs: vi.fn(),
      onCopyRuntimeLogs: vi.fn(),
      onToggleRuntimeAutoScroll: vi.fn(),
      onToggleRuntimeWrapLines: vi.fn(),
      onCloseRuntimeConsole,
      runtimeAutoScroll: true,
      runtimeWrapLines: true,
      runtimeConsoleVisible: true,
      runtimeConsoleStatus: "running",
      runtimeConsoleCommandPreview: null,
      runtimeCommandPresetOptions: ["auto"],
      runtimeCommandPresetId: "auto",
      runtimeCommandInput: "",
      runtimeConsoleLog: "",
      runtimeConsoleError: null,
      runtimeConsoleTruncated: false,
      runtimeConsoleExitCode: null,
    });

    const context = createContext({
      terminalOpen: true,
    });
    const { result } = renderHook(() =>
      useAppShellWorkspaceFlowsSection(context),
    );

    act(() => {
      result.current.handleToggleTerminalPanel();
    });

    expect(onCloseRuntimeConsole).toHaveBeenCalledTimes(1);
    expect(context.handleToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("opens Claude TUI resume in an internal terminal and writes the resume command when ready", async () => {
    const ensureTerminalWithTitle = vi.fn(() => "claude-terminal");
    const restartTerminalSession = vi.fn().mockResolvedValue(undefined);
    const readyTerminalState: TerminalSessionState = {
      status: "ready",
      message: "Terminal ready.",
      containerRef: { current: null },
      hasSession: true,
      readyKey: "ws-1:claude-terminal",
      cleanupTerminalSession: vi.fn(),
    };
    const terminalControllerReadyState = {
      terminalTabs: [],
      activeTerminalId: "claude-terminal",
      onSelectTerminal: vi.fn(),
      onNewTerminal: vi.fn(),
      onCloseTerminal: vi.fn(),
      terminalState: readyTerminalState,
      ensureTerminalWithTitle,
      restartTerminalSession,
    } satisfies ReturnType<typeof useTerminalController>;
    vi.mocked(useTerminalController).mockReturnValue({
      ...terminalControllerReadyState,
      activeTerminalId: null,
      terminalState: {
        ...terminalControllerReadyState.terminalState,
        readyKey: null,
      },
    });
    vi.mocked(writeTerminalSession).mockResolvedValue(undefined);

    const context = createContext();
    const { result, rerender } = renderHook(() =>
      useAppShellWorkspaceFlowsSection(context),
    );

    await act(async () => {
      result.current.handleOpenClaudeTui({
        workspaceId: "ws-1",
        workspacePath: "/tmp/ws-1",
        sessionId: "session-1",
      });
    });
    vi.mocked(useTerminalController).mockReturnValue(terminalControllerReadyState);
    await act(async () => {
      rerender();
    });

    expect(ensureTerminalWithTitle).toHaveBeenCalledWith(
      "ws-1",
      "claude-tui:session-1",
      "terminal.claudeTuiResumeTitle",
    );
    expect(context.openTerminal).toHaveBeenCalledTimes(1);
    expect(restartTerminalSession).toHaveBeenCalledWith("ws-1", "claude-terminal");
    expect(writeTerminalSession).toHaveBeenCalledWith(
      "ws-1",
      "claude-terminal",
      "claude --resume session-1\n",
    );
  });
});
