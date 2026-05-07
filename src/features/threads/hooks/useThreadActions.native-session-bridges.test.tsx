// @vitest-environment jsdom
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  archiveThread,
  deleteCodexSession,
  deleteClaudeSession,
  deleteGeminiSession,
  deleteOpenCodeSession,
  connectWorkspace,
  createWorkspaceDirectory,
  getOpenCodeSessionList,
  listWorkspaceSessions,
  listClaudeSessions,
  listGeminiSessions,
  loadClaudeSession,
  loadGeminiSession,
  loadCodexSession,
  listThreadTitles,
  renameThreadTitleKey,
  setThreadTitle,
  listThreads,
  resumeThread,
  readWorkspaceFile,
  startThread,
  trashWorkspaceItem,
  writeWorkspaceFile,
} from "../../../services/tauri";
import { previewThreadName } from "../../../utils/threadItems";
import { loadSidebarSnapshot } from "../utils/sidebarSnapshot";
import {
  expectSetThreadsDispatched,
  renderActions,
  workspace,
} from "./useThreadActions.test-utils";

vi.mock("../../../services/tauri", () => ({
  startThread: vi.fn(),
  connectWorkspace: vi.fn(),
  createWorkspaceDirectory: vi.fn(),
  forkClaudeSession: vi.fn(),
  forkClaudeSessionFromMessage: vi.fn(),
  forkThread: vi.fn(),
  rewindCodexThread: vi.fn(),
  listClaudeSessions: vi.fn(),
  listGeminiSessions: vi.fn(),
  getOpenCodeSessionList: vi.fn(),
  listWorkspaceSessions: vi.fn(),
  loadClaudeSession: vi.fn(),
  loadGeminiSession: vi.fn(),
  loadCodexSession: vi.fn(),
  listThreadTitles: vi.fn(),
  readWorkspaceFile: vi.fn(),
  renameThreadTitleKey: vi.fn(),
  setThreadTitle: vi.fn(),
  resumeThread: vi.fn(),
  listThreads: vi.fn(),
  archiveThread: vi.fn(),
  deleteCodexSession: vi.fn(),
  deleteClaudeSession: vi.fn(),
  deleteGeminiSession: vi.fn(),
  deleteOpenCodeSession: vi.fn(),
  trashWorkspaceItem: vi.fn(),
  writeWorkspaceFile: vi.fn(),
}));

vi.mock("../../../utils/threadItems", () => ({
  buildItemsFromThread: vi.fn(),
  extractClaudeApprovalResumeEntries: vi.fn(() => []),
  getThreadTimestamp: vi.fn(),
  isReviewingFromThread: vi.fn(),
  mergeThreadItems: vi.fn(),
  previewThreadName: vi.fn(),
  stripClaudeApprovalResumeArtifacts: vi.fn((text: string) => text),
}));

vi.mock("../utils/threadStorage", () => ({
  makeCustomNameKey: (workspaceId: string, threadId: string) =>
    `${workspaceId}:${threadId}`,
  saveThreadActivity: vi.fn(),
}));

vi.mock("../utils/sidebarSnapshot", () => ({
  loadSidebarSnapshot: vi.fn(() => null),
}));

