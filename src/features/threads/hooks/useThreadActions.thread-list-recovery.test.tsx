// @vitest-environment jsdom
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import {
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
  loadGeminiSession,
  listThreadTitles,
  renameThreadTitleKey,
  setThreadTitle,
  listThreads,
  readWorkspaceFile,
  trashWorkspaceItem,
  writeWorkspaceFile,
} from "../../../services/tauri";
import {
  getThreadTimestamp,
  mergeThreadItems,
  previewThreadName,
} from "../../../utils/threadItems";
import { clearGlobalRuntimeNotices } from "../../../services/globalRuntimeNotices";
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
  normalizeItem: vi.fn((item: ConversationItem) => item),
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

vi.mock("../../../services/globalRuntimeNotices", async () => {
  const actual = await vi.importActual<typeof import("../../../services/globalRuntimeNotices")>(
    "../../../services/globalRuntimeNotices",
  );
  return actual;
});

describe("useThreadActions thread list recovery and pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.mocked(listThreadTitles).mockResolvedValue({});
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
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
    vi.mocked(previewThreadName).mockImplementation((text: string, fallback: string) => {
      const trimmed = text.trim();
      return trimmed || fallback;
    });
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
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      content: "",
      truncated: false,
    });
    vi.mocked(trashWorkspaceItem).mockResolvedValue(undefined);
    vi.mocked(writeWorkspaceFile).mockResolvedValue(undefined);
    vi.mocked(loadSidebarSnapshot).mockReturnValue(null);
    vi.mocked(mergeThreadItems).mockImplementation(
      (primaryItems: ConversationItem[]) => primaryItems,
    );
    clearGlobalRuntimeNotices();
  });

  it("collapses concurrent automatic recovery sources into one guarded reconnect", async () => {
    let resolveRecovery = () => {};
    const recoveryPromise = new Promise<void>((resolve) => {
      resolveRecovery = resolve;
    });
    vi.mocked(connectWorkspace).mockImplementation(() => recoveryPromise);
    vi.mocked(listThreads)
      .mockRejectedValueOnce(new Error("workspace not connected"))
      .mockRejectedValueOnce(new Error("workspace not connected"))
      .mockResolvedValueOnce({
        result: {
          data: [],
          nextCursor: null,
        },
      } as any);
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
    vi.mocked(getOpenCodeSessionList).mockResolvedValue([]);

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "cached-thread",
            name: "Cached chat",
            updatedAt: 900,
            engineSource: "codex",
          },
        ],
      },
    });

    const leaderRefresh = result.current.listThreadsForWorkspace(workspace, {
      recoverySource: "thread-list-live",
    });
    const waiterRefresh = result.current.listThreadsForWorkspace(workspace, {
      preserveState: true,
      recoverySource: "focus-refresh",
    });

    await waitFor(() => {
      expect(connectWorkspace).toHaveBeenCalledTimes(1);
    });

    resolveRecovery();

    await act(async () => {
      await Promise.all([leaderRefresh, waiterRefresh]);
    });

    expect(connectWorkspace).toHaveBeenCalledWith("ws-1", "thread-list-live");
    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "cached-thread",
        name: "Cached chat",
        updatedAt: 900,
        engineSource: "codex",
        partialSource: "guarded-recovery-waiter",
        isDegraded: true,
        degradedReason: "last-good-fallback",
      },
    ]);
  });

  it("preserves list state when requested", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "setThreadListLoading",
      workspaceId: "ws-1",
      isLoading: true,
    });
  });

  it("loads older threads when a cursor is available", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-2",
            cwd: "/tmp/codex",
            preview: "Older preview",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListPaging",
      workspaceId: "ws-1",
      isLoading: true,
    });
    expectSetThreadsDispatched(dispatch, "ws-1", [
      { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
      { id: "thread-2", name: "Older preview", updatedAt: 4000 },
    ]);
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: null,
    });
  });

  it("loads older runtime threads from an encoded runtime cursor", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-2",
            cwd: "/tmp/codex",
            preview: "Older runtime preview",
            updated_at: 4000,
          },
        ],
        nextCursor: "codex-unified:100",
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "runtime::codex-unified:50" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(listThreads).toHaveBeenCalledWith("ws-1", "codex-unified:50", 50);
    expectSetThreadsDispatched(dispatch, "ws-1", [
      { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
      { id: "thread-2", name: "Older runtime preview", updatedAt: 4000 },
    ]);
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "runtime::codex-unified:100",
    });
  });

  it("loads older project catalog sessions across engines from the workspace cursor", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: "runtime-next",
      },
    });
    vi.mocked(listWorkspaceSessions).mockImplementation(async (_workspaceId, options) => {
      if (options?.query?.status === "all") {
        return {
          data: [],
          nextCursor: null,
          partialSource: null,
        };
      }
      return {
        data: [
          {
            sessionId: "claude:older-catalog",
            workspaceId: "ws-1",
            engine: "claude",
            title: "Claude older catalog",
            updatedAt: 5000,
            archivedAt: null,
            threadKind: "native",
            folderId: "folder-a",
          },
          {
            sessionId: "gemini:older-catalog",
            workspaceId: "ws-1",
            engine: "gemini",
            title: "Gemini older catalog",
            updatedAt: 4500,
            archivedAt: null,
            threadKind: "native",
          },
        ],
        nextCursor: "catalog-next",
        partialSource: null,
      };
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "catalog::offset:200" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(listWorkspaceSessions).toHaveBeenCalledWith("ws-1", {
      query: { status: "active" },
      cursor: "offset:200",
      limit: 200,
    });
    expect(listThreads).not.toHaveBeenCalled();
    expectSetThreadsDispatched(dispatch, "ws-1", [
      { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
      {
        id: "claude:older-catalog",
        name: "Claude older catalog",
        updatedAt: 5000,
        engineSource: "claude",
        folderId: "folder-a",
      },
      {
        id: "gemini:older-catalog",
        name: "Gemini older catalog",
        updatedAt: 4500,
        engineSource: "gemini",
        folderId: null,
      },
    ]);
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "catalog::catalog-next",
    });
  });

  it("loads older active codex thread without cwd when local scan is unavailable", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-active",
            preview: "Recovered active thread",
            updated_at: 4100,
          },
        ],
        nextCursor: null,
        partialSource: "local-session-scan-unavailable",
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000, engineSource: "codex" }],
      },
      activeThreadIdByWorkspace: {
        "ws-1": "thread-active",
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "thread-1",
        name: "Agent 1",
        updatedAt: 6000,
        engineSource: "codex",
      },
      {
        id: "thread-active",
        name: "Recovered active thread",
        updatedAt: 4100,
      },
    ]);
  });

  it("preserves previously visible finalized codex sessions during degraded partial refresh", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-active",
            cwd: "/tmp/codex",
            preview: "Recovered active thread",
            updated_at: 4100,
          },
        ],
        nextCursor: null,
        partialSource: "local-session-scan-unavailable",
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "thread-finalized",
            name: "项目分析",
            updatedAt: 3900,
            engineSource: "codex",
            threadKind: "native",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "thread-active",
        name: "Recovered active thread",
        updatedAt: 4100,
        engineSource: "codex",
        partialSource: "local-session-scan-unavailable",
        isDegraded: true,
        degradedReason: "partial-thread-list",
      },
      {
        id: "thread-finalized",
        name: "项目分析",
        updatedAt: 3900,
        engineSource: "codex",
        threadKind: "native",
        partialSource: "local-session-scan-unavailable",
        isDegraded: true,
        degradedReason: "partial-thread-list",
      },
    ]);
  });

  it("does not resurrect archived codex sessions from last-good continuity during degraded partial refresh", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-active",
            cwd: "/tmp/codex",
            preview: "Recovered active thread",
            updated_at: 4100,
          },
        ],
        nextCursor: null,
        partialSource: "local-session-scan-unavailable",
      },
    });
    vi.mocked(listWorkspaceSessions).mockResolvedValue({
      data: [
        {
          sessionId: "thread-archived",
          workspaceId: "ws-1",
          engine: "codex",
          title: "已归档线程",
          updatedAt: 3900,
          archivedAt: 1710000000000,
          threadKind: "native",
          sourceLabel: "cli/codex",
        },
      ],
      nextCursor: null,
      partialSource: null,
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "thread-archived",
            name: "已归档线程",
            updatedAt: 3900,
            engineSource: "codex",
            threadKind: "native",
          },
        ],
      },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expectSetThreadsDispatched(dispatch, "ws-1", [
      {
        id: "thread-active",
        name: "Recovered active thread",
        updatedAt: 4100,
        engineSource: "codex",
        partialSource: "local-session-scan-unavailable",
        isDegraded: true,
        degradedReason: "partial-thread-list",
      },
    ]);
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreads",
        workspaceId: "ws-1",
        threads: expect.arrayContaining([
          expect.objectContaining({
            id: "thread-archived",
          }),
        ]),
      }),
    );
  });
});
