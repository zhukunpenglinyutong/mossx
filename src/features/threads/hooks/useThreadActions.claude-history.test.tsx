// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { renderActions, workspace } from "./useThreadActions.test-utils";

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

describe("useThreadActions Claude history refresh", () => {
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

  it("skips claude history reload when local realtime items already exist after session rename", async () => {
    const { result, loadedThreadsRef } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-1",
            kind: "message",
            role: "user",
            text: "你好",
          },
          {
            id: "assistant-1",
            kind: "message",
            role: "assistant",
            text: "你好，我在。",
          },
        ],
      },
      threadStatusById: {
        "claude:session-1": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: 1200,
          heartbeatPulse: 0,
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
    expect(loadedThreadsRef.current["claude:session-1"]).toBe(true);
  });

  it("forces claude history reload on refresh even when the thread was already loaded", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: { data: [], nextCursor: null },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          id: "user-history-1",
          role: "user",
          text: "继续",
        },
        {
          kind: "message",
          id: "assistant-history-1",
          role: "assistant",
          text: "这是历史对齐后的最终正文。",
        },
      ],
    });

    const { result, dispatch, loadedThreadsRef } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "assistant-live-1",
            kind: "message",
            role: "assistant",
            text: "重复的实时正文重复的实时正文",
          },
        ],
      },
    });
    loadedThreadsRef.current["claude:session-1"] = true;

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    await act(async () => {
      await result.current.refreshThread("ws-1", "claude:session-1");
    });

    expect(loadClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-1");
    expect(resumeThread).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadItems",
      threadId: "claude:session-1",
      items: expect.any(Array),
    });
  });

  it("hydrates transcript-heavy claude history rows on refresh", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: { data: [], nextCursor: null },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "reasoning",
          id: "reason-history-1",
          text: "先理解项目结构",
        },
        {
          kind: "tool",
          id: "tool-history-1",
          tool_name: "Bash",
          tool_input: {
            command: "ls -la",
          },
        },
        {
          kind: "tool",
          id: "tool-history-1-result",
          toolType: "result",
          text: "",
          tool_output: {
            output: "README.md\nsrc\n",
          },
        },
      ],
    });

    const { result, dispatch, loadedThreadsRef } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "assistant-live-1",
            kind: "message",
            role: "assistant",
            text: "已有可读内容",
          },
        ],
      },
    });
    loadedThreadsRef.current["claude:session-1"] = true;

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    await act(async () => {
      await result.current.refreshThread("ws-1", "claude:session-1");
    });

    expect(loadClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-1");
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadItems",
      threadId: "claude:session-1",
      items: expect.arrayContaining([
        expect.objectContaining({
          kind: "reasoning",
          id: "reason-history-1",
        }),
        expect.objectContaining({
          kind: "tool",
          id: "tool-history-1",
        }),
      ]),
    });
  });

  it("reconciles missing claude history entries instead of marking them loaded", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: { data: [], nextCursor: null },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(loadClaudeSession).mockRejectedValue(
      new Error("[SESSION_NOT_FOUND] Session file not found: session-missing"),
    );

    const { result, dispatch, loadedThreadsRef } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:session-missing",
            name: "Missing Claude",
            updatedAt: 1_730_000_000_000,
            engineSource: "claude",
            threadKind: "native",
          },
        ],
      },
      activeThreadIdByWorkspace: {
        "ws-1": "claude:session-missing",
      },
      userInputRequests: [
        {
          workspace_id: "ws-1",
          request_id: "user-input-1",
          params: {
            thread_id: "claude:session-missing",
            turn_id: "turn-1",
            item_id: "item-1",
            questions: [],
          },
        },
      ],
    });

    let resumed: string | null = null;
    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    await act(async () => {
      resumed = await result.current.refreshThread(
        "ws-1",
        "claude:session-missing",
      );
    });

    expect(resumed).toBeNull();
    expect(loadedThreadsRef.current["claude:session-missing"]).toBe(false);
    expect(dispatch).toHaveBeenCalledWith({
      type: "clearUserInputRequestsForThread",
      workspaceId: "ws-1",
      threadId: "claude:session-missing",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "removeThread",
      workspaceId: "ws-1",
      threadId: "claude:session-missing",
    });
  });

  it("keeps the selected Claude readable surface when history not-found arrives after cached content", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: { data: [], nextCursor: null },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(loadClaudeSession).mockRejectedValue(
      new Error("[SESSION_NOT_FOUND] Session file not found: session-missing"),
    );

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:session-missing",
            name: "Missing Claude",
            updatedAt: 1_730_000_000_000,
            engineSource: "claude",
            threadKind: "native",
          },
        ],
      },
      activeThreadIdByWorkspace: {
        "ws-1": "claude:session-missing",
      },
      itemsByThread: {
        "claude:session-missing": [
          {
            id: "assistant-1",
            kind: "message",
            role: "assistant",
            text: "cached readable history",
          },
        ],
      },
    });

    let resumed: string | null = null;
    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    await act(async () => {
      resumed = await result.current.refreshThread(
        "ws-1",
        "claude:session-missing",
      );
    });

    expect(resumed).toBe("claude:session-missing");
    expect(loadClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-missing");
    expect(dispatch).toHaveBeenCalledWith({
      type: "clearUserInputRequestsForThread",
      workspaceId: "ws-1",
      threadId: "claude:session-missing",
    });
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "removeThread",
      workspaceId: "ws-1",
      threadId: "claude:session-missing",
    });
  });

  it("keeps claude thread retryable when history load fails without not-found", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: { data: [], nextCursor: null },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(loadClaudeSession).mockRejectedValue(
      new Error("failed to parse claude history"),
    );

    const { result, dispatch, loadedThreadsRef } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:session-1",
            name: "Claude Session",
            updatedAt: 1_730_000_000_000,
            engineSource: "claude",
            threadKind: "native",
          },
        ],
      },
    });

    let resumed: string | null = null;
    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    await act(async () => {
      resumed = await result.current.resumeThreadForWorkspace(
        "ws-1",
        "claude:session-1",
      );
    });

    expect(resumed).toBe("claude:session-1");
    expect(loadedThreadsRef.current["claude:session-1"]).toBe(false);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "removeThread",
        threadId: "claude:session-1",
      }),
    );
  });
});
