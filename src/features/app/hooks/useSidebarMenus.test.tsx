// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useSidebarMenus } from "./useSidebarMenus";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "sidebar.sessionActionsGroup": "New session",
        "sidebar.workspaceActionsGroup": "Workspace actions",
        "workspace.engineClaudeCode": "Claude Code",
        "workspace.engineCodex": "Codex",
        "workspace.engineOpenCode": "OpenCode",
        "workspace.engineGemini": "Gemini",
        "threads.reloadThreads": "Reload threads",
        "sidebar.removeWorkspace": "Remove workspace",
        "sidebar.newWorktreeAgent": "New worktree agent",
        "sidebar.newCloneAgent": "New clone agent",
      };
      return dict[key] ?? key;
    },
  }),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "codemoss",
  path: "/tmp/codemoss",
  connected: true,
  kind: "main",
  settings: {
    sidebarCollapsed: false,
    worktreeSetupScript: null,
  },
};

function createHandlers() {
  return {
    onAddAgent: vi.fn(),
    onDeleteThread: vi.fn(),
    onSyncThread: vi.fn(),
    onPinThread: vi.fn(),
    onUnpinThread: vi.fn(),
    isThreadPinned: vi.fn(() => false),
    isThreadAutoNaming: vi.fn(() => false),
    onRenameThread: vi.fn(),
    onAutoNameThread: vi.fn(),
    onReloadWorkspaceThreads: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onDeleteWorktree: vi.fn(),
    onAddWorktreeAgent: vi.fn(),
    onAddCloneAgent: vi.fn(),
  };
}

describe("useSidebarMenus", () => {
  it("marks Gemini entry as unavailable in workspace plus menu", () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    act(() => {
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
    expect(geminiAction?.unavailable).toBe(true);
  });

  it("does not trigger create action when unavailable entry is clicked", () => {
    const handlers = createHandlers();
    const { result } = renderHook(() => useSidebarMenus(handlers));

    act(() => {
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

    expect(handlers.onAddAgent).not.toHaveBeenCalled();
  });
});
