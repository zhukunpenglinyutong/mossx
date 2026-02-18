import { describe, expect, it } from "vitest";
import type { ConversationItem, ThreadSummary } from "../../../types";
import { initialState, threadReducer } from "./useThreadsReducer";
import type { ThreadState } from "./useThreadsReducer";

describe("threadReducer", () => {
  it("ensures thread with default name and active selection", () => {
    const next = threadReducer(initialState, {
      type: "ensureThread",
      workspaceId: "ws-1",
      threadId: "thread-1",
    });
    const threads = next.threadsByWorkspace["ws-1"] ?? [];
    expect(threads).toHaveLength(1);
    expect(threads[0].name).toBe("Agent 1");
    expect(next.activeThreadIdByWorkspace["ws-1"]).toBe("thread-1");
    expect(next.threadStatusById["thread-1"]?.isProcessing).toBe(false);
  });

  it("resolves raw session id to existing prefixed engine thread", () => {
    const next = threadReducer(
      {
        ...initialState,
        threadsByWorkspace: {
          "ws-1": [
            {
              id: "opencode:session-xyz",
              name: "Agent 1",
              updatedAt: 1,
              engineSource: "opencode",
            },
          ],
        },
      },
      {
        type: "ensureThread",
        workspaceId: "ws-1",
        threadId: "session-xyz",
      },
    );

    expect(next.threadsByWorkspace["ws-1"]).toHaveLength(1);
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.id).toBe("opencode:session-xyz");
    expect(next.threadStatusById["session-xyz"]).toBeUndefined();
  });

  it("updates thread engine source when requested", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-1", name: "Agent 1", updatedAt: 1, engineSource: "codex" },
    ];
    const next = threadReducer(
      {
        ...initialState,
        threadsByWorkspace: { "ws-1": threads },
      },
      {
        type: "setThreadEngine",
        workspaceId: "ws-1",
        threadId: "thread-1",
        engine: "claude",
      },
    );
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.engineSource).toBe("claude");
  });

  it("renames auto-generated thread on first user message", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-1", name: "Agent 1", updatedAt: 1 },
    ];
    const next = threadReducer(
      {
        ...initialState,
        threadsByWorkspace: { "ws-1": threads },
      },
      {
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "thread-1",
        item: {
          id: "user-1",
          kind: "message",
          role: "user",
          text: "Hello there",
        },
        hasCustomName: false,
      },
    );
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.name).toBe("Hello there");
    const items = next.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(1);
    if (items[0]?.kind === "message") {
      expect(items[0].id).toBe("user-1");
      expect(items[0].text).toBe("Hello there");
    }
  });

  it("renames auto-generated thread from assistant output when no user message", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-1", name: "Agent 1", updatedAt: 1 },
    ];
    const next = threadReducer(
      {
        ...initialState,
        threadsByWorkspace: { "ws-1": threads },
        itemsByThread: { "thread-1": [] },
      },
      {
        type: "appendAgentDelta",
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "assistant-1",
        delta: "Assistant note",
        hasCustomName: false,
      },
    );
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.name).toBe("Assistant note");
  });

  it("updates thread timestamp when newer activity arrives", () => {
    const threads: ThreadSummary[] = [
      { id: "thread-1", name: "Agent 1", updatedAt: 1000 },
    ];
    const next = threadReducer(
      {
        ...initialState,
        threadsByWorkspace: { "ws-1": threads },
      },
      {
        type: "setThreadTimestamp",
        workspaceId: "ws-1",
        threadId: "thread-1",
        timestamp: 1500,
      },
    );
    expect(next.threadsByWorkspace["ws-1"]?.[0]?.updatedAt).toBe(1500);
  });

  it("tracks processing durations", () => {
    const started = threadReducer(
      {
        ...initialState,
        threadStatusById: {
          "thread-1": {
            isProcessing: false,
            hasUnread: false,
            isReviewing: false,
            processingStartedAt: null,
            lastDurationMs: null,
          },
        },
      },
      {
        type: "markProcessing",
        threadId: "thread-1",
        isProcessing: true,
        timestamp: 1000,
      },
    );
    const stopped = threadReducer(started, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: false,
      timestamp: 1600,
    });
    expect(stopped.threadStatusById["thread-1"]?.lastDurationMs).toBe(600);
  });

  it("tracks heartbeat pulses only while processing", () => {
    const started = threadReducer(initialState, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: 1000,
    });
    const pulsed = threadReducer(started, {
      type: "markHeartbeat",
      threadId: "thread-1",
      pulse: 2,
    });
    expect(pulsed.threadStatusById["thread-1"]?.heartbeatPulse).toBe(2);

    const stalePulse = threadReducer(pulsed, {
      type: "markHeartbeat",
      threadId: "thread-1",
      pulse: 1,
    });
    expect(stalePulse.threadStatusById["thread-1"]?.heartbeatPulse).toBe(2);

    const stopped = threadReducer(pulsed, {
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: false,
      timestamp: 1500,
    });
    expect(stopped.threadStatusById["thread-1"]?.heartbeatPulse ?? 0).toBe(0);
  });

  it("tracks request user input queue", () => {
    const request = {
      workspace_id: "ws-1",
      request_id: 99,
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "call-1",
        questions: [{ id: "q1", header: "Confirm", question: "Proceed?" }],
      },
    };
    const added = threadReducer(initialState, {
      type: "addUserInputRequest",
      request,
    });
    expect(added.userInputRequests).toHaveLength(1);
    expect(added.userInputRequests[0]).toEqual(request);

    const removed = threadReducer(added, {
      type: "removeUserInputRequest",
      requestId: 99,
      workspaceId: "ws-1",
    });
    expect(removed.userInputRequests).toHaveLength(0);
  });

  it("drops local review-start items when server review starts", () => {
    const localReview: ConversationItem = {
      id: "review-start-1",
      kind: "review",
      state: "started",
      text: "",
    };
    const incomingReview: ConversationItem = {
      id: "remote-review-1",
      kind: "review",
      state: "started",
      text: "",
    };
    const next = threadReducer(
      {
        ...initialState,
        itemsByThread: { "thread-1": [localReview] },
      },
      {
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "thread-1",
        item: incomingReview,
      },
    );
    const items = next.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("remote-review-1");
  });

  it("appends review items when ids repeat", () => {
    const firstReview: ConversationItem = {
      id: "review-mode",
      kind: "review",
      state: "started",
      text: "Reviewing changes",
    };
    const next = threadReducer(
      {
        ...initialState,
        itemsByThread: { "thread-1": [firstReview] },
      },
      {
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "thread-1",
        item: {
          id: "review-mode",
          kind: "review",
          state: "completed",
          text: "Reviewing changes",
        },
      },
    );
    const items = next.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe("review-mode");
    expect(items[1]?.id).toBe("review-mode-1");
  });

  it("ignores duplicate review items with identical id, state, and text", () => {
    const firstReview: ConversationItem = {
      id: "review-mode",
      kind: "review",
      state: "started",
      text: "Reviewing changes",
    };
    const next = threadReducer(
      {
        ...initialState,
        itemsByThread: { "thread-1": [firstReview] },
      },
      {
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "thread-1",
        item: {
          id: "review-mode",
          kind: "review",
          state: "started",
          text: "Reviewing changes",
        },
      },
    );
    const items = next.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("review-mode");
  });

  it("dedupes review items with identical content", () => {
    const firstReview: ConversationItem = {
      id: "review-mode",
      kind: "review",
      state: "completed",
      text: "Reviewing changes",
    };
    const next = threadReducer(
      {
        ...initialState,
        itemsByThread: { "thread-1": [firstReview] },
      },
      {
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "thread-1",
        item: {
          id: "review-mode-duplicate",
          kind: "review",
          state: "completed",
          text: "Reviewing changes",
        },
      },
    );
    const items = next.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("review-mode");
  });

  it("appends reasoning summary and content when missing", () => {
    const withSummary = threadReducer(initialState, {
      type: "appendReasoningSummary",
      threadId: "thread-1",
      itemId: "reasoning-1",
      delta: "Short plan",
    });
    const summaryItem = withSummary.itemsByThread["thread-1"]?.[0];
    expect(summaryItem?.kind).toBe("reasoning");
    if (summaryItem?.kind === "reasoning") {
      expect(summaryItem.summary).toBe("Short plan");
      expect(summaryItem.content).toBe("");
    }

    const withContent = threadReducer(withSummary, {
      type: "appendReasoningContent",
      threadId: "thread-1",
      itemId: "reasoning-1",
      delta: "More detail",
    });
    const contentItem = withContent.itemsByThread["thread-1"]?.[0];
    expect(contentItem?.kind).toBe("reasoning");
    if (contentItem?.kind === "reasoning") {
      expect(contentItem.summary).toBe("Short plan");
      expect(contentItem.content).toBe("More detail");
    }
  });

  it("inserts a reasoning summary boundary between sections", () => {
    const withSummary = threadReducer(initialState, {
      type: "appendReasoningSummary",
      threadId: "thread-1",
      itemId: "reasoning-1",
      delta: "Exploring files",
    });
    const withBoundary = threadReducer(withSummary, {
      type: "appendReasoningSummaryBoundary",
      threadId: "thread-1",
      itemId: "reasoning-1",
    });
    const withSecondSummary = threadReducer(withBoundary, {
      type: "appendReasoningSummary",
      threadId: "thread-1",
      itemId: "reasoning-1",
      delta: "Searching for routes",
    });

    const item = withSecondSummary.itemsByThread["thread-1"]?.[0];
    expect(item?.kind).toBe("reasoning");
    if (item?.kind === "reasoning") {
      expect(item.summary).toBe("Exploring files\n\nSearching for routes");
    }
  });

  it("appends a deduped context compacted message", () => {
    const withCompacted = threadReducer(initialState, {
      type: "appendContextCompacted",
      threadId: "thread-1",
      turnId: "turn-1",
    });
    const withDuplicate = threadReducer(withCompacted, {
      type: "appendContextCompacted",
      threadId: "thread-1",
      turnId: "turn-1",
    });

    const items = withDuplicate.itemsByThread["thread-1"] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("message");
    if (items[0]?.kind === "message") {
      expect(items[0].text).toBe("Context compacted.");
      expect(items[0].id).toBe("context-compacted-turn-1");
    }
  });

  it("ignores tool output deltas when the item is not a tool", () => {
    const message: ConversationItem = {
      id: "tool-1",
      kind: "message",
      role: "assistant",
      text: "Hi",
    };
    const base: ThreadState = {
      ...initialState,
      itemsByThread: { "thread-1": [message] },
    };
    const next = threadReducer(base, {
      type: "appendToolOutput",
      threadId: "thread-1",
      itemId: "tool-1",
      delta: "delta",
    });
    expect(next).toBe(base);
  });

  it("adds and removes user input requests by workspace and id", () => {
    const requestA = {
      workspace_id: "ws-1",
      request_id: 1,
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "item-1",
        questions: [],
      },
    };
    const requestB = {
      workspace_id: "ws-2",
      request_id: 1,
      params: {
        thread_id: "thread-2",
        turn_id: "turn-2",
        item_id: "item-2",
        questions: [],
      },
    };

    const added = threadReducer(initialState, {
      type: "addUserInputRequest",
      request: requestA,
    });
    expect(added.userInputRequests).toEqual([requestA]);

    const deduped = threadReducer(added, {
      type: "addUserInputRequest",
      request: requestA,
    });
    expect(deduped.userInputRequests).toHaveLength(1);

    const withSecond = threadReducer(added, {
      type: "addUserInputRequest",
      request: requestB,
    });
    expect(withSecond.userInputRequests).toHaveLength(2);

    const removed = threadReducer(withSecond, {
      type: "removeUserInputRequest",
      requestId: 1,
      workspaceId: "ws-1",
    });
    expect(removed.userInputRequests).toEqual([requestB]);
  });

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
});
