// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { Messages } from "./Messages";

describe("Messages codex live streaming", () => {
  beforeEach(() => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renders the latest codex assistant row as a live markdown surface during large streaming output", () => {
    const items: ConversationItem[] = [
      {
        id: "user-codex-live-1",
        kind: "message",
        role: "user",
        text: "继续做项目审计",
      },
      {
        id: "assistant-codex-live-1",
        kind: "message",
        role: "assistant",
        text: Array.from(
          { length: 14 },
          (_, index) => `- 第 ${index + 1} 条审计结论：这是长段 streaming 输出`,
        ).join("\n"),
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-codex-live-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const liveMarkdown = container.querySelector(".message.assistant .markdown-live-streaming");
    expect(liveMarkdown).toBeTruthy();
    expect(container.querySelector(".message.assistant .markdown-live-plain-text")).toBeNull();
  });
});
