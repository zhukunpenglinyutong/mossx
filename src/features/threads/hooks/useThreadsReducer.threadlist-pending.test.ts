import { describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { initialState, threadReducer } from "./useThreadsReducer";
import type { ThreadState } from "./useThreadsReducer";

describe("threadReducer", () => {
  it("hides background threads and keeps them hidden on future syncs", () => {
    const withThread = threadReducer(initialState, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-bg",
    });
    expect(withThread.threadsByWorkspace["ws-1"]?.some((t) => t.id === "thread-bg")).toBe(true);

    const hidden = threadReducer(withThread, {
      type: "hideThread",
      workspaceId: "ws-1",
      threadId: "thread-bg",
    });
    expect(hidden.threadsByWorkspace["ws-1"]?.some((t) => t.id === "thread-bg")).toBe(false);

    const synced = threadReducer(hidden, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [
        { id: "thread-bg", name: "Agent 1", updatedAt: Date.now() },
        { id: "thread-visible", name: "Agent 2", updatedAt: Date.now() },
      ],
    });
    const ids = synced.threadsByWorkspace["ws-1"]?.map((t) => t.id) ?? [];
    expect(ids).toContain("thread-visible");
    expect(ids).not.toContain("thread-bg");
  });

  it("keeps anchored non-active pending threads during list refresh", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-main" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-main", name: "Main", updatedAt: 200, engineSource: "codex" },
          {
            id: "claude-pending-bg",
            name: "Background Claude",
            updatedAt: 190,
            engineSource: "claude",
          },
        ],
      },
      threadStatusById: {
        "claude-pending-bg": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 120,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-bg": [
          {
            id: "pending-user-1",
            kind: "message",
            role: "user",
            text: "background job",
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [{ id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" }],
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("thread-main");
    expect(ids).toContain("claude-pending-bg");
  });

  it("drops idle non-active pending threads during list refresh", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-main" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-main", name: "Main", updatedAt: 200, engineSource: "codex" },
          {
            id: "claude-pending-idle",
            name: "Idle Claude",
            updatedAt: 190,
            engineSource: "claude",
          },
        ],
      },
      threadStatusById: {
        "claude-pending-idle": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-idle": [],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [{ id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" }],
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("thread-main");
    expect(ids).not.toContain("claude-pending-idle");
  });

  it("keeps idle pending threads with folder intent during list refresh", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-main" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-main", name: "Main", updatedAt: 200, engineSource: "codex" },
          {
            id: "gemini-pending-folder",
            name: "Folder Gemini",
            updatedAt: 190,
            engineSource: "gemini",
            folderId: "folder-a",
          },
        ],
      },
      threadStatusById: {
        "gemini-pending-folder": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "gemini-pending-folder": [],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [{ id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" }],
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("thread-main");
    expect(ids).toContain("gemini-pending-folder");
  });

  it("keeps pending thread anchored by recent last agent message", () => {
    const now = Date.now();
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-main" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-main", name: "Main", updatedAt: 200, engineSource: "codex" },
          {
            id: "claude-pending-recent",
            name: "Recent Claude",
            updatedAt: 190,
            engineSource: "claude",
          },
        ],
      },
      lastAgentMessageByThread: {
        "claude-pending-recent": {
          text: "latest response",
          timestamp: now - 60_000,
        },
      },
      threadStatusById: {
        "claude-pending-recent": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-recent": [],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [{ id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" }],
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("thread-main");
    expect(ids).toContain("claude-pending-recent");
  });

  it("drops pending thread anchored only by stale last agent message", () => {
    const now = Date.now();
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-main" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-main", name: "Main", updatedAt: 200, engineSource: "codex" },
          {
            id: "claude-pending-stale",
            name: "Stale Claude",
            updatedAt: 190,
            engineSource: "claude",
          },
        ],
      },
      lastAgentMessageByThread: {
        "claude-pending-stale": {
          text: "old response",
          timestamp: now - 10 * 60_000,
        },
      },
      threadStatusById: {
        "claude-pending-stale": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-stale": [],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [{ id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" }],
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("thread-main");
    expect(ids).not.toContain("claude-pending-stale");
  });

  it("keeps pending on immediate refresh then drops it after anchor TTL expires", () => {
    const anchorTimestamp = Date.parse("2026-04-01T00:00:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(anchorTimestamp + 60_000);
    try {
      const base: ThreadState = {
        ...initialState,
        activeThreadIdByWorkspace: { "ws-1": "thread-main" },
        threadsByWorkspace: {
          "ws-1": [
            { id: "thread-main", name: "Main", updatedAt: 200, engineSource: "codex" },
            {
              id: "claude-pending-ttl",
              name: "TTL Claude",
              updatedAt: 190,
              engineSource: "claude",
            },
          ],
        },
        lastAgentMessageByThread: {
          "claude-pending-ttl": {
            text: "fresh message",
            timestamp: anchorTimestamp,
          },
        },
        threadStatusById: {
          "claude-pending-ttl": {
            isProcessing: false,
            hasUnread: false,
            isReviewing: false,
            processingStartedAt: null,
            lastDurationMs: null,
          },
        },
        itemsByThread: {
          "claude-pending-ttl": [],
        },
      };

      const firstRefresh = threadReducer(base, {
        type: "setThreads",
        workspaceId: "ws-1",
        threads: [{ id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" }],
      });
      const firstIds = firstRefresh.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
      expect(firstIds).toContain("claude-pending-ttl");

      nowSpy.mockReturnValue(anchorTimestamp + 6 * 60_000);
      const secondRefresh = threadReducer(firstRefresh, {
        type: "setThreads",
        workspaceId: "ws-1",
        threads: [{ id: "thread-main", name: "Main", updatedAt: 320, engineSource: "codex" }],
      });
      const secondIds = secondRefresh.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
      expect(secondIds).not.toContain("claude-pending-ttl");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("keeps active thread at top when preserving background pending threads", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-active" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-active", name: "Active", updatedAt: 200, engineSource: "codex" },
          {
            id: "claude-pending-bg",
            name: "Background Claude",
            updatedAt: 190,
            engineSource: "claude",
          },
        ],
      },
      threadStatusById: {
        "claude-pending-bg": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 100,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-bg": [
          { id: "pending-user-1", kind: "message", role: "user", text: "background job" },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [{ id: "thread-visible", name: "Visible", updatedAt: 300, engineSource: "codex" }],
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids[0]).toBe("thread-active");
    expect(ids).toContain("claude-pending-bg");
    expect(ids).toContain("thread-visible");
  });

  it("does not force-rename when multiple Claude pending threads remain ambiguous", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "claude-pending-a" },
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude-pending-a",
            name: "Agent 1",
            updatedAt: 1,
            engineSource: "claude",
          },
          {
            id: "claude-pending-b",
            name: "Agent 2",
            updatedAt: 2,
            engineSource: "claude",
          },
        ],
      },
      threadStatusById: {
        "claude-pending-a": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 100,
          lastDurationMs: null,
        },
        "claude-pending-b": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 120,
          lastDurationMs: null,
        },
      },
    };

    const next = threadReducer(base, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "claude:session-1",
      engine: "claude",
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("claude-pending-a");
    expect(ids).toContain("claude-pending-b");
    expect(ids).toContain("claude:session-1");
    expect(next.threadStatusById["claude-pending-a"]?.isProcessing).toBe(true);
    expect(next.threadStatusById["claude-pending-b"]?.isProcessing).toBe(true);
    expect(next.threadStatusById["claude:session-1"]?.isProcessing).toBe(false);
    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("claude-pending-a");
  });

  it("does not auto-rename when multiple pending Claude threads exist even if active has activity", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "claude-pending-new" },
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude-pending-old",
            name: "Agent 1",
            updatedAt: 1,
            engineSource: "claude",
          },
          {
            id: "claude-pending-new",
            name: "Agent 2",
            updatedAt: 2,
            engineSource: "claude",
          },
        ],
      },
      threadStatusById: {
        "claude-pending-old": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 100,
          lastDurationMs: null,
        },
        "claude-pending-new": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-old": [
          { id: "reasoning-old", kind: "reasoning", summary: "old", content: "old stream" },
        ],
        "claude-pending-new": [
          { id: "user-new", kind: "message", role: "user", text: "new prompt" },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "claude:session-2",
      engine: "claude",
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("claude-pending-old");
    expect(ids).toContain("claude-pending-new");
    expect(ids).toContain("claude:session-2");
    expect(next.itemsByThread["claude:session-2"] ?? []).toHaveLength(0);
    expect(next.itemsByThread["claude-pending-new"]?.map((item) => item.id)).toContain(
      "user-new",
    );
    expect(next.itemsByThread["claude-pending-old"]?.map((item) => item.id)).toContain(
      "reasoning-old",
    );
    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("claude-pending-new");
  });

  it("does not force-rename a single idle pending thread to unrelated session id", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "claude-pending-idle" },
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude-pending-idle",
            name: "Agent 1",
            updatedAt: 1,
            engineSource: "claude",
          },
        ],
      },
      threadStatusById: {
        "claude-pending-idle": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-idle": [],
      },
      activeTurnIdByThread: {
        "claude-pending-idle": null,
      },
    };

    const next = threadReducer(base, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "claude:historical-session",
      engine: "claude",
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("claude-pending-idle");
    expect(ids).toContain("claude:historical-session");
    expect(next.itemsByThread["claude-pending-idle"]).toEqual([]);
    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("claude-pending-idle");
  });

  it("does not force-rename a pending thread anchored only by last agent message", () => {
    const now = Date.now();
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "claude-pending-stale" },
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude-pending-stale",
            name: "Agent 1",
            updatedAt: 1,
            engineSource: "claude",
          },
        ],
      },
      lastAgentMessageByThread: {
        "claude-pending-stale": {
          text: "stale completed output",
          timestamp: now - 60_000,
        },
      },
      threadStatusById: {
        "claude-pending-stale": {
          isProcessing: false,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: null,
        },
      },
      itemsByThread: {
        "claude-pending-stale": [],
      },
      activeTurnIdByThread: {
        "claude-pending-stale": null,
      },
    };

    const next = threadReducer(base, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "claude:historical-session-2",
      engine: "claude",
    });

    const ids = next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(ids).toContain("claude-pending-stale");
    expect(ids).toContain("claude:historical-session-2");
    expect(next.itemsByThread["claude-pending-stale"]).toEqual([]);
    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("claude-pending-stale");
  });

  it("finalizes pending tool statuses to completed", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "tool-1",
            kind: "tool",
            toolType: "mcpToolCall",
            title: "Tool: Read",
            detail: "{}",
            status: "started",
          },
          {
            id: "tool-2",
            kind: "tool",
            toolType: "mcpToolCall",
            title: "Tool: Bash",
            detail: "{}",
            status: "running",
          },
          {
            id: "tool-3",
            kind: "tool",
            toolType: "mcpToolCall",
            title: "Tool: Search",
            detail: "{}",
            status: "completed",
          },
          {
            id: "tool-4",
            kind: "tool",
            toolType: "mcpToolCall",
            title: "Tool: Edit",
            detail: "{}",
            status: "failed",
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "finalizePendingToolStatuses",
      threadId: "thread-1",
      status: "completed",
    });

    const tools = (next.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "tool" }> =>
        item.kind === "tool",
    );

    expect(tools.find((item) => item.id === "tool-1")?.status).toBe("completed");
    expect(tools.find((item) => item.id === "tool-2")?.status).toBe("completed");
    expect(tools.find((item) => item.id === "tool-3")?.status).toBe("completed");
    expect(tools.find((item) => item.id === "tool-4")?.status).toBe("failed");
  });

  it("creates a placeholder tool when output delta arrives before the tool snapshot", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [],
      },
    };

    const next = threadReducer(base, {
      type: "appendToolOutput",
      threadId: "thread-1",
      itemId: "tool-1",
      delta: "partial output",
    });

    const tool = (next.itemsByThread["thread-1"] ?? []).find(
      (item): item is Extract<ConversationItem, { kind: "tool" }> =>
        item.kind === "tool" && item.id === "tool-1",
    );

    expect(tool).toMatchObject({
      id: "tool-1",
      toolType: "commandExecution",
      title: "Command",
      status: "running",
      output: "partial output",
    });
  });

  it("finalizes pending tool statuses to failed", () => {
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "thread-1": [
          {
            id: "tool-1",
            kind: "tool",
            toolType: "mcpToolCall",
            title: "Tool: Read",
            detail: "{}",
            status: "started",
          },
          {
            id: "tool-2",
            kind: "tool",
            toolType: "mcpToolCall",
            title: "Tool: Search",
            detail: "{}",
            status: "in_progress",
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "finalizePendingToolStatuses",
      threadId: "thread-1",
      status: "failed",
    });

    const tools = (next.itemsByThread["thread-1"] ?? []).filter(
      (item): item is Extract<ConversationItem, { kind: "tool" }> =>
        item.kind === "tool",
    );

    expect(tools.find((item) => item.id === "tool-1")?.status).toBe("failed");
    expect(tools.find((item) => item.id === "tool-2")?.status).toBe("failed");
  });

  it("merges pending thread into real session thread on rename collision", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "opencode-pending-1" },
      itemsByThread: {
        "opencode-pending-1": [
          { id: "u1", kind: "message", role: "user", text: "你好" },
        ],
        "opencode:ses-1": [
          { id: "a1", kind: "message", role: "assistant", text: "已收到" },
        ],
      },
      threadsByWorkspace: {
        "ws-1": [
          { id: "opencode-pending-1", name: "你好", updatedAt: 100, engineSource: "opencode" },
          { id: "opencode:ses-1", name: "Agent 2", updatedAt: 200, engineSource: "opencode" },
        ],
      },
      threadStatusById: {
        "opencode-pending-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 100,
          lastDurationMs: null,
        },
        "opencode:ses-1": {
          isProcessing: false,
          hasUnread: true,
          isReviewing: false,
          processingStartedAt: null,
          lastDurationMs: 80,
        },
      },
    };

    const next = threadReducer(base, {
      type: "renameThreadId",
      workspaceId: "ws-1",
      oldThreadId: "opencode-pending-1",
      newThreadId: "opencode:ses-1",
    });

    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("opencode:ses-1");
    expect(next.itemsByThread["opencode-pending-1"]).toBeUndefined();
    expect(next.itemsByThread["opencode:ses-1"]?.map((item) => item.id)).toEqual([
      "u1",
      "a1",
    ]);
    expect(next.threadsByWorkspace["ws-1"]?.filter((t) => t.id === "opencode:ses-1")).toHaveLength(1);
    expect(next.threadStatusById["opencode:ses-1"]?.isProcessing).toBe(true);
    expect(next.threadStatusById["opencode:ses-1"]?.hasUnread).toBe(true);
  });

  it("renames anchored Claude fork thread when real session is ensured", () => {
    const forkThreadId = "claude-fork:parent-session:local-1";
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": forkThreadId },
      itemsByThread: {
        [forkThreadId]: [
          { id: "u1", kind: "message", role: "user", text: "fork prompt" },
        ],
      },
      threadsByWorkspace: {
        "ws-1": [
          { id: forkThreadId, name: "fork-prompt", updatedAt: 100, engineSource: "claude" },
        ],
      },
      threadStatusById: {
        [forkThreadId]: {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 100,
          lastDurationMs: null,
        },
      },
      activeTurnIdByThread: {
        [forkThreadId]: "turn-1",
      },
    };

    const next = threadReducer(base, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "claude:child-session",
      engine: "claude",
    });

    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("claude:child-session");
    expect(next.itemsByThread[forkThreadId]).toBeUndefined();
    expect(next.itemsByThread["claude:child-session"]?.map((item) => item.id)).toEqual([
      "u1",
    ]);
    expect(next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id)).toEqual([
      "claude:child-session",
    ]);
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.name).toBe("fork-prompt");
    expect(next.threadStatusById["claude:child-session"]?.isProcessing).toBe(true);
    expect(next.activeTurnIdByThread["claude:child-session"]).toBe("turn-1");
  });

  it("does not treat finalized Claude sessions as pending rename candidates", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "claude:existing-session" },
      itemsByThread: {
        "claude:existing-session": [
          { id: "existing-user", kind: "message", role: "user", text: "existing" },
        ],
      },
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:existing-session",
            name: "Existing",
            updatedAt: 100,
            engineSource: "claude",
          },
        ],
      },
      threadStatusById: {
        "claude:existing-session": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 100,
          lastDurationMs: null,
        },
      },
      activeTurnIdByThread: {
        "claude:existing-session": "turn-existing",
      },
    };

    const next = threadReducer(base, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "claude:new-session",
      engine: "claude",
    });

    expect(next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id)).toEqual([
      "claude:new-session",
      "claude:existing-session",
    ]);
    expect(next.itemsByThread["claude:existing-session"]?.map((item) => item.id)).toEqual([
      "existing-user",
    ]);
    expect(next.itemsByThread["claude:new-session"]).toBeUndefined();
    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("claude:existing-session");
  });

  it("keeps latest pending user message when merging into long existing history", () => {
    const existingItems: ConversationItem[] = Array.from({ length: 200 }, (_, index) => ({
      id: `existing-${index}`,
      kind: "message",
      role: index % 2 === 0 ? "user" : "assistant",
      text: `msg-${index}`,
    }));
    const pendingItem: ConversationItem = {
      id: "pending-user",
      kind: "message",
      role: "user",
      text: "最新问题",
    };
    const base: ThreadState = {
      ...initialState,
      itemsByThread: {
        "opencode-pending-1": [pendingItem],
        "opencode:ses-1": existingItems,
      },
      threadsByWorkspace: {
        "ws-1": [
          { id: "opencode-pending-1", name: "最新问题", updatedAt: 300, engineSource: "opencode" },
          { id: "opencode:ses-1", name: "历史会话", updatedAt: 200, engineSource: "opencode" },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "renameThreadId",
      workspaceId: "ws-1",
      oldThreadId: "opencode-pending-1",
      newThreadId: "opencode:ses-1",
    });

    const merged = next.itemsByThread["opencode:ses-1"] ?? [];
    expect(merged.some((item) => item.id === "pending-user")).toBe(true);
    expect(merged[merged.length - 1]?.id).toBe("pending-user");
  });

  it("renames pending userInputRequest thread id together with thread rename", () => {
    const pendingRequest = {
      workspace_id: "ws-1",
      request_id: "req-1",
      params: {
        thread_id: "codex-pending-1",
        turn_id: "turn-1",
        item_id: "item-1",
        questions: [{ id: "q1", header: "", question: "继续?" }],
      },
    };
    const base: ThreadState = {
      ...initialState,
      userInputRequests: [pendingRequest],
      threadsByWorkspace: {
        "ws-1": [
          { id: "codex-pending-1", name: "Agent 1", updatedAt: 1, engineSource: "codex" },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "renameThreadId",
      workspaceId: "ws-1",
      oldThreadId: "codex-pending-1",
      newThreadId: "codex:session-1",
    });

    expect(next.userInputRequests).toHaveLength(1);
    expect(next.userInputRequests[0]?.params.thread_id).toBe("codex:session-1");
  });

  it("stores plan state per thread and replaces stale plan for same thread", () => {
    const base: ThreadState = {
      ...initialState,
      planByThread: {
        "thread-1": {
          turnId: "turn-1",
          explanation: "old",
          steps: [{ step: "old-step", status: "pending" }],
        },
      },
    };

    const updatedThreadOne = threadReducer(base, {
      type: "setThreadPlan",
      threadId: "thread-1",
      plan: {
        turnId: "turn-2",
        explanation: "new",
        steps: [{ step: "new-step", status: "completed" }],
      },
    });

    const withThreadTwo = threadReducer(updatedThreadOne, {
      type: "setThreadPlan",
      threadId: "thread-2",
      plan: {
        turnId: "turn-3",
        explanation: "other",
        steps: [{ step: "other-step", status: "inProgress" }],
      },
    });

    expect(withThreadTwo.planByThread["thread-1"]).toEqual({
      turnId: "turn-2",
      explanation: "new",
      steps: [{ step: "new-step", status: "completed" }],
    });
    expect(withThreadTwo.planByThread["thread-2"]).toEqual({
      turnId: "turn-3",
      explanation: "other",
      steps: [{ step: "other-step", status: "inProgress" }],
    });
  });

  it("settles in-progress plan steps without changing other statuses", () => {
    const base: ThreadState = {
      ...initialState,
      planByThread: {
        "thread-1": {
          turnId: "turn-9",
          explanation: "plan",
          steps: [
            { step: "step-a", status: "completed" },
            { step: "step-b", status: "inProgress" },
            { step: "step-c", status: "pending" },
          ],
        },
      },
    };

    const settledPending = threadReducer(base, {
      type: "settleThreadPlanInProgress",
      threadId: "thread-1",
      targetStatus: "pending",
    });
    expect(settledPending.planByThread["thread-1"]).toEqual({
      turnId: "turn-9",
      explanation: "plan",
      steps: [
        { step: "step-a", status: "completed" },
        { step: "step-b", status: "pending" },
        { step: "step-c", status: "pending" },
      ],
    });

    const settledCompleted = threadReducer(base, {
      type: "settleThreadPlanInProgress",
      threadId: "thread-1",
      targetStatus: "completed",
    });
    expect(settledCompleted.planByThread["thread-1"]).toEqual({
      turnId: "turn-9",
      explanation: "plan",
      steps: [
        { step: "step-a", status: "completed" },
        { step: "step-b", status: "completed" },
        { step: "step-c", status: "pending" },
      ],
    });
  });

  it("keeps finalized codex sessions visible during degraded partial refresh omission", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-main" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" },
          {
            id: "thread-finalized",
            name: "项目分析",
            updatedAt: 250,
            engineSource: "codex",
            threadKind: "native",
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [
        {
          id: "thread-main",
          name: "Main",
          updatedAt: 400,
          engineSource: "codex",
          isDegraded: true,
          partialSource: "local-session-scan-unavailable",
          degradedReason: "partial-thread-list",
        },
      ],
    });

    expect(next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id)).toEqual([
      "thread-main",
      "thread-finalized",
    ]);
  });

  it("drops finalized codex sessions when the refresh is authoritative", () => {
    const base: ThreadState = {
      ...initialState,
      activeThreadIdByWorkspace: { "ws-1": "thread-main" },
      threadsByWorkspace: {
        "ws-1": [
          { id: "thread-main", name: "Main", updatedAt: 300, engineSource: "codex" },
          {
            id: "thread-finalized",
            name: "项目分析",
            updatedAt: 250,
            engineSource: "codex",
            threadKind: "native",
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [
        {
          id: "thread-main",
          name: "Main",
          updatedAt: 400,
          engineSource: "codex",
        },
      ],
    });

    expect(next.threadsByWorkspace["ws-1"]?.map((thread) => thread.id)).toEqual([
      "thread-main",
    ]);
  });

  it("prevents confirmed thread titles from downgrading to generic fallback names", () => {
    const base: ThreadState = {
      ...initialState,
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "thread-finalized",
            name: "项目分析",
            updatedAt: 250,
            engineSource: "codex",
            threadKind: "native",
          },
        ],
      },
    };

    const next = threadReducer(base, {
      type: "setThreads",
      workspaceId: "ws-1",
      threads: [
        {
          id: "thread-finalized",
          name: "Codex Session",
          updatedAt: 400,
          engineSource: "codex",
        },
      ],
    });

    expect(next.threadsByWorkspace["ws-1"]?.[0]?.name).toBe("项目分析");
  });

});
