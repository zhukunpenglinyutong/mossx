// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineType, WorkspaceInfo } from "../../../types";
import { useSidebarMenus } from "./useSidebarMenus";
import { getOpenCodeProviderHealth } from "../../../services/tauri";
import { pushGlobalRuntimeNotice } from "../../../services/globalRuntimeNotices";
import type {
  EngineDisplayInfo,
  EngineRefreshResult,
} from "../../engine/hooks/useEngineController";

const mockMenuPopup = vi.fn<
  (items: Array<{ text: string; enabled?: boolean; action?: () => Promise<void> | void }>) => Promise<void>
>();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "threads.rename": "Rename",
        "threads.autoName": "Auto name",
        "threads.autoNaming": "Auto naming",
        "threads.copyId": "Copy ID",
        "threads.moveToFolder": "Move to folder",
        "threads.moveToProjectRoot": "Project root",
        "threads.size": "Size",
        "threads.syncFromServer": "Sync from server",
        "threads.pin": "Pin",
        "threads.unpin": "Unpin",
        "threads.delete": "Delete",
        "sidebar.sessionActionsGroup": "New session",
        "sidebar.newSharedSession": "Shared Session",
        "sidebar.workspaceActionsGroup": "Workspace actions",
        "sidebar.setWorkspaceAlias": "Set alias",
        "workspace.engineClaudeCode": "Claude Code",
        "workspace.engineCodex": "Codex",
        "workspace.engineOpenCode": "OpenCode",
        "workspace.engineGemini": "Gemini",
        "workspace.engineStatusLoading": "Checking...",
        "workspace.engineStatusRequiresLogin": "Sign in required",
        "threads.reloadThreads": "Reload threads",
        "sidebar.removeWorkspace": "Remove workspace",
        "sidebar.newWorktreeAgent": "New worktree agent",
        "sidebar.newCloneAgent": "New clone agent",
        "common.refresh": "Refresh",
        "sidebar.cliNotInstalled": "CLI not installed",
      };
      return dict[key] ?? key;
    },
  }),
}));

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: vi.fn(
      async ({
        items,
      }: {
        items: Array<{ text: string; enabled?: boolean; action?: () => Promise<void> | void }>;
      }) => ({
        popup: vi.fn(async () => {
          await mockMenuPopup(items);
        }),
      }),
    ),
  },
  MenuItem: { new: vi.fn(async (options: Record<string, unknown>) => options) },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ scaleFactor: () => 1 }),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  LogicalPosition: class LogicalPosition {
    x: number;
    y: number;
    constructor(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
}));

vi.mock("../../../services/tauri", () => ({
  getOpenCodeProviderHealth: vi.fn(),
}));
vi.mock("../../../services/globalRuntimeNotices", () => ({
  pushGlobalRuntimeNotice: vi.fn(),
}));

const getOpenCodeProviderHealthMock = vi.mocked(getOpenCodeProviderHealth);
const pushGlobalRuntimeNoticeMock = vi.mocked(pushGlobalRuntimeNotice);

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "mossx",
  path: "/tmp/mossx",
  connected: true,
  kind: "main",
  settings: {
    sidebarCollapsed: false,
    worktreeSetupScript: null,
  },
};

