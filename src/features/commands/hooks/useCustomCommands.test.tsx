/** @vitest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClaudeCommandsList, getOpenCodeCommandsList } from "../../../services/tauri";
import { useCustomCommands } from "./useCustomCommands";

vi.mock("../../../services/tauri", () => ({
  getClaudeCommandsList: vi.fn(),
  getOpenCodeCommandsList: vi.fn(),
}));

describe("useCustomCommands", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes workspace id to claude commands and normalizes source", async () => {
    vi.mocked(getClaudeCommandsList).mockResolvedValue([
      {
        name: "/open-spec:apply",
        path: "/repo/.claude/commands/open-spec/apply.md",
        description: "apply change",
        source: "project_claude",
        content: "body",
      },
    ]);

    const { result } = renderHook(() =>
      useCustomCommands({
        activeEngine: "claude",
        workspaceId: "workspace-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.commands).toHaveLength(1);
    });

    expect(getClaudeCommandsList).toHaveBeenCalledWith("workspace-1");
    expect(result.current.commands[0]).toMatchObject({
      name: "open-spec:apply",
      source: "project_claude",
    });
  });

  it("uses opencode command list when active engine is opencode", async () => {
    vi.mocked(getOpenCodeCommandsList).mockResolvedValue([
      {
        name: "status",
        path: "",
        description: "Show status",
        content: "",
      },
    ]);

    const { result } = renderHook(() =>
      useCustomCommands({
        activeEngine: "opencode",
        workspaceId: "workspace-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.commands).toHaveLength(1);
    });

    expect(getClaudeCommandsList).not.toHaveBeenCalled();
    expect(getOpenCodeCommandsList).toHaveBeenCalled();
  });
});
