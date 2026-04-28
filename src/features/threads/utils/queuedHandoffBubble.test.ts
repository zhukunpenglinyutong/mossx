import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  appendQueuedHandoffBubbleIfNeeded,
  buildQueuedHandoffBubbleItem,
  hasPendingOptimisticUserBubble,
} from "./queuedHandoffBubble";

describe("queuedHandoffBubble", () => {
  it("appends a queued handoff bubble when no matching user message exists yet", () => {
    const bubble = buildQueuedHandoffBubbleItem({
      id: "queued-1",
      text: "继续排查这个问题",
      createdAt: 1,
      images: ["local://image-1"],
      sendOptions: {
        selectedAgent: {
          id: "agent-1",
          name: "排障助手",
          icon: "agent-robot-02",
        },
      },
    });

    const merged = appendQueuedHandoffBubbleIfNeeded([], bubble);

    expect(merged).toEqual([bubble]);
  });

  it("does not append the handoff bubble when history already contains the matching user message", () => {
    const bubble = buildQueuedHandoffBubbleItem({
      id: "queued-2",
      text: "hello codex",
      createdAt: 1,
    });
    const items: ConversationItem[] = [
      {
        id: "user-history-1",
        kind: "message",
        role: "user",
        text: "[Spec Root Priority] ... [User Input] hello codex",
      },
    ];

    const merged = appendQueuedHandoffBubbleIfNeeded(items, bubble);

    expect(merged).toEqual(items);
  });

  it("treats optimistic user bubbles as pending until authoritative history catches up", () => {
    const items: ConversationItem[] = [
      {
        id: "optimistic-user-1",
        kind: "message",
        role: "user",
        text: "排查一下这条 Computer Use 链路",
      },
    ];

    expect(hasPendingOptimisticUserBubble(items)).toBe(true);
    expect(
      hasPendingOptimisticUserBubble([
        {
          id: "user-history-1",
          kind: "message",
          role: "user",
          text: "排查一下这条 Computer Use 链路",
        },
      ]),
    ).toBe(false);
  });
});
