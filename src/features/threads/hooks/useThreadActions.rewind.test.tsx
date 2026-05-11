// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import * as tauri from "../../../services/tauri";
import * as threadItems from "../../../utils/threadItems";
import { useThreadActions } from "./useThreadActions";

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
  listWorkspaceSessions: vi.fn(),
  getOpenCodeSessionList: vi.fn(),
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

describe("useThreadActions rewind", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "ccgui",
    path: "/tmp/codex",
    connected: true,
    settings: { sidebarCollapsed: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tauri.listThreadTitles).mockResolvedValue({});
    vi.mocked(tauri.listGeminiSessions).mockResolvedValue([]);
    vi.mocked(tauri.listWorkspaceSessions).mockResolvedValue({
      data: [],
      nextCursor: null,
      partialSource: null,
    });
    vi.mocked(tauri.getOpenCodeSessionList).mockResolvedValue([]);
    vi.mocked(tauri.renameThreadTitleKey).mockResolvedValue(undefined);
    vi.mocked(tauri.setThreadTitle).mockResolvedValue("title");
    vi.mocked(tauri.connectWorkspace).mockResolvedValue(undefined);
    vi.mocked(tauri.createWorkspaceDirectory).mockResolvedValue(undefined);
    vi.mocked(threadItems.previewThreadName).mockImplementation((text: string, fallback: string) => {
      const trimmed = text.trim();
      return trimmed || fallback;
    });
    vi.mocked(tauri.deleteClaudeSession).mockResolvedValue(undefined);
    vi.mocked(tauri.deleteGeminiSession).mockResolvedValue(undefined);
    vi.mocked(tauri.deleteOpenCodeSession).mockResolvedValue({
      deleted: true,
      method: "filesystem",
    });
    vi.mocked(tauri.deleteCodexSession).mockResolvedValue({
      deleted: true,
      deletedCount: 1,
      method: "filesystem",
      archivedBeforeDelete: true,
    });
    vi.mocked(tauri.loadGeminiSession).mockResolvedValue({ messages: [] });
    vi.mocked(tauri.readWorkspaceFile).mockResolvedValue({
      content: "",
      truncated: false,
    });
    vi.mocked(tauri.trashWorkspaceItem).mockResolvedValue(undefined);
    vi.mocked(tauri.writeWorkspaceFile).mockResolvedValue(undefined);
  });

  function renderActions(
    overrides?: Partial<Parameters<typeof useThreadActions>[0]>,
  ) {
    const dispatch = vi.fn();
    const loadedThreadsRef = { current: {} as Record<string, boolean> };
    const replaceOnResumeRef = { current: {} as Record<string, boolean> };
    const threadActivityRef = {
      current: {} as Record<string, Record<string, number>>,
    };
    const applyCollabThreadLinksFromThread = vi.fn();
    const updateThreadParent = vi.fn();

    const args: Parameters<typeof useThreadActions>[0] = {
      dispatch,
      itemsByThread: {},
      userInputRequests: [],
      threadsByWorkspace: {},
      activeThreadIdByWorkspace: {},
      threadListCursorByWorkspace: {},
      threadStatusById: {},
      getCustomName: () => undefined,
      threadActivityRef,
      loadedThreadsRef,
      replaceOnResumeRef,
      applyCollabThreadLinksFromThread,
      updateThreadParent,
      onThreadTitleMappingsLoaded: vi.fn(),
      onRenameThreadTitleMapping: vi.fn(),
      ...overrides,
    };

    const utils = renderHook(() => useThreadActions(args));

    return {
      dispatch,
      loadedThreadsRef: args.loadedThreadsRef,
      replaceOnResumeRef: args.replaceOnResumeRef,
      threadActivityRef: args.threadActivityRef,
      applyCollabThreadLinksFromThread: args.applyCollabThreadLinksFromThread,
      updateThreadParent: args.updateThreadParent,
      ...utils,
    };
  }

  it("forks a Claude session and keeps engine as claude", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({ messages: [] } as any);

    const { result, dispatch, loadedThreadsRef } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "parent-user-1",
            kind: "message",
            role: "user",
            text: "parent context",
          },
          {
            id: "parent-assistant-1",
            kind: "message",
            role: "assistant",
            text: "parent answer",
          },
        ],
      },
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:session-1",
            name: "你好",
            updatedAt: 100,
            engineSource: "claude",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    let threadId: string | null = null;
    await act(async () => {
      threadId = await result.current.forkThreadForWorkspace("ws-1", "claude:session-1");
    });

    expect(threadId).toMatch(/^claude-fork:session-1:/);
    expect(tauri.forkClaudeSession).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId,
      engine: "claude",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveThreadId",
      workspaceId: "ws-1",
      threadId,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadName",
      workspaceId: "ws-1",
      threadId,
      name: "fork-你好",
    });
    expect(tauri.setThreadTitle).toHaveBeenCalledWith(
      "ws-1",
      threadId,
      "fork-你好",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadItems",
      threadId,
      items: [
        {
          id: "parent-user-1",
          kind: "message",
          role: "user",
          text: "parent context",
        },
        {
          id: "parent-assistant-1",
          kind: "message",
          role: "assistant",
          text: "parent answer",
        },
      ],
    });
    expect(tauri.loadClaudeSession).not.toHaveBeenCalled();
    expect(loadedThreadsRef.current[threadId!]).toBe(true);
  });

  it("forks a Claude session from message id and activates the fork", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockResolvedValue({
      thread: { id: "claude:forked-from-message-1" },
      sessionId: "forked-from-message-1",
    });
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          role: "user",
          id: "440e8400-e29b-41d4-a716-446655440000",
          text: "更早一条",
        },
        {
          kind: "message",
          role: "assistant",
          id: "assistant-0",
          text: "更早回复",
        },
        {
          kind: "message",
          role: "user",
          id: "550e8400-e29b-41d4-a716-446655440000",
          text: "回溯目标",
        },
      ],
    } as any);

    const { result, dispatch, loadedThreadsRef } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    let threadId: string | null = null;
    await act(async () => {
      threadId = await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });

    expect(threadId).toBe("claude:forked-from-message-1");
    expect(tauri.forkClaudeSessionFromMessage).toHaveBeenCalledWith(
      "/tmp/codex",
      "session-1",
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "renameThreadId",
      workspaceId: "ws-1",
      oldThreadId: "claude:session-1",
      newThreadId: "claude:forked-from-message-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "hideThread",
      workspaceId: "ws-1",
      threadId: "claude:session-1",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveThreadId",
      workspaceId: "ws-1",
      threadId: "claude:forked-from-message-1",
    });
    expect(tauri.deleteClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-1");
    expect(loadedThreadsRef.current["claude:forked-from-message-1"]).toBe(true);
  });

  it("replaces the active Claude thread in place when rewinding", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockResolvedValue({
      thread: { id: "claude:forked-from-message-replaced" },
      sessionId: "forked-from-message-replaced",
    });
    vi.mocked(tauri.loadClaudeSession)
      .mockResolvedValueOnce({
        messages: [
          {
            kind: "message",
            role: "user",
            id: "440e8400-e29b-41d4-a716-446655440123",
            text: "更早一条",
          },
          {
            kind: "message",
            role: "user",
            id: "550e8400-e29b-41d4-a716-446655440123",
            text: "回溯目标",
          },
        ],
      } as any)
      .mockResolvedValue({
        messages: [],
      } as any);

    const onRenameThreadTitleMapping = vi.fn();
    const { result, dispatch, loadedThreadsRef } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:session-1",
            name: "你好啊",
            updatedAt: 1,
            engineSource: "claude",
          },
        ],
      },
      activeThreadIdByWorkspace: {
        "ws-1": "claude:session-1",
      },
      itemsByThread: {
        "claude:session-1": [
          {
            id: "local-user-0",
            kind: "message",
            role: "user",
            text: "更早一条",
          },
          {
            id: "local-user-1",
            kind: "message",
            role: "user",
            text: "回溯目标",
          },
        ],
      },
      getCustomName: () => "你好啊",
      onRenameThreadTitleMapping,
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    dispatch.mockClear();

    await act(async () => {
      await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "local-user-1",
      );
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "renameThreadId",
      workspaceId: "ws-1",
      oldThreadId: "claude:session-1",
      newThreadId: "claude:forked-from-message-replaced",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "hideThread",
      workspaceId: "ws-1",
      threadId: "claude:session-1",
    });
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "setActiveThreadId",
      workspaceId: "ws-1",
      threadId: "claude:forked-from-message-replaced",
    });
    expect(tauri.renameThreadTitleKey).toHaveBeenCalledWith(
      "ws-1",
      "claude:session-1",
      "claude:forked-from-message-replaced",
    );
    expect(onRenameThreadTitleMapping).toHaveBeenCalledWith(
      "ws-1",
      "claude:session-1",
      "claude:forked-from-message-replaced",
    );
    expect(tauri.deleteClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-1");
    expect(loadedThreadsRef.current["claude:session-1"]).toBeUndefined();
    expect(loadedThreadsRef.current["claude:forked-from-message-replaced"]).toBe(true);
  });

  it("deletes the current Claude thread when rewinding from the first user message", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          role: "user",
          id: "550e8400-e29b-41d4-a716-446655440010",
          text: "你好在不在",
        },
        {
          kind: "message",
          role: "assistant",
          id: "assistant-1",
          text: "我在。",
        },
      ],
    } as any);

    const { result, dispatch, loadedThreadsRef } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:session-1",
            name: "你好在不在",
            updatedAt: 1,
            engineSource: "claude",
          },
        ],
      },
      activeThreadIdByWorkspace: {
        "ws-1": "claude:session-1",
      },
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-local-first",
            kind: "message",
            role: "user",
            text: "你好在不在",
          },
          {
            id: "assistant-local-first",
            kind: "message",
            role: "assistant",
            text: "我在。",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    dispatch.mockClear();

    let output: string | null = null;
    await act(async () => {
      output = await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-local-first",
      );
    });

    expect(output).toBe("claude:session-1");
    expect(tauri.forkClaudeSessionFromMessage).not.toHaveBeenCalled();
    expect(tauri.deleteClaudeSession).toHaveBeenCalledWith("/tmp/codex", "session-1");
    expect(dispatch).toHaveBeenCalledWith({
      type: "removeThread",
      workspaceId: "ws-1",
      threadId: "claude:session-1",
    });
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "renameThreadId" }),
    );
    expect(loadedThreadsRef.current["claude:session-1"]).toBeUndefined();
  });

  it("resolves local Claude user message id to history id before rewind fork", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockResolvedValue({
      thread: { id: "claude:forked-from-message-2" },
      sessionId: "forked-from-message-2",
    });
    vi.mocked(tauri.loadClaudeSession)
      .mockResolvedValueOnce({
        messages: [
          {
            kind: "message",
            role: "user",
            id: "440e8400-e29b-41d4-a716-446655440000",
            text: "更早一条",
          },
          {
            kind: "message",
            role: "user",
            id: "550e8400-e29b-41d4-a716-446655440000",
            text: "你在干啥那",
          },
          {
            kind: "message",
            role: "assistant",
            id: "assistant-1",
            text: "在等你安排任务",
          },
        ],
      } as any)
      .mockResolvedValue({ messages: [] } as any);

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-1744548491000-prev000",
            kind: "message",
            role: "user",
            text: "更早一条",
          },
          {
            id: "user-1744548492000-abcd12",
            kind: "message",
            role: "user",
            text: "你在干啥那",
          },
          {
            id: "claude-item-local-1",
            kind: "message",
            role: "assistant",
            text: "在等你安排任务",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    await act(async () => {
      await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-1744548492000-abcd12",
      );
    });

    expect(tauri.forkClaudeSessionFromMessage).toHaveBeenCalledWith(
      "/tmp/codex",
      "session-1",
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("preserves the explicitly selected Claude rewind target", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockResolvedValue({
      thread: { id: "claude:forked-from-message-3" },
      sessionId: "forked-from-message-3",
    });
    vi.mocked(tauri.loadClaudeSession)
      .mockResolvedValueOnce({
        messages: [
          {
            kind: "message",
            role: "user",
            id: "550e8400-e29b-41d4-a716-446655440000",
            text: "第一条",
          },
          {
            kind: "message",
            role: "assistant",
            id: "assistant-1",
            text: "第一条回复",
          },
          {
            kind: "message",
            role: "user",
            id: "660e8400-e29b-41d4-a716-446655440000",
            text: "第二条",
          },
        ],
      } as any)
      .mockResolvedValue({ messages: [] } as any);

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-1744548492000-old111",
            kind: "message",
            role: "user",
            text: "第一条",
          },
          {
            id: "user-1744548493000-new222",
            kind: "message",
            role: "user",
            text: "第二条",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    await act(async () => {
      await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-1744548493000-new222",
      );
    });

    expect(tauri.forkClaudeSessionFromMessage).toHaveBeenCalledWith(
      "/tmp/codex",
      "session-1",
      "660e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("deduplicates concurrent Claude rewind fork calls for the same thread", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          role: "user",
          id: "660e8400-e29b-41d4-a716-446655440000",
          text: "更早一条",
        },
        {
          kind: "message",
          role: "user",
          id: "770e8400-e29b-41d4-a716-446655440000",
          text: "最新一条",
        },
      ],
    } as any);

    let resolveFork:
      | ((value: {
          thread: { id: string };
          sessionId: string;
        }) => void)
      | null = null;
    const forkPromise = new Promise<{
      thread: { id: string };
      sessionId: string;
    }>((resolve) => {
      resolveFork = resolve;
    });
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockImplementation(
      async () => await forkPromise,
    );

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-1744548492000-prev111",
            kind: "message",
            role: "user",
            text: "更早一条",
          },
          {
            id: "user-1744548493000-new222",
            kind: "message",
            role: "user",
            text: "最新一条",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    let firstCall: Promise<string | null> | null = null;
    let secondCallResult: string | null = "__unset__";
    await act(async () => {
      firstCall = result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-1744548493000-new222",
      );
      secondCallResult =
        await result.current.forkClaudeSessionFromMessageForWorkspace(
          "ws-1",
          "claude:session-1",
          "user-1744548493000-new222",
        );
    });

    expect(secondCallResult).toBeNull();
    expect(tauri.forkClaudeSessionFromMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFork?.({
        thread: { id: "claude:forked-from-message-4" },
        sessionId: "forked-from-message-4",
      });
      await firstCall;
    });
  });

  it("restores changed workspace files before Claude rewind completes", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession)
      .mockResolvedValueOnce({
        messages: [
          {
            kind: "message",
            role: "user",
            id: "550e8400-e29b-41d4-a716-446655440111",
            text: "回溯目标",
          },
        ],
      } as any)
      .mockResolvedValue({ messages: [] } as any);
    vi.mocked(tauri.readWorkspaceFile).mockResolvedValue({
      content: "const value = 'after';\n",
      truncated: false,
    });
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockResolvedValue({
      thread: { id: "claude:forked-from-message-restore" },
      sessionId: "forked-from-message-restore",
    });

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-local-1",
            kind: "message",
            role: "user",
            text: "回溯目标",
          },
          {
            id: "tool-file-1",
            kind: "tool",
            toolType: "fileChange",
            title: "File changes",
            detail: "{}",
            changes: [
              {
                path: "src/App.tsx",
                kind: "modified",
                diff: "@@ -1,1 +1,1 @@\n-const value = 'before';\n+const value = 'after';",
              },
            ],
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    await act(async () => {
      await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-local-1",
      );
    });

    expect(tauri.writeWorkspaceFile).toHaveBeenCalledWith(
      "ws-1",
      "src/App.tsx",
      "const value = 'before';\n",
    );
  });

  it("skips workspace restore when Claude rewind toggle is disabled", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          role: "user",
          id: "550e8400-e29b-41d4-a716-446655440131",
          text: "回溯目标",
        },
      ],
    } as any);
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockResolvedValue({
      thread: { id: "claude:forked-from-message-no-restore" },
      sessionId: "forked-from-message-no-restore",
    });

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-local-no-restore",
            kind: "message",
            role: "user",
            text: "回溯目标",
          },
          {
            id: "tool-file-no-restore",
            kind: "tool",
            toolType: "fileChange",
            title: "File changes",
            detail: "{}",
            changes: [
              {
                path: "src/App.tsx",
                kind: "modified",
                diff: "@@ -1,1 +1,1 @@\n-const value = 'before';\n+const value = 'after';",
              },
            ],
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    await act(async () => {
      await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-local-no-restore",
        { mode: "messages-only" },
      );
    });

    expect(tauri.writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("rolls workspace files back when Claude rewind fork fails", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          role: "user",
          id: "440e8400-e29b-41d4-a716-446655440100",
          text: "更早一条",
        },
        {
          kind: "message",
          role: "user",
          id: "550e8400-e29b-41d4-a716-446655440112",
          text: "回溯目标",
        },
      ],
    } as any);
    vi.mocked(tauri.readWorkspaceFile).mockResolvedValue({
      content: "const value = 'after';\n",
      truncated: false,
    });
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockRejectedValue(
      new Error("fork failed"),
    );

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-local-prev-2",
            kind: "message",
            role: "user",
            text: "更早一条",
          },
          {
            id: "user-local-2",
            kind: "message",
            role: "user",
            text: "回溯目标",
          },
          {
            id: "tool-file-2",
            kind: "tool",
            toolType: "fileChange",
            title: "File changes",
            detail: "{}",
            changes: [
              {
                path: "src/App.tsx",
                kind: "modified",
                diff: "@@ -1,1 +1,1 @@\n-const value = 'before';\n+const value = 'after';",
              },
            ],
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    await act(async () => {
      await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-local-2",
      );
    });

    expect(tauri.writeWorkspaceFile).toHaveBeenNthCalledWith(
      1,
      "ws-1",
      "src/App.tsx",
      "const value = 'before';\n",
    );
    expect(tauri.writeWorkspaceFile).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "src/App.tsx",
      "const value = 'after';\n",
    );
  });

  it("does not roll workspace files back when Claude rewind fork fails and toggle is disabled", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          role: "user",
          id: "440e8400-e29b-41d4-a716-446655440140",
          text: "更早一条",
        },
        {
          kind: "message",
          role: "user",
          id: "550e8400-e29b-41d4-a716-446655440141",
          text: "回溯目标",
        },
      ],
    } as any);
    vi.mocked(tauri.forkClaudeSessionFromMessage).mockRejectedValue(
      new Error("fork failed"),
    );

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-local-prev-disable-rollback",
            kind: "message",
            role: "user",
            text: "更早一条",
          },
          {
            id: "user-local-disable-rollback",
            kind: "message",
            role: "user",
            text: "回溯目标",
          },
          {
            id: "tool-file-disable-rollback",
            kind: "tool",
            toolType: "fileChange",
            title: "File changes",
            detail: "{}",
            changes: [
              {
                path: "src/App.tsx",
                kind: "modified",
                diff: "@@ -1,1 +1,1 @@\n-const value = 'before';\n+const value = 'after';",
              },
            ],
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    await act(async () => {
      await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-local-disable-rollback",
        { mode: "messages-only" },
      );
    });

    expect(tauri.writeWorkspaceFile).not.toHaveBeenCalled();
  });

  it("restores workspace files without rewinding Claude messages in files-only mode", async () => {
    vi.mocked(tauri.listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    } as any);
    vi.mocked(tauri.listClaudeSessions).mockResolvedValue([]);
    vi.mocked(tauri.loadClaudeSession).mockResolvedValue({
      messages: [
        {
          kind: "message",
          role: "user",
          id: "550e8400-e29b-41d4-a716-446655440151",
          text: "回溯目标",
        },
      ],
    } as any);
    vi.mocked(tauri.readWorkspaceFile).mockResolvedValue({
      content: "const value = 'after';\n",
      truncated: false,
    });

    const { result } = renderActions({
      itemsByThread: {
        "claude:session-1": [
          {
            id: "user-files-only",
            kind: "message",
            role: "user",
            text: "回溯目标",
          },
          {
            id: "tool-file-files-only",
            kind: "tool",
            toolType: "fileChange",
            title: "File changes",
            detail: "{}",
            changes: [
              {
                path: "src/App.tsx",
                kind: "modified",
                diff: "@@ -1,1 +1,1 @@\n-const value = 'before';\n+const value = 'after';",
              },
            ],
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, { preserveState: true });
    });

    let output: string | null = null;
    await act(async () => {
      output = await result.current.forkClaudeSessionFromMessageForWorkspace(
        "ws-1",
        "claude:session-1",
        "user-files-only",
        { mode: "files-only" },
      );
    });

    expect(output).toBe("claude:session-1");
    expect(tauri.writeWorkspaceFile).toHaveBeenCalledWith(
      "ws-1",
      "src/App.tsx",
      "const value = 'before';\n",
    );
    expect(tauri.forkClaudeSessionFromMessage).not.toHaveBeenCalled();
    expect(tauri.deleteClaudeSession).not.toHaveBeenCalled();
  });
});
