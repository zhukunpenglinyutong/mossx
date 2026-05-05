import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  buildLiveTailWorkingSet,
  buildRenderedItemsWindow,
  resolveStreamingPresentationItems,
} from "./messagesLiveWindow";

function userMessage(id: string, text = id): ConversationItem {
  return {
    id,
    kind: "message",
    role: "user",
    text,
  };
}

function assistantMessage(id: string, text = id): ConversationItem {
  return {
    id,
    kind: "message",
    role: "assistant",
    text,
  };
}

describe("messages live window", () => {
  it("builds a bounded live tail working set and preserves the sticky user", () => {
    const items: ConversationItem[] = [
      userMessage("user-old", "早期问题"),
      ...Array.from({ length: 68 }, (_, index) =>
        assistantMessage(`assistant-${index}`, `回复 ${index}`),
      ),
      userMessage("user-latest", "最新问题"),
      assistantMessage("assistant-live", "正在回答"),
    ];

    const workingSet = buildLiveTailWorkingSet(items, {
      isThinking: true,
      showAllHistoryItems: false,
      visibleWindow: 30,
    });

    expect(workingSet.items.length).toBeLessThan(items.length);
    expect(workingSet.items.some((item) => item.id === "user-latest")).toBe(true);
    expect(workingSet.items.at(-1)?.id).toBe("assistant-live");
    expect(workingSet.stickyUserMessageId).toBe("user-latest");
    expect(workingSet.omittedBeforeWorkingSetCount).toBeGreaterThan(0);
  });

  it("keeps full history when show all is enabled", () => {
    const items = Array.from({ length: 80 }, (_, index) =>
      assistantMessage(`assistant-${index}`, `回复 ${index}`),
    );

    const workingSet = buildLiveTailWorkingSet(items, {
      isThinking: true,
      showAllHistoryItems: true,
      visibleWindow: 30,
    });

    expect(workingSet.items).toBe(items);
    expect(workingSet.omittedBeforeWorkingSetCount).toBe(0);
  });

  it("adds omitted prefix count to rendered collapsed history count", () => {
    const items = [
      userMessage("user-latest", "最新问题"),
      ...Array.from({ length: 60 }, (_, index) =>
        assistantMessage(`assistant-${index}`, `回复 ${index}`),
      ),
    ];
    const workingSet = buildLiveTailWorkingSet(items, {
      isThinking: true,
      showAllHistoryItems: false,
      visibleWindow: 30,
    });
    const localCollapsedCount = Math.max(0, workingSet.items.length - 30);
    const renderedWindow = buildRenderedItemsWindow(
      workingSet.items,
      localCollapsedCount,
      workingSet.stickyUserMessageId,
    );

    expect(
      renderedWindow.visibleCollapsedHistoryItemCount
        + workingSet.omittedBeforeWorkingSetCount,
    ).toBe(items.length - renderedWindow.renderedItems.length);
    expect(renderedWindow.renderedItems.some((item) => item.id === "user-latest")).toBe(true);
  });

  it("keeps a deferred presentation snapshot stable while appending newly inserted live items", () => {
    const deferredItems = [
      userMessage("user-1", "问题"),
      assistantMessage("assistant-1", "第一版输出"),
    ];
    const currentItems = [
      userMessage("user-1", "问题"),
      assistantMessage("assistant-1", "第一版输出后续增量"),
      assistantMessage("assistant-2", "新的 live 尾项"),
    ];

    const resolvedItems = resolveStreamingPresentationItems(
      deferredItems,
      currentItems,
      true,
    );

    expect(resolvedItems).toEqual([
      deferredItems[0],
      deferredItems[1],
      currentItems[2],
    ]);
  });

  it("reuses the deferred presentation snapshot reference when streaming only updates existing ids", () => {
    const deferredItems = [
      userMessage("user-1", "问题"),
      assistantMessage("assistant-1", "第一版输出"),
    ];
    const currentItems = [
      userMessage("user-1", "问题"),
      assistantMessage("assistant-1", "第一版输出后续增量"),
    ];

    const resolvedItems = resolveStreamingPresentationItems(
      deferredItems,
      currentItems,
      true,
    );

    expect(resolvedItems).toBe(deferredItems);
  });
});