function createHandlers() {
  const engineOptions: EngineDisplayInfo[] = [
    {
      type: "claude",
      displayName: "Claude Code",
      shortName: "Claude Code",
      installed: true,
      version: "1.0.0",
      error: null,
      availabilityState: "ready",
      availabilityLabelKey: null,
    },
    {
      type: "codex",
      displayName: "Codex",
      shortName: "Codex",
      installed: true,
      version: "1.0.0",
      error: null,
      availabilityState: "ready",
      availabilityLabelKey: null,
    },
    {
      type: "opencode",
      displayName: "OpenCode",
      shortName: "OpenCode",
      installed: true,
      version: "1.4.4",
      error: null,
      availabilityState: "ready",
      availabilityLabelKey: null,
    },
    {
      type: "gemini",
      displayName: "Gemini",
      shortName: "Gemini",
      installed: true,
      version: "1.0.0",
      error: null,
      availabilityState: "ready",
      availabilityLabelKey: null,
    },
  ];

  return {
    onAddAgent: vi.fn(),
    engineOptions,
    enabledEngines: {
      gemini: true,
      opencode: true,
    } as Partial<Record<EngineType, boolean>>,
    onRefreshEngineOptions: vi.fn<
      () => Promise<EngineRefreshResult | void>
    >(async () => undefined),
    onAddSharedAgent: vi.fn(),
    onDeleteThread: vi.fn(),
    onSyncThread: vi.fn(),
    onPinThread: vi.fn(),
    onUnpinThread: vi.fn(),
    isThreadPinned: vi.fn(() => false),
    isThreadAutoNaming: vi.fn(() => false),
    onRenameThread: vi.fn(),
    onAutoNameThread: vi.fn(),
    onMoveThreadToFolder: vi.fn(),
    onReloadWorkspaceThreads: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onDeleteWorktree: vi.fn(),
    onRenameWorkspaceAlias: vi.fn(),
    onAddWorktreeAgent: vi.fn(),
    onAddCloneAgent: vi.fn(),
  };
}

