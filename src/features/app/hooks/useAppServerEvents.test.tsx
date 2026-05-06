// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import {
  clearSharedSessionBindingsForSharedThread,
  registerSharedSessionNativeBinding,
} from "../../shared-session/runtime/sharedSessionBridge";
import { updateSharedSessionNativeBinding as updateSharedSessionNativeBindingService } from "../../shared-session/services/sharedSessions";
import { useAppServerEvents } from "./useAppServerEvents";

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(),
}));

vi.mock("../../shared-session/services/sharedSessions", () => ({
  updateSharedSessionNativeBinding: vi.fn(() => Promise.resolve(null)),
}));

type Handlers = Parameters<typeof useAppServerEvents>[0];
type HookOptions = Parameters<typeof useAppServerEvents>[1];

function TestHarness({
  handlers,
  options,
}: {
  handlers: Handlers;
  options?: HookOptions;
}) {
  useAppServerEvents(handlers, options);
  return null;
}

let listener: ((event: AppServerEvent) => void) | null = null;
const unlisten = vi.fn();

beforeEach(() => {
  listener = null;
  unlisten.mockReset();
  vi.mocked(subscribeAppServerEvents).mockImplementation((cb) => {
    listener = cb;
    return unlisten;
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function mount(handlers: Handlers, options?: HookOptions) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<TestHarness handlers={handlers} options={options} />);
  });
  return { root };
}

