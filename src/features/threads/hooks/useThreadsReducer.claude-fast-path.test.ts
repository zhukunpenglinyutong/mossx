import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  __getPrepareThreadItemsCallCountForTests,
  __resetPrepareThreadItemsCallCountForTests,
} from "../../../utils/threadItems";
import { initialState, threadReducer } from "./useThreadsReducer";
import type { ThreadState } from "./useThreadsReducer";

function processingClaudeState(
  threadId: string,
  items: ConversationItem[],
): ThreadState {
  return {
    ...initialState,
    threadStatusById: {
      [threadId]: {
        isProcessing: true,
        hasUnread: false,
        isReviewing: false,
        isContextCompacting: false,
        processingStartedAt: Date.now() - 100,
        lastDurationMs: null,
        heartbeatPulse: 1,
      },
    },
    itemsByThread: {
      [threadId]: items,
    },
  };
}

describe("threadReducer Claude live delta fast path", () => {
  it("uses a fast path for repeated Claude live assistant text deltas", () => {
    const userItem: ConversationItem = {
      id: "user-1",
      kind: "message",
      role: "user",
      text: "继续",
    };
    const assistantItem: ConversationItem = {
      id: "assistant-live",
      kind: "message",
      role: "assistant",
      text: "Hello",
      isFinal: false,
    };
    const base = processingClaudeState("claude:thread-fast", [
      userItem,
      assistantItem,
    ]);

    __resetPrepareThreadItemsCallCountForTests();
    const first = threadReducer(base, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "claude:thread-fast",
      itemId: "assistant-live",
      delta: " world",
      hasCustomName: false,
    });
    const second = threadReducer(first, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "claude:thread-fast",
      itemId: "assistant-live",
      delta: "!",
      hasCustomName: false,
    });

    const items = second.itemsByThread["claude:thread-fast"] ?? [];
    expect(__getPrepareThreadItemsCallCountForTests()).toBe(0);
    expect(items[0]).toBe(userItem);
    expect(items[1]?.kind).toBe("message");
    if (items[1]?.kind === "message") {
      expect(items[1].text).toBe("Hello world!");
      expect(items[1].isFinal).toBe(false);
    }
  });

  it("returns Claude assistant text to canonical derivation on completion", () => {
    const base = processingClaudeState("claude:thread-complete", [
      {
        id: "assistant-live",
        kind: "message",
        role: "assistant",
        text: "Hello",
        isFinal: false,
      },
    ]);

    const streaming = threadReducer(base, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "claude:thread-complete",
      itemId: "assistant-live",
      delta: " world",
      hasCustomName: false,
    });

    __resetPrepareThreadItemsCallCountForTests();
    const completed = threadReducer(streaming, {
      type: "completeAgentMessage",
      workspaceId: "ws-1",
      threadId: "claude:thread-complete",
      itemId: "assistant-live",
      text: "Hello world",
      hasCustomName: false,
    });

    expect(__getPrepareThreadItemsCallCountForTests()).toBe(1);
    const message = completed.itemsByThread["claude:thread-complete"]?.[0];
    expect(message?.kind).toBe("message");
    if (message?.kind === "message") {
      expect(message.text).toBe("Hello world");
      expect(message.isFinal).toBe(true);
      expect(message.finalCompletedAt).toEqual(expect.any(Number));
    }
  });

  it("keeps assistant text normalization on the fast path", () => {
    const assistantItem: ConversationItem = {
      id: "assistant-live",
      kind: "message",
      role: "assistant",
      text: "Hello",
      isFinal: false,
    };
    const base = processingClaudeState("claude:thread-truncate", [
      assistantItem,
    ]);

    __resetPrepareThreadItemsCallCountForTests();
    const next = threadReducer(base, {
      type: "appendAgentDelta",
      workspaceId: "ws-1",
      threadId: "claude:thread-truncate",
      itemId: "assistant-live",
      delta: Array.from({ length: 5_000 }, (_, index) =>
        index.toString(36).padStart(4, "0"),
      ).join("|"),
      hasCustomName: false,
    });

    expect(__getPrepareThreadItemsCallCountForTests()).toBe(0);
    const message = next.itemsByThread["claude:thread-truncate"]?.[0];
    expect(message?.kind).toBe("message");
    if (message?.kind === "message") {
      expect(message.text).toHaveLength(20_000);
      expect(message.text.endsWith("...")).toBe(true);
      expect(message.isFinal).toBe(false);
    }
  });
});