describe("useThreadActions native session bridges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(listThreadTitles).mockResolvedValue({});
    vi.mocked(listGeminiSessions).mockResolvedValue([]);
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);
    vi.mocked(listWorkspaceSessions).mockResolvedValue({
      data: [],
      nextCursor: null,
      partialSource: null,
    });
    vi.mocked(renameThreadTitleKey).mockResolvedValue(undefined);
    vi.mocked(setThreadTitle).mockResolvedValue("title");
    vi.mocked(connectWorkspace).mockResolvedValue(undefined);
    vi.mocked(createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(previewThreadName).mockImplementation(
      (text: string, fallback: string) => {
        const trimmed = text.trim();
        return trimmed || fallback;
      },
    );
    vi.mocked(deleteClaudeSession).mockResolvedValue(undefined);
    vi.mocked(deleteGeminiSession).mockResolvedValue(undefined);
    vi.mocked(deleteOpenCodeSession).mockResolvedValue({
      deleted: true,
      method: "filesystem",
    });
    vi.mocked(deleteCodexSession).mockResolvedValue({
      deleted: true,
      deletedCount: 1,
      method: "filesystem",
      archivedBeforeDelete: true,
    });
    vi.mocked(loadGeminiSession).mockResolvedValue({ messages: [] });
    vi.mocked(loadCodexSession).mockResolvedValue({ messages: [] });
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "",
      truncated: false,
    });
    vi.mocked(startThread).mockResolvedValue({
      result: { thread: { id: "thread-1" } },
    });
    vi.mocked(archiveThread).mockResolvedValue({ archivedCount: 1 });
    vi.mocked(trashWorkspaceItem).mockResolvedValue(undefined);
    vi.mocked(writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(loadSidebarSnapshot).mockReturnValue(null);
  });

  it("falls back to claude sessions when codex thread list remains not connected after retry", async () => {
    vi.mocked(listThreads)
      .mockRejectedValueOnce(new Error("workspace not connected"))
      .mockRejectedValueOnce(new Error("workspace not connected"));
    vi.mocked(listClaudeSessions).mockResolvedValue([
      {
        sessionId: "claude-fallback-1",
        firstMessage: "Claude recovered history",
        updatedAt: 1_730_100_000_000,
      },
    ]);
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(connectWorkspace).toHaveBeenCalledWith("ws-1", "thread-list-live");
    expect(listThreads).toHaveBeenCalledTimes(2);
    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "claude:claude-fallback-1",
        name: "Claude recovered history",
        updatedAt: 1_730_100_000_000,
        engineSource: "claude",
      },
    ]);
  });

  it("merges active codex catalog sessions into sidebar threads when live codex list is unavailable", async () => {
    vi.mocked(listThreads)
      .mockRejectedValueOnce(new Error("workspace not connected"))
      .mockRejectedValueOnce(new Error("workspace not connected"));
    vi.mocked(listClaudeSessions).mockResolvedValue([
      {
        sessionId: "claude-fallback-1",
        firstMessage: "Claude recovered history",
        updatedAt: 1_730_100_000_000,
      },
    ]);
    vi.mocked(listWorkspaceSessions).mockImplementation(async (_workspaceId, options) => {
      if (options?.query?.status === "active") {
        return {
          data: [
            {
              sessionId: "codex-history-1",
              workspaceId: "ws-1",
              engine: "codex",
              title: "Generate a concise git commit message for the following changes.",
              updatedAt: 1_730_200_000_000,
              archivedAt: null,
              threadKind: "native",
              source: "mossx",
              provider: "openai",
              sourceLabel: "mossx/openai",
            },
          ],
          nextCursor: null,
          partialSource: null,
        };
      }
      return {
        data: [],
        nextCursor: null,
        partialSource: null,
      };
    });
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(connectWorkspace).toHaveBeenCalledWith("ws-1", "thread-list-live");
    expect(listWorkspaceSessions).toHaveBeenCalledWith("ws-1", {
      query: { status: "active" },
      cursor: null,
      limit: 200,
    });
    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "codex-history-1",
        name: "Generate a concise git commit message for the following changes.",
        updatedAt: 1_730_200_000_000,
        engineSource: "codex",
        source: "mossx",
        provider: "openai",
        sourceLabel: "mossx/openai",
      },
      {
        id: "claude:claude-fallback-1",
        name: "Claude recovered history",
        updatedAt: 1_730_100_000_000,
        engineSource: "claude",
      },
    ]);
  });

  it("keeps slower codex catalog scans visible in the sidebar", async () => {
    vi.useFakeTimers();
    vi.mocked(listThreads)
      .mockRejectedValueOnce(new Error("workspace not connected"))
      .mockRejectedValueOnce(new Error("workspace not connected"));
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);
    vi.mocked(listWorkspaceSessions).mockImplementation(async (_workspaceId, options) => {
      if (options?.query?.status === "active") {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return {
          data: [
            {
              sessionId: "codex-history-slow",
              workspaceId: "ws-1",
              engine: "codex",
              title: "最近对话你什么时候加进来的.还是显示出来的.之前这里没有才对啊.",
              updatedAt: 1_730_300_000_000,
              archivedAt: null,
              threadKind: "native",
              source: "mossx",
              provider: "openai",
              sourceLabel: "mossx/openai",
            },
          ],
          nextCursor: null,
          partialSource: null,
        };
      }
      return {
        data: [],
        nextCursor: null,
        partialSource: null,
      };
    });

    const { result, dispatch } = renderActions();

    const refreshPromise = result.current.listThreadsForWorkspace(workspace);
    const onSettled = vi.fn();
    void refreshPromise.then(onSettled);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(onSettled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    await refreshPromise;

    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "codex-history-slow",
        name: "最近对话你什么时候加进来的.还是显示出来的.之前这里没有才对啊.",
        updatedAt: 1_730_300_000_000,
        engineSource: "codex",
        source: "mossx",
        provider: "openai",
        sourceLabel: "mossx/openai",
      },
    ]);
  });

  it("refreshes gemini sessions on cold start without gemini signal", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);
    vi.mocked(listGeminiSessions).mockResolvedValue([
      {
        sessionId: "ses_gemini_1",
        firstMessage: "Gemini Hello",
        updatedAt: 1_730_000_100_000,
      },
    ]);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(listGeminiSessions).toHaveBeenCalledWith("/tmp/codex", 50);
      expectSetThreadsDispatched(dispatch, "ws-1", [
        {
          id: "gemini:ses_gemini_1",
          name: "Gemini Hello",
          updatedAt: 1_730_000_100_000,
          engineSource: "gemini",
        },
      ]);
    });
  });

  it("normalizes gemini session summaries with snake_case fields", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);
    vi.mocked(listGeminiSessions).mockResolvedValue([
      {
        session_id: "ses_gemini_snake_1",
        first_message: "Gemini Snake",
        updated_at: 1_730_000_200_000,
        file_size_bytes: 2_048,
      },
    ]);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expectSetThreadsDispatched(dispatch, "ws-1", [
        {
          id: "gemini:ses_gemini_snake_1",
          name: "Gemini Snake",
          updatedAt: 1_730_000_200_000,
          sizeBytes: 2_048,
          engineSource: "gemini",
        },
      ]);
    });
  });

  it("routes opencode hard delete to backend adapter", async () => {
    const { result } = renderActions();

    await act(async () => {
      await result.current.deleteThreadForWorkspace("ws-1", "opencode:ses_opc_1");
    });

    expect(archiveThread).not.toHaveBeenCalled();
    expect(deleteOpenCodeSession).toHaveBeenCalledWith("ws-1", "ses_opc_1");
  });

  it("routes codex delete to filesystem delete instead of archive", async () => {
    const { result } = renderActions();

    await act(async () => {
      await result.current.deleteThreadForWorkspace(
        "ws-1",
        "019d767b-5541-7010-a30d-a454864bccd8",
      );
    });

    expect(archiveThread).not.toHaveBeenCalled();
    expect(deleteCodexSession).toHaveBeenCalledWith(
      "ws-1",
      "019d767b-5541-7010-a30d-a454864bccd8",
    );
  });

  it("keeps deleted claude sessions absent after reload", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);
    vi.mocked(listClaudeSessions)
      .mockResolvedValueOnce([
        {
          sessionId: "session-delete-me",
          firstMessage: "Delete me",
          updatedAt: 1_730_000_000_000,
        },
      ])
      .mockResolvedValueOnce([]);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    await act(async () => {
      await result.current.deleteThreadForWorkspace("ws-1", "claude:session-delete-me");
    });

    expect(deleteClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-delete-me");

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    const setThreadsActions = dispatch.mock.calls
      .map(([action]) => action)
      .filter((action) => action.type === "setThreads");
    expect(setThreadsActions.length).toBeGreaterThanOrEqual(2);
    expect(setThreadsActions[0]).toEqual(
      expect.objectContaining({
        type: "setThreads",
        workspaceId: "ws-1",
        threads: [
          expect.objectContaining({
            id: "claude:session-delete-me",
            name: "Delete me",
            updatedAt: 1_730_000_000_000,
            engineSource: "claude",
          }),
        ],
      }),
    );
    expect(setThreadsActions[setThreadsActions.length - 1]).toEqual({
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [],
    });
  });

  it("skips claude history reload while turn is processing and local items exist", async () => {
    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "reasoning-live-1",
            kind: "reasoning",
            summary: "正在分析",
            content: "正在分析",
          },
        ],
      },
      threadStatusById: {
        "claude:session-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: Date.now(),
          lastDurationMs: null,
          heartbeatPulse: 1,
        },
      },
    });

    let resumed: string | null = null;
    await act(async () => {
      resumed = await result.current.resumeThreadForWorkspace(
        "ws-1",
        "claude:session-1",
      );
    });

    expect(resumed).toBe("claude:session-1");
    expect(loadClaudeSession).not.toHaveBeenCalled();
    expect(resumeThread).not.toHaveBeenCalled();
  });

  it("maps Claude tool_result to terminal status", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: { data: [], nextCursor: null },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(loadClaudeSession).mockResolvedValue({
      messages: [
        {
          id: "tool-1",
          kind: "tool",
          toolType: "Read",
          title: "Read",
          text: '{"file_path":"README.md"}',
        },
        {
          id: "tool-1-result",
          kind: "tool",
          toolType: "result",
          title: "Result",
          text: "",
        },
        {
          id: "tool-2",
          kind: "tool",
          toolType: "Bash",
          title: "Bash",
          text: '{"command":"echo ok"}',
        },
        {
          id: "tool-2-result",
          kind: "tool",
          toolType: "error",
          title: "Error",
          text: "permission denied",
        },
      ],
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    dispatch.mockClear();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "claude:session-1");
    });

    expect(loadClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-1");

    const setThreadItemsCall = dispatch.mock.calls.find(
      ([action]) =>
        action.type === "setThreadItems" && action.threadId === "claude:session-1",
    );
    expect(setThreadItemsCall).toBeTruthy();

    const action = setThreadItemsCall?.[0] as
      | { items?: ConversationItem[] }
      | undefined;
    const toolItems = (action?.items ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "tool" }> =>
        item.kind === "tool",
    );

    expect(toolItems).toHaveLength(2);
    expect(toolItems[0]).toEqual(
      expect.objectContaining({
        id: "tool-1",
        status: "completed",
      }),
    );
    expect(toolItems[1]).toEqual(
      expect.objectContaining({
        id: "tool-2",
        status: "failed",
        output: "permission denied",
      }),
    );
  });
});