describe("useAppServerEvents", () => {
  it("falls back to active codex thread for reasoning events without threadId", async () => {
    const handlers: Handlers = {
      onAppServerEvent: vi.fn(),
      onReasoningSummaryDelta: vi.fn(),
      onReasoningTextDelta: vi.fn(),
      onReasoningSummaryBoundary: vi.fn(),
      getActiveCodexThreadId: vi.fn(() => "codex:active-thread"),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "response.reasoning_summary_text.delta",
          params: {
            item: { id: "reasoning-1" },
            delta: "checking sibling specs",
          },
        },
      });
    });
    expect(handlers.onReasoningSummaryDelta).toHaveBeenCalledWith(
      "ws-1",
      "codex:active-thread",
      "reasoning-1",
      "checking sibling specs",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "response.reasoning_summary_part.added",
          params: {
            part: { item_id: "reasoning-2" },
          },
        },
      });
    });
    expect(handlers.onReasoningSummaryBoundary).toHaveBeenCalledWith(
      "ws-1",
      "codex:active-thread",
      "reasoning-2",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "response.reasoning_text.delta",
          params: {
            item_id: "reasoning-3",
            text: "I am verifying sibling spec directories.",
          },
        },
      });
    });
    expect(handlers.onReasoningTextDelta).toHaveBeenCalledWith(
      "ws-1",
      "codex:active-thread",
      "reasoning-3",
      "I am verifying sibling spec directories.",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("routes agent delta when threadId is nested in turn and payload uses text field", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: {
            turn: { threadId: "claude:session-1", id: "turn-1" },
            itemId: "item-1",
            text: "chunk-from-text-field",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "claude:session-1",
      itemId: "item-1",
      delta: "chunk-from-text-field",
      turnId: "turn-1",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("routes item and tool-delta events when threadId is nested in turn", async () => {
    const handlers: Handlers = {
      onItemStarted: vi.fn(),
      onCommandOutputDelta: vi.fn(),
      onReasoningSummaryDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/started",
          params: {
            turn: { threadId: "claude:session-1" },
            item: { id: "tool-1", type: "commandExecution", status: "started" },
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/commandExecution/outputDelta",
          params: {
            turn: { threadId: "claude:session-1", itemId: "tool-1" },
            delta: "partial output",
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/reasoning/summaryTextDelta",
          params: {
            turn: { threadId: "claude:session-1", itemId: "reasoning-1" },
            delta: "thinking...",
          },
        },
      });
    });

    expect(handlers.onItemStarted).toHaveBeenCalledWith("ws-1", "claude:session-1", {
      id: "tool-1",
      type: "commandExecution",
      status: "started",
    });
    expect(handlers.onCommandOutputDelta).toHaveBeenCalledWith(
      "ws-1",
      "claude:session-1",
      "tool-1",
      "partial output",
    );
    expect(handlers.onReasoningSummaryDelta).toHaveBeenCalledWith(
      "ws-1",
      "claude:session-1",
      "reasoning-1",
      "thinking...",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("passes turnId through legacy agent message delta events", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-codex-legacy-delta",
            turnId: "turn-codex-legacy-delta",
            itemId: "assistant-delta-1",
            delta: "legacy delta",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-codex",
      threadId: "thread-codex-legacy-delta",
      itemId: "assistant-delta-1",
      delta: "legacy delta",
      turnId: "turn-codex-legacy-delta",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("hydrates turnId into legacy raw item events", async () => {
    const handlers: Handlers = {
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/updated",
          params: {
            threadId: "thread-codex-legacy-item",
            turnId: "turn-codex-legacy-item",
            item: {
              id: "cmd-legacy-item",
              type: "commandExecution",
              status: "running",
            },
          },
        },
      });
    });

    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-codex",
      "thread-codex-legacy-item",
      expect.objectContaining({
        id: "cmd-legacy-item",
        type: "commandExecution",
        turnId: "turn-codex-legacy-item",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("preserves shared-session engine source on legacy raw item events", async () => {
    const handlers: Handlers = {
      onItemUpdated: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-shared-claude-legacy-item",
      sharedThreadId: "shared:thread-claude-legacy-item",
      nativeThreadId: "claude:legacy-native-item",
      engine: "claude",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-shared-claude-legacy-item",
        message: {
          method: "item/updated",
          params: {
            threadId: "claude:legacy-native-item",
            turnId: "turn-shared-claude-legacy-item",
            item: {
              id: "tool-shared-claude",
              type: "commandExecution",
              status: "running",
            },
          },
        },
      });
    });

    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-shared-claude-legacy-item",
      "shared:thread-claude-legacy-item",
      expect.objectContaining({
        id: "tool-shared-claude",
        type: "commandExecution",
        turnId: "turn-shared-claude-legacy-item",
        engineSource: "claude",
      }),
    );

    clearSharedSessionBindingsForSharedThread(
      "ws-shared-claude-legacy-item",
      "shared:thread-claude-legacy-item",
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("routes item/agentMessage/textDelta alias in legacy event path", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/textDelta",
          params: {
            threadId: "claude:session-2",
            itemId: "item-2",
            delta: "alias-delta",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "claude:session-2",
      itemId: "item-2",
      delta: "alias-delta",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores delta events missing required fields", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "", itemId: "item-1", delta: "Hello" },
        },
      });
    });
    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "", delta: "Hello" },
        },
      });
    });
    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "" },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("passes engine hint when thread session id is updated", async () => {
    const handlers: Handlers = {
      onThreadSessionIdUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-opencode",
        message: {
          method: "thread/started",
          params: {
            threadId: "opencode-pending-1",
            sessionId: "ses_1",
            turnId: "turn-1",
            engine: "opencode",
          },
        },
      });
    });

    expect(handlers.onThreadSessionIdUpdated).toHaveBeenCalledWith(
      "ws-opencode",
      "opencode-pending-1",
      "ses_1",
      "opencode",
      "turn-1",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps codex shared-session native binding unchanged on thread/started", async () => {
    const handlers: Handlers = {
      onTurnCompleted: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-shared-codex",
      sharedThreadId: "shared:thread-codex",
      nativeThreadId: "codex-native-thread-1",
      engine: "codex",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-shared-codex",
        message: {
          method: "thread/started",
          params: {
            threadId: "codex-native-thread-1",
            sessionId: "codex-native-thread-1",
            engine: "codex",
          },
        },
      });
      listener?.({
        workspace_id: "ws-shared-codex",
        message: {
          method: "turn/completed",
          params: {
            threadId: "codex-native-thread-1",
            turnId: "turn-codex-1",
          },
        },
      });
    });

    expect(updateSharedSessionNativeBindingService).not.toHaveBeenCalled();
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-shared-codex",
      "shared:thread-codex",
      "turn-codex-1",
    );

    clearSharedSessionBindingsForSharedThread("ws-shared-codex", "shared:thread-codex");
    await act(async () => {
      root.unmount();
    });
  });

  it("passes shared-session engine hint on stalled turns", async () => {
    const handlers: Handlers = {
      onTurnStalled: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-shared-claude-stalled",
      sharedThreadId: "shared:thread-claude-stalled",
      nativeThreadId: "claude:stalled-native-1",
      engine: "claude",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-shared-claude-stalled",
        message: {
          method: "turn/stalled",
          params: {
            threadId: "claude:stalled-native-1",
            turnId: "turn-shared-claude-stalled",
            message: "resume stalled",
            reasonCode: "resume_pending_timeout",
            stage: "stalled",
            source: "turn/stalled",
          },
        },
      });
    });

    expect(handlers.onTurnStalled).toHaveBeenCalledWith(
      "ws-shared-claude-stalled",
      "shared:thread-claude-stalled",
      "turn-shared-claude-stalled",
      expect.objectContaining({
        message: "resume stalled",
        reasonCode: "resume_pending_timeout",
        engine: "claude",
      }),
    );

    clearSharedSessionBindingsForSharedThread(
      "ws-shared-claude-stalled",
      "shared:thread-claude-stalled",
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("rebinds pending codex shared-session native ids on first thread/started", async () => {
    const handlers: Handlers = {
      onThreadStarted: vi.fn(),
      onTurnCompleted: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-shared-codex-pending",
      sharedThreadId: "shared:thread-codex-pending",
      nativeThreadId: "codex-pending-shared-1",
      engine: "codex",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-shared-codex-pending",
        message: {
          method: "thread/started",
          params: {
            threadId: "550e8400-e29b-41d4-a716-446655440000",
            sessionId: "550e8400-e29b-41d4-a716-446655440000",
            engine: "codex",
          },
        },
      });
      listener?.({
        workspace_id: "ws-shared-codex-pending",
        message: {
          method: "turn/completed",
          params: {
            threadId: "550e8400-e29b-41d4-a716-446655440000",
            turnId: "turn-codex-pending-1",
          },
        },
      });
    });

    expect(handlers.onThreadStarted).not.toHaveBeenCalled();
    expect(updateSharedSessionNativeBindingService).toHaveBeenCalledWith(
      "ws-shared-codex-pending",
      "shared:thread-codex-pending",
      "codex",
      "codex-pending-shared-1",
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-shared-codex-pending",
      "shared:thread-codex-pending",
      "turn-codex-pending-1",
    );

    clearSharedSessionBindingsForSharedThread(
      "ws-shared-codex-pending",
      "shared:thread-codex-pending",
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("rebinds non-codex shared-session native thread ids on thread/started", async () => {
    const handlers: Handlers = {
      onTurnCompleted: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-shared-claude",
      sharedThreadId: "shared:thread-claude",
      nativeThreadId: "claude-pending-shared-1",
      engine: "claude",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-shared-claude",
        message: {
          method: "thread/started",
          params: {
            threadId: "claude-pending-shared-1",
            sessionId: "ses_123",
            engine: "claude",
          },
        },
      });
      listener?.({
        workspace_id: "ws-shared-claude",
        message: {
          method: "turn/completed",
          params: {
            threadId: "claude:ses_123",
            turnId: "turn-claude-1",
          },
        },
      });
    });

    expect(updateSharedSessionNativeBindingService).toHaveBeenCalledWith(
      "ws-shared-claude",
      "shared:thread-claude",
      "claude",
      "claude-pending-shared-1",
      "claude:ses_123",
    );
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-shared-claude",
      "shared:thread-claude",
      "turn-claude-1",
    );

    clearSharedSessionBindingsForSharedThread("ws-shared-claude", "shared:thread-claude");
    await act(async () => {
      root.unmount();
    });
  });

  it("emits fallback assistant completion from turn/completed result text when no delta arrived", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onTurnCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            result: { text: "final response from result" },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "turn-1",
      text: "final response from result",
    });
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");

    await act(async () => {
      root.unmount();
    });
  });

  it("does not emit fallback assistant completion when delta already arrived", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onTurnCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "streaming..." },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            result: { text: "final response from result" },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).not.toHaveBeenCalled();
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");

    await act(async () => {
      root.unmount();
    });
  });

  it("does not emit duplicated completion when item/completed already delivered agent text", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onTurnCompleted: vi.fn(),
      onItemCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-1", text: "final response" },
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "turn/completed",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            result: { text: "final response" },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");

    await act(async () => {
      root.unmount();
    });
  });

  it("does not emit fallback completion when agentMessage snapshot already arrived via item/updated", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onTurnCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/updated",
          params: {
            threadId: "codex:thread-1",
            item: { type: "agentMessage", id: "item-1", text: "final response" },
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "turn/completed",
          params: {
            threadId: "codex:thread-1",
            turnId: "turn-1",
            result: { text: "final response" },
          },
        },
      });
    });

    expect(handlers.onItemUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).not.toHaveBeenCalled();
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-1",
      "codex:thread-1",
      "turn-1",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps turn/completed fallback when agentMessage snapshot text is empty", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onTurnCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/updated",
          params: {
            threadId: "codex:thread-1",
            item: { type: "agentMessage", id: "item-empty", text: "" },
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "turn/completed",
          params: {
            threadId: "codex:thread-1",
            turnId: "turn-2",
            result: { text: "final response from result" },
          },
        },
      });
    });

    expect(handlers.onItemUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "codex:thread-1",
      itemId: "turn-2",
      text: "final response from result",
    });
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-1",
      "codex:thread-1",
      "turn-2",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("does not emit fallback completion in shared session when agentMessage snapshot already has text", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onTurnCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-shared-codex-turn",
      sharedThreadId: "shared:thread-codex-turn",
      nativeThreadId: "codex-native-thread-turn",
      engine: "codex",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-shared-codex-turn",
        message: {
          method: "item/updated",
          params: {
            threadId: "codex-native-thread-turn",
            item: { type: "agentMessage", id: "item-1", text: "shared final response" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-shared-codex-turn",
        message: {
          method: "turn/completed",
          params: {
            threadId: "codex-native-thread-turn",
            turnId: "turn-shared-1",
            result: { text: "shared final response" },
          },
        },
      });
    });

    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-shared-codex-turn",
      "shared:thread-codex-turn",
      expect.objectContaining({
        type: "agentMessage",
        id: "item-1",
        text: "shared final response",
      }),
    );
    expect(handlers.onAgentMessageCompleted).not.toHaveBeenCalled();
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-shared-codex-turn",
      "shared:thread-codex-turn",
      "turn-shared-1",
    );

    clearSharedSessionBindingsForSharedThread(
      "ws-shared-codex-turn",
      "shared:thread-codex-turn",
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("keeps shared-session turn/completed fallback when snapshot text is empty", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onTurnCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-shared-codex-empty",
      sharedThreadId: "shared:thread-codex-empty",
      nativeThreadId: "codex-native-thread-empty",
      engine: "codex",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-shared-codex-empty",
        message: {
          method: "item/updated",
          params: {
            threadId: "codex-native-thread-empty",
            item: { type: "agentMessage", id: "item-empty", text: "" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-shared-codex-empty",
        message: {
          method: "turn/completed",
          params: {
            threadId: "codex-native-thread-empty",
            turnId: "turn-shared-empty-1",
            result: { text: "shared fallback response" },
          },
        },
      });
    });

    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-shared-codex-empty",
      "shared:thread-codex-empty",
      expect.objectContaining({
        type: "agentMessage",
        id: "item-empty",
      }),
    );
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-shared-codex-empty",
      threadId: "shared:thread-codex-empty",
      itemId: "turn-shared-empty-1",
      text: "shared fallback response",
    });
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-shared-codex-empty",
      "shared:thread-codex-empty",
      "turn-shared-empty-1",
    );

    clearSharedSessionBindingsForSharedThread(
      "ws-shared-codex-empty",
      "shared:thread-codex-empty",
    );
    await act(async () => {
      root.unmount();
    });
  });

  it("keeps multiple agent completions in the same thread when item ids differ", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onItemCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-1", text: "first short paragraph" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-2", text: "second short paragraph" },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(2);
    expect(handlers.onAgentMessageCompleted).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-1",
      text: "first short paragraph",
    });
    expect(handlers.onAgentMessageCompleted).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-2",
      text: "second short paragraph",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("dedupes repeated item/completed snapshots for the same agent item id", async () => {
    const handlers: Handlers = {
      onAgentMessageCompleted: vi.fn(),
      onItemCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-dup-1", text: "same completion text" },
          },
        },
      });
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-dup-1", text: "same completion text" },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-dup-1",
      text: "same completion text",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("routes processing heartbeat events", async () => {
    const handlers: Handlers = {
      onProcessingHeartbeat: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "processing/heartbeat",
          params: { threadId: "thread-1", pulse: 3 },
        },
      });
    });

    expect(handlers.onProcessingHeartbeat).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      3,
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("routes opencode text:delta through normalized realtime adapters when enabled", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-opencode",
        message: {
          method: "text:delta",
          params: {
            threadId: "opencode:ses_99",
            itemId: "assistant-1",
            delta: "streaming text",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-opencode",
      threadId: "opencode:ses_99",
      itemId: "assistant-1",
      delta: "streaming text",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("routes claude item/updated agentMessage snapshot in normalized realtime routing", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/updated",
          params: {
            threadId: "claude:session-100",
            item: {
              id: "assistant-100",
              type: "agentMessage",
              text: "snapshot text",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-100",
      itemId: "assistant-100",
      delta: "snapshot text",
    });
    expect(handlers.onItemUpdated).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes codex/raw native image generation events when thread id is present", async () => {
    const handlers: Handlers = {
      onItemStarted: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "codex/raw",
          params: {
            threadId: "thread-codex-image",
            type: "event_msg",
            payload: {
              type: "image_generation_end",
              call_id: "ig-raw-fallback-1",
              status: "generating",
              revised_prompt: "搬砖工人的卡通图",
            },
          },
        },
      });
    });

    expect(handlers.onItemStarted).toHaveBeenCalledWith(
      "ws-codex",
      "thread-codex-image",
      expect.objectContaining({
        id: "ig-raw-fallback-1",
        type: "image_generation_end",
        call_id: "ig-raw-fallback-1",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("routes codex/raw imagegen function calls without broad text guessing", async () => {
    const handlers: Handlers = {
      onItemStarted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "codex/raw",
          params: {
            threadId: "thread-codex-image-function",
            type: "response_item",
            payload: {
              type: "function_call",
              call_id: "ig-function-route-1",
              name: "imagegen",
              arguments: JSON.stringify({
                prompt: "一张山谷风景图",
              }),
            },
          },
        },
      });
    });

    expect(handlers.onItemStarted).toHaveBeenCalledWith(
      "ws-codex",
      "thread-codex-image-function",
      expect.objectContaining({
        id: "ig-function-route-1",
        type: "mcpToolCall",
        tool: "imagegen",
        status: "in_progress",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("routes codex/raw image generation events to the active codex thread when thread identity is missing", async () => {
    const handlers: Handlers = {
      onItemStarted: vi.fn(),
      getActiveCodexThreadId: vi.fn(() => "thread-codex-image-active"),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "codex/raw",
          params: {
            type: "event_msg",
            payload: {
              type: "image_generation_call",
              call_id: "ig-raw-active-1",
              status: "generating",
              revised_prompt: "一张狮虎搏杀的电影级海报",
            },
          },
        },
      });
    });

    expect(handlers.getActiveCodexThreadId).toHaveBeenCalledWith("ws-codex");
    expect(handlers.onItemStarted).toHaveBeenCalledWith(
      "ws-codex",
      "thread-codex-image-active",
      expect.objectContaining({
        id: "ig-raw-active-1",
        type: "image_generation_call",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores codex/raw image generation events without any thread identity fallback", async () => {
    const handlers: Handlers = {
      onItemStarted: vi.fn(),
      getActiveCodexThreadId: vi.fn(() => ""),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "codex/raw",
          params: {
            type: "event_msg",
            payload: {
              type: "image_generation_call",
              call_id: "ig-raw-no-thread-1",
              status: "generating",
              revised_prompt: "一张狮虎搏杀的电影级海报",
            },
          },
        },
      });
    });

    expect(handlers.getActiveCodexThreadId).toHaveBeenCalledWith("ws-codex");
    expect(handlers.onItemStarted).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes claude growing assistant snapshots in normalized mode when delta and snapshot coexist", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
      onItemStarted: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "turn/started",
          params: {
            threadId: "claude:session-seq-1",
            turnId: "turn-1",
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "claude:session-seq-1",
            itemId: "assistant-seq-1",
            delta: "第一段",
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/started",
          params: {
            threadId: "claude:session-seq-1",
            item: {
              id: "assistant-seq-1",
              type: "agentMessage",
              text: "第一段",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/updated",
          params: {
            threadId: "claude:session-seq-1",
            item: {
              id: "assistant-seq-1",
              type: "agentMessage",
              text: "第一段第二段",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "claude:session-seq-1",
            itemId: "assistant-seq-1",
            delta: "第二段",
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/completed",
          params: {
            threadId: "claude:session-seq-1",
            item: {
              id: "assistant-seq-1",
              type: "agentMessage",
              text: "第一段第二段",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "turn/completed",
          params: {
            threadId: "claude:session-seq-1",
            turnId: "turn-1",
            result: {
              text: "第一段第二段",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledTimes(3);
    expect(handlers.onAgentMessageDelta).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-claude",
      threadId: "claude:session-seq-1",
      itemId: "assistant-seq-1",
      delta: "第一段",
    });
    expect(handlers.onAgentMessageDelta).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-claude",
      threadId: "claude:session-seq-1",
      itemId: "assistant-seq-1",
      delta: "第一段第二段",
    });
    expect(handlers.onAgentMessageDelta).toHaveBeenNthCalledWith(3, {
      workspaceId: "ws-claude",
      threadId: "claude:session-seq-1",
      itemId: "assistant-seq-1",
      delta: "第二段",
    });
    expect(handlers.onItemStarted).not.toHaveBeenCalled();
    expect(handlers.onItemUpdated).not.toHaveBeenCalled();
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-seq-1",
      itemId: "assistant-seq-1",
      text: "第一段第二段",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps claude agent completion when only snapshot and completed arrive in normalized mode", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/updated",
          params: {
            threadId: "claude:session-snapshot-only-1",
            item: {
              id: "assistant-snapshot-only-1",
              type: "agentMessage",
              text: "snapshot-only-text",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/completed",
          params: {
            threadId: "claude:session-snapshot-only-1",
            item: {
              id: "assistant-snapshot-only-1",
              type: "agentMessage",
              text: "snapshot-only-text",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-snapshot-only-1",
      itemId: "assistant-snapshot-only-1",
      delta: "snapshot-only-text",
    });
    expect(handlers.onItemUpdated).not.toHaveBeenCalled();
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-snapshot-only-1",
      itemId: "assistant-snapshot-only-1",
      text: "snapshot-only-text",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("routes claude text:delta through normalized adapters with thread-scoped fallback id when itemId is missing", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "text:delta",
          params: {
            threadId: "claude:session-77",
            turnId: "turn-77",
            delta: "streaming text",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-77",
      itemId: "claude:session-77:text-delta",
      delta: "streaming text",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("routes gemini text:delta through legacy fallback when normalized adapters are disabled", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-gemini",
        message: {
          method: "text:delta",
          params: {
            threadId: "gemini:session-88",
            itemId: "assistant-88",
            delta: "短正文片段",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-gemini",
      threadId: "gemini:session-88",
      itemId: "assistant-88",
      delta: "短正文片段",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("does not route opencode text:delta when normalized realtime adapters are disabled", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-opencode",
        message: {
          method: "text:delta",
          params: {
            threadId: "opencode:ses_99",
            itemId: "assistant-1",
            delta: "streaming text",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes claude item/updated agentMessage snapshot in legacy routing", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/updated",
          params: {
            threadId: "claude:session-101",
            item: {
              id: "assistant-101",
              type: "agentMessage",
              text: "snapshot text",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();
    expect(handlers.onItemUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-claude",
      "claude:session-101",
      expect.objectContaining({
        id: "assistant-101",
        type: "agentMessage",
        text: "snapshot text",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores codex item/updated agentMessage snapshot after streaming delta in legacy routing", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-codex-legacy-1",
            itemId: "assistant-codex-legacy-1",
            delta: "codex stream",
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/updated",
          params: {
            threadId: "thread-codex-legacy-1",
            item: {
              id: "assistant-codex-legacy-1",
              type: "agentMessage",
              text: "codex snapshot",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-codex",
      threadId: "thread-codex-legacy-1",
      itemId: "assistant-codex-legacy-1",
      delta: "codex stream",
    });
    expect(handlers.onItemUpdated).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps claude snapshot updates flowing through legacy mode when delta and snapshot coexist", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
      onItemStarted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "turn/started",
          params: {
            threadId: "claude:session-seq-2",
            turnId: "turn-2",
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "claude:session-seq-2",
            itemId: "assistant-seq-2",
            delta: "第一段",
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/started",
          params: {
            threadId: "claude:session-seq-2",
            item: {
              id: "assistant-seq-2",
              type: "agentMessage",
              text: "第一段",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/updated",
          params: {
            threadId: "claude:session-seq-2",
            item: {
              id: "assistant-seq-2",
              type: "agentMessage",
              text: "第一段第二段",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "claude:session-seq-2",
            itemId: "assistant-seq-2",
            delta: "第二段",
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/completed",
          params: {
            threadId: "claude:session-seq-2",
            item: {
              id: "assistant-seq-2",
              type: "agentMessage",
              text: "第一段第二段",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "turn/completed",
          params: {
            threadId: "claude:session-seq-2",
            turnId: "turn-2",
            result: {
              text: "第一段第二段",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledTimes(2);
    expect(handlers.onAgentMessageDelta).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-claude",
      threadId: "claude:session-seq-2",
      itemId: "assistant-seq-2",
      delta: "第一段",
    });
    expect(handlers.onAgentMessageDelta).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-claude",
      threadId: "claude:session-seq-2",
      itemId: "assistant-seq-2",
      delta: "第二段",
    });
    expect(handlers.onItemStarted).not.toHaveBeenCalled();
    expect(handlers.onItemUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-claude",
      "claude:session-seq-2",
      expect.objectContaining({
        id: "assistant-seq-2",
        type: "agentMessage",
        text: "第一段第二段",
      }),
    );
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-seq-2",
      itemId: "assistant-seq-2",
      text: "第一段第二段",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps claude agent completion when only snapshot and completed arrive in legacy mode", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/updated",
          params: {
            threadId: "claude:session-snapshot-only-2",
            item: {
              id: "assistant-snapshot-only-2",
              type: "agentMessage",
              text: "snapshot-only-text",
            },
          },
        },
      });
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/completed",
          params: {
            threadId: "claude:session-snapshot-only-2",
            item: {
              id: "assistant-snapshot-only-2",
              type: "agentMessage",
              text: "snapshot-only-text",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();
    expect(handlers.onItemUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-claude",
      "claude:session-snapshot-only-2",
      expect.objectContaining({
        id: "assistant-snapshot-only-2",
        type: "agentMessage",
        text: "snapshot-only-text",
      }),
    );
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-snapshot-only-2",
      itemId: "assistant-snapshot-only-2",
      text: "snapshot-only-text",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("routes codex agentMessage snapshots through itemUpdated when no normalized handler is provided", async () => {
    const handlers: Handlers = {
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/updated",
          params: {
            threadId: "thread-codex-1",
            item: {
              id: "assistant-codex-1",
              type: "agentMessage",
              text: "codex snapshot",
            },
          },
        },
      });
    });

    expect(handlers.onItemUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-codex",
      "thread-codex-1",
      expect.objectContaining({
        id: "assistant-codex-1",
        type: "agentMessage",
        text: "codex snapshot",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("routes codex normalized realtime events directly when a normalized handler is provided", async () => {
    const handlers: Handlers = {
      onNormalizedRealtimeEvent: vi.fn(),
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex-direct",
        message: {
          method: "item/updated",
          params: {
            threadId: "thread-codex-direct-1",
            item: {
              id: "assistant-codex-direct-1",
              type: "agentMessage",
              text: "codex snapshot direct",
            },
          },
        },
      });
    });

    expect(handlers.onNormalizedRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "codex",
        workspaceId: "ws-codex-direct",
        threadId: "thread-codex-direct-1",
        operation: "itemUpdated",
        sourceMethod: "item/updated",
        item: expect.objectContaining({
          id: "assistant-codex-direct-1",
          kind: "message",
          role: "assistant",
          text: "codex snapshot direct",
        }),
      }),
    );
    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("does not route codex completed agentMessage snapshots through legacy itemCompleted when normalized handler is provided", async () => {
    const handlers: Handlers = {
      onNormalizedRealtimeEvent: vi.fn(),
      onItemCompleted: vi.fn(),
      onThreadTokenUsageUpdated: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex-direct",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-codex-direct-2",
            item: {
              id: "assistant-codex-direct-2",
              type: "agentMessage",
              text: "final direct text",
            },
            usage: {
              input_tokens: 8,
              output_tokens: 13,
            },
          },
        },
      });
    });

    expect(handlers.onNormalizedRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "codex",
        workspaceId: "ws-codex-direct",
        threadId: "thread-codex-direct-2",
        operation: "completeAgentMessage",
        item: expect.objectContaining({
          id: "assistant-codex-direct-2",
          kind: "message",
          role: "assistant",
          text: "final direct text",
        }),
      }),
    );
    expect(handlers.onItemCompleted).not.toHaveBeenCalled();
    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-codex-direct",
      "thread-codex-direct-2",
      expect.objectContaining({
        total: expect.objectContaining({
          inputTokens: 8,
          outputTokens: 13,
        }),
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps codex item/updated snapshots flowing after streaming delta in normalized mode", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
      onItemUpdated: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-codex-2",
            itemId: "assistant-codex-2",
            delta: "codex stream",
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/updated",
          params: {
            threadId: "thread-codex-2",
            item: {
              id: "assistant-codex-2",
              type: "agentMessage",
              text: "codex snapshot",
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-codex",
      threadId: "thread-codex-2",
      itemId: "assistant-codex-2",
      delta: "codex stream",
    });
    expect(handlers.onItemUpdated).toHaveBeenCalledTimes(1);
    expect(handlers.onItemUpdated).toHaveBeenCalledWith(
      "ws-codex",
      "thread-codex-2",
      expect.objectContaining({
        id: "assistant-codex-2",
        type: "agentMessage",
        text: "codex snapshot",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("prefers codex item/updated snapshot over later delta for the same assistant item", async () => {
    const handlers: Handlers = {
      onNormalizedRealtimeEvent: vi.fn(),
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/updated",
          params: {
            threadId: "thread-codex-3",
            item: {
              id: "assistant-codex-3",
              type: "agentMessage",
              text: "snapshot authority",
            },
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-codex-3",
            itemId: "assistant-codex-3",
            delta: "late delta after snapshot",
          },
        },
      });
    });

    expect(handlers.onNormalizedRealtimeEvent).toHaveBeenCalledTimes(1);
    expect(handlers.onNormalizedRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "codex",
        workspaceId: "ws-codex",
        threadId: "thread-codex-3",
        operation: "itemUpdated",
        item: expect.objectContaining({
          id: "assistant-codex-3",
          kind: "message",
          role: "assistant",
          text: "snapshot authority",
        }),
      }),
    );
    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("prefers codex item/started snapshot over later delta for the same assistant item", async () => {
    const handlers: Handlers = {
      onNormalizedRealtimeEvent: vi.fn(),
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/started",
          params: {
            threadId: "thread-codex-started-1",
            item: {
              id: "assistant-codex-started-1",
              type: "agentMessage",
              text: "started snapshot authority",
            },
          },
        },
      });
    });

    act(() => {
      listener?.({
        workspace_id: "ws-codex",
        message: {
          method: "item/agentMessage/delta",
          params: {
            threadId: "thread-codex-started-1",
            itemId: "assistant-codex-started-1",
            delta: "late delta after started snapshot",
          },
        },
      });
    });

    expect(handlers.onNormalizedRealtimeEvent).toHaveBeenCalledTimes(1);
    expect(handlers.onNormalizedRealtimeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        engine: "codex",
        workspaceId: "ws-codex",
        threadId: "thread-codex-started-1",
        operation: "itemStarted",
        item: expect.objectContaining({
          id: "assistant-codex-started-1",
          kind: "message",
          role: "assistant",
          text: "started snapshot authority",
        }),
      }),
    );
    expect(handlers.onAgentMessageDelta).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes claude text:delta through legacy fallback when normalized adapters are disabled", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "text:delta",
          params: {
            threadId: "claude:session-99",
            delta: "streaming text",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-99",
      itemId: "claude:session-99:text-delta",
      delta: "streaming text",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores turnId as assistant item id for legacy claude text:delta fallback", async () => {
    const handlers: Handlers = {
      onAgentMessageDelta: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "text:delta",
          params: {
            threadId: "claude:session-98",
            turnId: "turn-98",
            delta: "streaming text",
          },
        },
      });
    });

    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-claude",
      threadId: "claude:session-98",
      itemId: "claude:session-98:text-delta",
      delta: "streaming text",
      turnId: "turn-98",
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("hydrates tool output from params in legacy item/completed routing", async () => {
    const handlers: Handlers = {
      onItemCompleted: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-claude",
        message: {
          method: "item/completed",
          params: {
            threadId: "claude:session-42",
            output: "stdout-line-1\nstdout-line-2",
            item: {
              id: "cmd-1",
              type: "commandExecution",
              command: "ls -la",
              status: "completed",
            },
          },
        },
      });
    });

    expect(handlers.onItemCompleted).toHaveBeenCalledWith(
      "ws-claude",
      "claude:session-42",
      expect.objectContaining({
        id: "cmd-1",
        type: "commandExecution",
        aggregatedOutput: "stdout-line-1\nstdout-line-2",
        output: "stdout-line-1\nstdout-line-2",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

});
