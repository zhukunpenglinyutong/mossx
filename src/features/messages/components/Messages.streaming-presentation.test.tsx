// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";

const timelineSnapshots = vi.hoisted(() => ({
  entries: [] as Array<{
    assistantFinalBoundaryIds: string[];
    liveAssistantIsFinal: boolean | null;
    liveAssistantText: string | null;
  }>,
}));

vi.mock("./MessagesTimeline", () => ({
  MessagesTimeline: (props: {
    assistantFinalBoundarySet: Set<string>;
    liveAssistantItem: Extract<ConversationItem, { kind: "message" }> | null;
  }) => {
    timelineSnapshots.entries.push({
      assistantFinalBoundaryIds: Array.from(props.assistantFinalBoundarySet),
      liveAssistantIsFinal: props.liveAssistantItem?.isFinal ?? null,
      liveAssistantText: props.liveAssistantItem?.text ?? null,
    });
    return <div data-testid="messages-timeline-probe" />;
  },
}));

import { Messages } from "./Messages";

describe("Messages streaming presentation contract", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    timelineSnapshots.entries = [];
    window.localStorage.setItem("ccgui.claude.hideReasoningModule", "0");
    window.localStorage.removeItem("ccgui.messages.live.autoFollow");
    window.localStorage.removeItem("ccgui.messages.live.collapseMiddleSteps");
  });

  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
    if (!HTMLElement.prototype.scrollTo) {
      HTMLElement.prototype.scrollTo = vi.fn();
    }
  });

  it("keeps heavy timeline derivations on the stable snapshot while the live assistant row updates immediately", async () => {
    const liveAssistantItem: Extract<ConversationItem, { kind: "message" }> = {
      id: "assistant-1",
      kind: "message",
      role: "assistant",
      text: "第一段输出",
      isFinal: false,
    };
    const initialItems: ConversationItem[] = [
      {
        id: "user-1",
        kind: "message",
        role: "user",
        text: "继续分析",
      },
      liveAssistantItem,
    ];

    const view = render(
      <Messages
        items={initialItems}
        threadId="thread-stream-contract"
        workspaceId="ws-1"
        isThinking
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    timelineSnapshots.entries = [];

    view.rerender(
      <Messages
        items={[
          initialItems[0],
          {
            ...liveAssistantItem,
            text: "第一段输出\n\n第二段输出",
            isFinal: true,
          },
        ]}
        threadId="thread-stream-contract"
        workspaceId="ws-1"
        isThinking
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(
      timelineSnapshots.entries.some(
        (entry) =>
          entry.liveAssistantText === "第一段输出\n\n第二段输出"
          && entry.liveAssistantIsFinal === true
          && entry.assistantFinalBoundaryIds.length === 0,
      ),
    ).toBe(true);

    await waitFor(() => {
      expect(
        timelineSnapshots.entries.some((entry) =>
          entry.assistantFinalBoundaryIds.includes("assistant-1")
        ),
      ).toBe(true);
    });
  });
});
