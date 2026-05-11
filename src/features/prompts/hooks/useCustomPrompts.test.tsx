// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import {
  createPrompt,
  getGlobalPromptsDir,
  getPromptsList,
} from "../../../services/tauri";
import { useCustomPrompts } from "./useCustomPrompts";

vi.mock("../../../services/tauri", () => ({
  createPrompt: vi.fn(),
  deletePrompt: vi.fn(),
  getPromptsList: vi.fn(),
  getGlobalPromptsDir: vi.fn(),
  getWorkspacePromptsDir: vi.fn(),
  movePrompt: vi.fn(),
  updatePrompt: vi.fn(),
}));

const getGlobalPromptsDirMock = vi.mocked(getGlobalPromptsDir);
const getPromptsListMock = vi.mocked(getPromptsList);
const createPromptMock = vi.mocked(createPrompt);

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Workspace",
  path: "/tmp/workspace",
  connected: false,
  settings: { sidebarCollapsed: false },
};

describe("useCustomPrompts", () => {
  it("returns null when no workspace is selected", async () => {
    const { result } = renderHook(() =>
      useCustomPrompts({ activeWorkspace: null }),
    );

    let path: string | null = "unset";
    await act(async () => {
      path = await result.current.getGlobalPromptsDir();
    });

    expect(path).toBeNull();
    expect(getGlobalPromptsDirMock).not.toHaveBeenCalled();
  });

  it("requests the global prompts dir when a workspace is selected", async () => {
    getGlobalPromptsDirMock.mockResolvedValue("/tmp/.codex/prompts");
    const { result } = renderHook(() =>
      useCustomPrompts({ activeWorkspace: workspace }),
    );

    let path: string | null = null;
    await act(async () => {
      path = await result.current.getGlobalPromptsDir();
    });

    expect(getGlobalPromptsDirMock).toHaveBeenCalledWith("ws-1");
    expect(path).toBe("/tmp/.codex/prompts");
  });

  it("refreshes sibling prompt hooks after prompt creation", async () => {
    getPromptsListMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          path: "/tmp/workspace/.ccgui/prompts/review.md",
          name: "review",
          content: "review prompt",
          description: "代码评审",
          argumentHint: undefined,
          scope: "workspace",
        },
      ]);
    createPromptMock.mockResolvedValue({
      path: "/tmp/workspace/.ccgui/prompts/review.md",
      name: "review",
      content: "review prompt",
      description: "代码评审",
      argumentHint: undefined,
      scope: "workspace",
    });

    const connectedWorkspace = { ...workspace, connected: true };
    const first = renderHook(() =>
      useCustomPrompts({ activeWorkspace: connectedWorkspace }),
    );
    const second = renderHook(() =>
      useCustomPrompts({ activeWorkspace: connectedWorkspace }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await first.result.current.createPrompt({
        scope: "workspace",
        name: "review",
        content: "review prompt",
      });
    });

    expect(first.result.current.prompts).toEqual([
      expect.objectContaining({ name: "review" }),
    ]);
    expect(second.result.current.prompts).toEqual([
      expect.objectContaining({ name: "review" }),
    ]);
    expect(getPromptsListMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