describe("useSidebarMenus", () => {
  beforeEach(() => {
    mockMenuPopup.mockReset();
    pushGlobalRuntimeNoticeMock.mockReset();
    getOpenCodeProviderHealthMock.mockReset();
    getOpenCodeProviderHealthMock.mockResolvedValue({
      provider: "openai",
      connected: true,
      credentialCount: 1,
      matched: true,
      authenticatedProviders: ["openai"],
      error: null,
    });
  });

  it("shows loading hint when engine detection is still pending", () => {
    const handlers = createHandlers();
    handlers.engineOptions = handlers.engineOptions.map((engine) => ({
      ...engine,
      availabilityState: "loading",
      availabilityLabelKey: "workspace.engineStatusLoading",
      installed: false,
      version: null,
    }));
    const { result } = renderHook(() => useSidebarMenus(handlers));

    act(() => {
      const event = {
        clientX: 160,
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const claudeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-claude");

    expect(claudeAction?.unavailable).toBe(true);
    expect(claudeAction?.statusLabel).toBe("Checking...");
  });

  it("rewrites session menu actions after engine availability finishes loading", async () => {
    const handlers = createHandlers();
    handlers.engineOptions = [];

    const { result, rerender } = renderHook(
      (nextHandlers: ReturnType<typeof createHandlers>) => useSidebarMenus(nextHandlers),
      { initialProps: handlers },
    );

    act(() => {
      const event = {
        clientX: 160,
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const initialClaudeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-claude");

    expect(initialClaudeAction?.unavailable).toBe(true);

    await act(async () => {
      rerender(createHandlers());
    });

    const updatedClaudeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-claude");

    expect(updatedClaudeAction?.unavailable).toBe(false);
    expect(updatedClaudeAction?.statusLabel).toBeNull();
  });

  it("refreshes a single engine action without closing the menu", async () => {
    const handlers = createHandlers();
    handlers.engineOptions = [];
    let rerenderHook:
      | ((nextHandlers: ReturnType<typeof createHandlers>) => void)
      | null = null;
    handlers.onRefreshEngineOptions = vi.fn(async () => {
      rerenderHook?.(createHandlers());
    });

    const { result, rerender } = renderHook(
      (nextHandlers: ReturnType<typeof createHandlers>) => useSidebarMenus(nextHandlers),
      { initialProps: handlers },
    );
    rerenderHook = rerender;

    act(() => {
      const event = {
        clientX: 160,
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const initialClaudeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-claude");

    expect(initialClaudeAction?.unavailable).toBe(true);
    expect(initialClaudeAction?.refreshable).toBe(true);

    await act(async () => {
      await initialClaudeAction?.onRefresh?.();
    });

    await waitFor(() => {
      const refreshedClaudeAction = result.current.workspaceMenuState?.groups
        .find((group) => group.id === "new-session")
        ?.actions.find((action) => action.id === "new-session-claude");

      expect(refreshedClaudeAction?.unavailable).toBe(false);
      expect(refreshedClaudeAction?.statusLabel).toBeNull();
    });

    expect(handlers.onRefreshEngineOptions).toHaveBeenCalledTimes(1);
    expect(pushGlobalRuntimeNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: "runtimeNotice.engine.checking",
        messageParams: { engine: "Claude Code" },
      }),
    );
    expect(result.current.workspaceMenuState?.workspaceId).toBe(workspace.id);
  });

  it.each([
    ["claude", "Claude Code", "new-session-claude"],
    ["codex", "Codex", "new-session-codex"],
    ["gemini", "Gemini", "new-session-gemini"],
  ] as const)(
    "keeps %s refresh result visible before parent engine props rerender",
    async (engineType, expectedLabel, actionId) => {
      const handlers = createHandlers();
      handlers.engineOptions = [];
      handlers.onRefreshEngineOptions = vi.fn(async () => ({
        activeEngine: "claude",
        availableEngines: [
          {
            type: engineType as EngineType,
            displayName: expectedLabel,
            shortName: expectedLabel,
            installed: true,
            version: "1.0.0",
            error: null,
            availabilityState: "ready" as const,
            availabilityLabelKey: null,
          },
        ],
      }));

      const { result } = renderHook(() => useSidebarMenus(handlers));

      act(() => {
        const event = {
          clientX: 160,
          clientY: 120,
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
        result.current.showWorkspaceMenu(event, workspace);
      });

      const engineAction = result.current.workspaceMenuState?.groups
        .find((group) => group.id === "new-session")
        ?.actions.find((action) => action.id === actionId);

      expect(engineAction?.unavailable).toBe(true);

      await act(async () => {
        await engineAction?.onRefresh?.();
      });

      const refreshedAction = result.current.workspaceMenuState?.groups
        .find((group) => group.id === "new-session")
        ?.actions.find((action) => action.id === actionId);

      expect(refreshedAction?.unavailable).toBe(false);
      expect(refreshedAction?.statusLabel).toBeNull();
      expect(handlers.onRefreshEngineOptions).toHaveBeenCalledTimes(1);
    },
  );

  it("does not auto-probe opencode login state when the menu opens or rerenders", async () => {
    const handlers = createHandlers();
    handlers.engineOptions = [];

    const { result, rerender } = renderHook(
      (nextHandlers: ReturnType<typeof createHandlers>) => useSidebarMenus(nextHandlers),
      { initialProps: handlers },
    );

    act(() => {
      const event = {
        clientX: 160,
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    rerender(createHandlers());

    const opencodeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-opencode");

    expect(opencodeAction?.unavailable).toBe(false);
    expect(opencodeAction?.statusLabel).toBeNull();
    expect(getOpenCodeProviderHealthMock).not.toHaveBeenCalled();
  });

  it("shows Gemini entry as available in workspace plus menu", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 160,
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(
        event,
        workspace,
      );
    });

    const groups = result.current.workspaceMenuState?.groups ?? [];
    const geminiAction = groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-gemini");

    expect(geminiAction?.label).toBe("Gemini");
    expect(geminiAction?.unavailable).toBe(false);
  });

  it("hides Gemini and OpenCode session entries when they are disabled in settings", async () => {
    const handlers = createHandlers();
    handlers.enabledEngines = {
      gemini: false,
      opencode: false,
    };
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 160,
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const sessionActions =
      result.current.workspaceMenuState?.groups.find((group) => group.id === "new-session")
        ?.actions ?? [];

    expect(sessionActions.map((action) => action.id)).not.toContain("new-session-gemini");
    expect(sessionActions.map((action) => action.id)).not.toContain("new-session-opencode");
  });

  it("triggers create action when Gemini entry is clicked", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 200,
        clientY: 200,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(
        event,
        workspace,
      );
    });

    const geminiAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-gemini");

    expect(geminiAction).toBeTruthy();
    act(() => {
      result.current.onWorkspaceMenuAction(geminiAction!);
    });

    expect(handlers.onAddAgent).toHaveBeenCalledTimes(1);
    expect(handlers.onAddAgent).toHaveBeenCalledWith(workspace, "gemini");
  });

  it("inserts thread size between Copy ID and Delete in the thread context menu", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 240,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showThreadMenu>[0];
      await result.current.showThreadMenu(
        event,
        "ws-1",
        "thread-1",
        true,
        1536,
      );
    });

    expect(mockMenuPopup).toHaveBeenCalledTimes(1);
    const items = mockMenuPopup.mock.calls[0]?.[0] ?? [];
    expect(items.map((item) => item.text)).toEqual([
      "Rename",
      "Auto name",
      "Sync from server",
      "Pin",
      "Copy ID",
      "Size: 1.5 KB",
      "Delete",
    ]);
    expect(items[5]?.enabled).toBe(false);
  });

  it("adds same-project folder move targets to the thread context menu", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 240,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showThreadMenu>[0];
      await result.current.showThreadMenu(
        event,
        "ws-1",
        "thread-1",
        true,
        undefined,
        [
          { folderId: null, label: "Project root" },
          { folderId: "folder-a", label: "Planning" },
        ],
        "folder-a",
      );
    });

    const items = mockMenuPopup.mock.calls[0]?.[0] ?? [];
    expect(items.map((item) => item.text)).toEqual([
      "Rename",
      "Auto name",
      "Sync from server",
      "Pin",
      "Copy ID",
      "Move to folder",
      "Project root",
      "Planning",
      "Delete",
    ]);
    expect(items[5]?.enabled).toBe(false);
    expect(items[7]?.enabled).toBe(false);

    await act(async () => {
      await items[6]?.action?.();
    });

    expect(handlers.onMoveThreadToFolder).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      null,
    );
  });

  it("triggers create action when Shared Session entry is clicked", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 180,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const sharedAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-shared");

    expect(sharedAction).toBeTruthy();
    act(() => {
      result.current.onWorkspaceMenuAction(sharedAction!);
    });

    expect(handlers.onAddSharedAgent).toHaveBeenCalledTimes(1);
    expect(handlers.onAddSharedAgent).toHaveBeenCalledWith(workspace);
  });

  it("triggers workspace alias action from the workspace menu", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 180,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const aliasAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "workspace-actions")
      ?.actions.find((action) => action.id === "rename-workspace-alias");

    expect(aliasAction?.label).toBe("Set alias");
    act(() => {
      result.current.onWorkspaceMenuAction(aliasAction!);
    });

    expect(handlers.onRenameWorkspaceAlias).toHaveBeenCalledTimes(1);
    expect(handlers.onRenameWorkspaceAlias).toHaveBeenCalledWith(workspace);
  });

  it("marks opencode as sign-in required only after manual refresh detects disconnection", async () => {
    getOpenCodeProviderHealthMock.mockResolvedValueOnce({
      provider: "openai",
      connected: false,
      credentialCount: 0,
      matched: false,
      authenticatedProviders: [],
      error: null,
    });
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 180,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const opencodeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-opencode");

    expect(opencodeAction?.unavailable).toBe(false);
    expect(opencodeAction?.statusLabel).toBeNull();

    await act(async () => {
      await opencodeAction?.onRefresh?.();
    });

    await waitFor(() => {
      const refreshedAction = result.current.workspaceMenuState?.groups
        .find((group) => group.id === "new-session")
        ?.actions.find((action) => action.id === "new-session-opencode");
      expect(refreshedAction?.unavailable).toBe(true);
      expect(refreshedAction?.statusLabel).toBe("Sign in required");
    });
  });

  it("manual opencode refresh probes login state once engine refresh reports it installed", async () => {
    getOpenCodeProviderHealthMock.mockResolvedValueOnce({
      provider: "openai",
      connected: false,
      credentialCount: 0,
      matched: false,
      authenticatedProviders: [],
      error: null,
    });
    const handlers = createHandlers();
    handlers.engineOptions = [];
    let rerenderHook:
      | ((nextHandlers: ReturnType<typeof createHandlers>) => void)
      | null = null;
    handlers.onRefreshEngineOptions = vi.fn(async () => {
      rerenderHook?.(createHandlers());
    });

    const { result, rerender } = renderHook(
      (nextHandlers: ReturnType<typeof createHandlers>) => useSidebarMenus(nextHandlers),
      { initialProps: handlers },
    );
    rerenderHook = rerender;

    act(() => {
      const event = {
        clientX: 160,
        clientY: 120,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const opencodeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-opencode");

    await act(async () => {
      await opencodeAction?.onRefresh?.();
    });

    await waitFor(() => {
      const refreshedAction = result.current.workspaceMenuState?.groups
        .find((group) => group.id === "new-session")
        ?.actions.find((action) => action.id === "new-session-opencode");
      expect(refreshedAction?.unavailable).toBe(true);
      expect(refreshedAction?.statusLabel).toBe("Sign in required");
    });

    expect(getOpenCodeProviderHealthMock).toHaveBeenCalledTimes(1);
  });

  it("does not leave opencode stuck in loading when manual provider health lookup fails", async () => {
    getOpenCodeProviderHealthMock.mockRejectedValueOnce(new Error("probe failed"));
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 180,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const opencodeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-opencode");

    await act(async () => {
      await opencodeAction?.onRefresh?.();
    });

    await waitFor(() => {
      const refreshedAction = result.current.workspaceMenuState?.groups
        .find((group) => group.id === "new-session")
        ?.actions.find((action) => action.id === "new-session-opencode");
      expect(refreshedAction?.unavailable).toBe(false);
      expect(refreshedAction?.statusLabel).toBeNull();
    });
  });

  it("does not let stale opencode health keep disconnected workspaces blocked", async () => {
    getOpenCodeProviderHealthMock.mockResolvedValueOnce({
      provider: "openai",
      connected: false,
      credentialCount: 0,
      matched: false,
      authenticatedProviders: [],
      error: null,
    });
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 180,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const opencodeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-opencode");

    await act(async () => {
      await opencodeAction?.onRefresh?.();
    });

    await waitFor(() => {
      const refreshedAction = result.current.workspaceMenuState?.groups
        .find((group) => group.id === "new-session")
        ?.actions.find((action) => action.id === "new-session-opencode");
      expect(refreshedAction?.unavailable).toBe(true);
    });

    act(() => {
      const event = {
        clientX: 200,
        clientY: 200,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, {
        ...workspace,
        connected: false,
      });
    });

    const disconnectedAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-opencode");

    expect(disconnectedAction?.unavailable).toBe(false);
    expect(disconnectedAction?.statusLabel).toBeNull();
  });

  it("opens workspace menu without auto-probing opencode health", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 180,
        clientY: 180,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceMenu>[0];
      result.current.showWorkspaceMenu(event, workspace);
    });

    const opencodeAction = result.current.workspaceMenuState?.groups
      .find((group) => group.id === "new-session")
      ?.actions.find((action) => action.id === "new-session-opencode");

    expect(opencodeAction?.unavailable).toBe(false);
    expect(opencodeAction?.statusLabel).toBeNull();
    expect(getOpenCodeProviderHealthMock).not.toHaveBeenCalled();
  });

  it("shows session-only menu for worktree plus entry", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    await act(async () => {
      const event = {
        clientX: 140,
        clientY: 96,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as Parameters<typeof result.current.showWorkspaceSessionMenu>[0];
      result.current.showWorkspaceSessionMenu(event, workspace);
    });

    expect(result.current.workspaceMenuState?.groups.map((group) => group.id)).toEqual([
      "new-session",
    ]);
    expect(
      result.current.workspaceMenuState?.groups[0]?.actions.map((action) => action.id),
    ).toEqual([
      "new-session-shared",
      "new-session-claude",
      "new-session-codex",
      "new-session-opencode",
      "new-session-gemini",
    ]);
  });
});
