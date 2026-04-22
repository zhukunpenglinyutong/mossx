// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import type { ConversationState } from "../../threads/contracts/conversationCurtainContracts";

const mocks = vi.hoisted(() => ({
  isMacPlatform: vi.fn(),
  isWindowsPlatform: vi.fn(),
}));

vi.mock("../../../utils/platform", () => ({
  isMacPlatform: mocks.isMacPlatform,
  isWindowsPlatform: mocks.isWindowsPlatform,
}));

import { Messages } from "./Messages";

function renderMessages(options?: {
  isThinking?: boolean;
  activeEngine?: "claude" | "codex" | "gemini" | "opencode";
  conversationState?: ConversationState | null;
}) {
  const items: ConversationItem[] = [
    {
      id: "user-msg",
      kind: "message",
      role: "user",
      text: "继续",
    },
    {
      id: "assistant-msg",
      kind: "message",
      role: "assistant",
      text: "正在处理",
    },
  ];
  return render(
    <Messages
      items={items}
      threadId="thread-1"
      workspaceId="ws-1"
      isThinking={options?.isThinking ?? true}
      activeEngine={options?.activeEngine ?? "claude"}
      conversationState={options?.conversationState ?? null}
      openTargets={[]}
      selectedOpenAppId=""
    />,
  );
}

describe("Messages desktop render-safe mode", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  beforeEach(() => {
    mocks.isMacPlatform.mockReset();
    mocks.isWindowsPlatform.mockReset();
    mocks.isMacPlatform.mockReturnValue(false);
    mocks.isWindowsPlatform.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("adds render-safe class for Windows Claude live conversations", () => {
    mocks.isWindowsPlatform.mockReturnValue(true);

    const { container } = renderMessages();

    expect(container.firstElementChild?.className).toContain("claude-render-safe");
  });

  it("adds render-safe class for macOS Claude live conversations", () => {
    mocks.isMacPlatform.mockReturnValue(true);

    const { container } = renderMessages();

    expect(container.firstElementChild?.className).toContain("claude-render-safe");
  });

  it("does not add render-safe class outside supported desktop surfaces", () => {
    const { container } = renderMessages();

    expect(container.firstElementChild?.className).not.toContain("claude-render-safe");
  });

  it("uses normalized conversation state when prop thinking flag is stale", () => {
    mocks.isMacPlatform.mockReturnValue(true);

    const conversationState: ConversationState = {
      items: [],
      plan: null,
      userInputQueue: [],
      meta: {
        workspaceId: "ws-1",
        threadId: "thread-1",
        engine: "claude",
        activeTurnId: null,
        isThinking: true,
        heartbeatPulse: null,
        historyRestoredAtMs: null,
      },
    };

    const { container } = renderMessages({
      isThinking: false,
      conversationState,
    });

    expect(container.firstElementChild?.className).toContain("claude-render-safe");
  });

  it("removes render-safe class when normalized conversation state stops processing", () => {
    mocks.isWindowsPlatform.mockReturnValue(true);

    const activeConversationState: ConversationState = {
      items: [],
      plan: null,
      userInputQueue: [],
      meta: {
        workspaceId: "ws-1",
        threadId: "thread-1",
        engine: "claude",
        activeTurnId: null,
        isThinking: true,
        heartbeatPulse: null,
        historyRestoredAtMs: null,
      },
    };

    const idleConversationState: ConversationState = {
      ...activeConversationState,
      meta: {
        ...activeConversationState.meta,
        isThinking: false,
      },
    };

    const { container, rerender } = renderMessages({
      isThinking: true,
      conversationState: activeConversationState,
    });

    expect(container.firstElementChild?.className).toContain("claude-render-safe");

    rerender(
      <Messages
        items={[
          {
            id: "user-msg",
            kind: "message",
            role: "user",
            text: "继续",
          },
          {
            id: "assistant-msg",
            kind: "message",
            role: "assistant",
            text: "正在处理",
          },
        ]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        activeEngine="claude"
        conversationState={idleConversationState}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.firstElementChild?.className).not.toContain("claude-render-safe");
  });

  it("does not add render-safe class for non-Claude engines on desktop", () => {
    mocks.isWindowsPlatform.mockReturnValue(true);

    const { container } = renderMessages({
      activeEngine: "codex",
    });

    expect(container.firstElementChild?.className).not.toContain("claude-render-safe");
  });
});
