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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "threads.rename": "Rename",
        "threads.autoName": "Auto name",
        "threads.autoNaming": "Auto naming",
        "threads.archive": "Archive",
        "threads.copyId": "Copy ID",
        "threads.copyClaudeResumeCommand": "Copy Claude resume command",
        "threads.openClaudeTui": "Open in Claude TUI",
        "threads.claudeResumeCommandHelp":
          "Use claude --resume <session_id> or /resume <session_id>.",
        "threads.moveToFolder": "Move to folder",
        "threads.moveToProjectRoot": "Project root",
        "threads.searchFolderTargets": "Search folders...",
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
    onArchiveThread: vi.fn(),
    onSyncThread: vi.fn(),
    onPinThread: vi.fn(),
    onUnpinThread: vi.fn(),
    isThreadPinned: vi.fn(() => false),
    isThreadAutoNaming: vi.fn(() => false),
    onRenameThread: vi.fn(),
    onAutoNameThread: vi.fn(),
    onMoveThreadToFolder: vi.fn(),
    onOpenThreadFolderPicker: vi.fn(),
    onOpenClaudeTui: vi.fn(),
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
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
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

  it("places archive before size and delete in the thread context menu", async () => {
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

    const items = result.current.sidebarContextMenuState?.items ?? [];
    expect(items.map((item) => item.type === "separator" ? "---" : item.label)).toEqual([
      "Rename",
      "Auto name",
      "Sync from server",
      "Pin",
      "Copy ID",
      "Archive",
      "Size: 1.5 KB",
      "Delete",
    ]);
    expect(items[6]?.type).toBe("label");
  });

  it("archives a thread from the thread context menu", async () => {
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
        "claude:thread-1",
        true,
        undefined,
        [],
        null,
        true,
        "/tmp/mossx",
      );
    });

    const items = result.current.sidebarContextMenuState?.items ?? [];
    expect(items.map((item) => item.type === "separator" ? "---" : item.label)).toEqual([
      "Rename",
      "Auto name",
      "Pin",
      "Copy ID",
      "Open in Claude TUI",
      "Copy Claude resume command",
      "Use claude --resume <session_id> or /resume <session_id>.",
      "Archive",
      "Delete",
    ]);

    await act(async () => {
      if (items[7]?.type === "item") {
        await items[7].onSelect();
      }
    });

    expect(handlers.onArchiveThread).toHaveBeenCalledWith(
      "ws-1",
      "claude:thread-1",
    );
  });

  it("copies Claude resume commands and keeps Copy ID bare", async () => {
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
        "claude:session-1",
        true,
        undefined,
        [],
        null,
        true,
        "/tmp/My Project",
      );
    });

    const items = result.current.sidebarContextMenuState?.items ?? [];
    const copyIdAction = items.find((item) => item.type === "item" && item.id === "copy-id");
    const copyResumeAction = items.find(
      (item) => item.type === "item" && item.id === "copy-claude-resume-command",
    );

    await act(async () => {
      if (copyIdAction?.type === "item") {
        await copyIdAction.onSelect();
      }
    });
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("session-1");

    await act(async () => {
      if (copyResumeAction?.type === "item") {
        await copyResumeAction.onSelect();
      }
    });
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      "cd '/tmp/My Project' && claude --resume 'session-1'",
    );
    expect(pushGlobalRuntimeNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messageKey: "runtimeNotice.claude.resumeCommandCopied",
        messageParams: { sessionId: "session-1" },
      }),
    );
  });

  it("opens finalized Claude threads in Claude TUI with workspace and native session id", async () => {
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
        "claude:session-1",
        true,
        undefined,
        [],
        null,
        true,
        "/tmp/mossx",
      );
    });

    const openAction = result.current.sidebarContextMenuState?.items.find(
      (item) => item.type === "item" && item.id === "open-claude-tui",
    );
    await act(async () => {
      if (openAction?.type === "item") {
        await openAction.onSelect();
      }
    });

    expect(handlers.onOpenClaudeTui).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workspacePath: "/tmp/mossx",
      sessionId: "session-1",
    });
  });

  it("suppresses Claude TUI resume actions for pending and non-Claude thread ids", async () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    for (const threadId of ["claude-pending-1", "codex:thread-1"]) {
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
          threadId,
          true,
          undefined,
          [],
          null,
          true,
          "/tmp/mossx",
        );
      });

      const itemIds = (result.current.sidebarContextMenuState?.items ?? [])
        .filter((item) => item.type === "item")
        .map((item) => item.id);
      expect(itemIds).not.toContain("open-claude-tui");
      expect(itemIds).not.toContain("copy-claude-resume-command");
    }
  });

  it("hides archive for unsupported thread context menu targets", async () => {
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
        "shared:thread-1",
        true,
        undefined,
        [],
        null,
        false,
      );
    });

    const items = result.current.sidebarContextMenuState?.items ?? [];
    expect(items.map((item) => item.type === "separator" ? "---" : item.label)).toEqual([
      "Rename",
      "Auto name",
      "Sync from server",
      "Pin",
      "Copy ID",
      "Delete",
    ]);
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

    const items = result.current.sidebarContextMenuState?.items ?? [];
    expect(items.map((item) => item.type === "separator" ? "---" : item.label)).toEqual([
      "Rename",
      "Auto name",
      "Sync from server",
      "Pin",
      "Copy ID",
      "Archive",
      "Move to folder",
      "Project root",
      "Planning",
      "Delete",
    ]);
    expect(items[6]?.type).toBe("label");
    expect(items[8]?.type === "item" ? items[8].disabled : false).toBe(true);

    await act(async () => {
      if (items[7]?.type === "item") {
        await items[7].onSelect();
      }
    });

    expect(handlers.onMoveThreadToFolder).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      null,
    );
  });

  it("uses a searchable folder picker entry for large move target lists", async () => {
    const handlers = createHandlers();
    const targets = [
      { folderId: null, label: "Project root" },
      ...Array.from({ length: 13 }, (_, index) => ({
        folderId: `folder-${index + 1}`,
        label: `Folder ${index + 1}`,
      })),
    ];
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
        targets,
        "folder-7",
      );
    });

    const items = result.current.sidebarContextMenuState?.items ?? [];
    expect(items.map((item) => item.type === "separator" ? "---" : item.label)).toEqual([
      "Rename",
      "Auto name",
      "Sync from server",
      "Pin",
      "Copy ID",
      "Archive",
      "Move to folder",
      "Search folders...",
      "Delete",
    ]);

    await act(async () => {
      if (items[7]?.type === "item") {
        await items[7].onSelect();
      }
    });

    expect(handlers.onOpenThreadFolderPicker).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      targets,
      "folder-7",
    );
    expect(handlers.onMoveThreadToFolder).not.toHaveBeenCalled();
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
