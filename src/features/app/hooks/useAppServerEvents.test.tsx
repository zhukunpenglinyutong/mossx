// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import { useAppServerEvents } from "./useAppServerEvents";

vi.mock("../../../services/events", () => ({
  subscribeAppServerEvents: vi.fn(),
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
  it("routes app-server events to handlers", async () => {
    const handlers: Handlers = {
      onAppServerEvent: vi.fn(),
      onWorkspaceConnected: vi.fn(),
      onThreadStarted: vi.fn(),
      onBackgroundThreadAction: vi.fn(),
      onAgentMessageDelta: vi.fn(),
      onReasoningTextDelta: vi.fn(),
      onReasoningSummaryBoundary: vi.fn(),
      onContextCompacted: vi.fn(),
      onApprovalRequest: vi.fn(),
      onRequestUserInput: vi.fn(),
      onItemUpdated: vi.fn(),
      onItemCompleted: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
      onTurnError: vi.fn(),
    };
    const { root } = await mount(handlers);

    expect(listener).toBeTypeOf("function");

    act(() => {
      listener?.({ workspace_id: "ws-1", message: { method: "codex/connected" } });
    });
    expect(handlers.onWorkspaceConnected).toHaveBeenCalledWith("ws-1");

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/agentMessage/delta",
          params: { threadId: "thread-1", itemId: "item-1", delta: "Hello" },
        },
      });
    });
    expect(handlers.onAgentMessageDelta).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-1",
      delta: "Hello",
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/reasoning/summaryPartAdded",
          params: { threadId: "thread-1", itemId: "reasoning-1", summaryIndex: 1 },
        },
      });
    });
    expect(handlers.onReasoningSummaryBoundary).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "reasoning-1",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/reasoning/delta",
          params: { threadId: "thread-1", itemId: "reasoning-1", delta: "checking..." },
        },
      });
    });
    expect(handlers.onReasoningTextDelta).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "reasoning-1",
      "checking...",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "thread/compacted",
          params: { threadId: "thread-1", turnId: "turn-7" },
        },
      });
    });
    expect(handlers.onContextCompacted).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-7",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "thread/started",
          params: { thread: { id: "thread-2", preview: "New thread" } },
        },
      });
    });
    expect(handlers.onThreadStarted).toHaveBeenCalledWith("ws-1", {
      id: "thread-2",
      preview: "New thread",
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/updated",
          params: { threadId: "thread-2", item: { id: "item-42", type: "reasoning", text: "..." } },
        },
      });
    });
    expect(handlers.onItemUpdated).toHaveBeenCalledWith("ws-1", "thread-2", {
      id: "item-42",
      type: "reasoning",
      text: "...",
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "turn/error",
          params: { threadId: "thread-2", turnId: "turn-2", error: "Resume failed" },
        },
      });
    });
    expect(handlers.onTurnError).toHaveBeenCalledWith("ws-1", "thread-2", "turn-2", {
      message: "Resume failed",
      willRetry: false,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "codex/backgroundThread",
          params: { threadId: "thread-2", action: "hide" },
        },
      });
    });
    expect(handlers.onBackgroundThreadAction).toHaveBeenCalledWith(
      "ws-1",
      "thread-2",
      "hide",
    );

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "workspace/requestApproval",
          id: 7,
          params: { mode: "full" },
        },
      });
    });
    expect(handlers.onApprovalRequest).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      request_id: 7,
      method: "workspace/requestApproval",
      params: { mode: "full" },
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/tool/requestUserInput",
          id: 11,
          params: {
            thread_id: "thread-1",
            turn_id: "turn-1",
            item_id: "call-1",
            questions: [
              {
                id: "confirm_path",
                header: "Confirm",
                question: "Proceed?",
                options: [
                  { label: "Yes", description: "Continue." },
                  { label: "No", description: "Stop." },
                ],
              },
            ],
          },
        },
      });
    });
    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-1",
      request_id: 11,
      params: {
        thread_id: "thread-1",
        turn_id: "turn-1",
        item_id: "call-1",
        questions: [
          {
            id: "confirm_path",
            header: "Confirm",
            question: "Proceed?",
            isOther: false,
            isSecret: false,
            options: [
              { label: "Yes", description: "Continue." },
              { label: "No", description: "Stop." },
            ],
          },
        ],
      },
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-2", text: "Done" },
          },
        },
      });
    });
    expect(handlers.onItemCompleted).toHaveBeenCalledWith("ws-1", "thread-1", {
      type: "agentMessage",
      id: "item-2",
      text: "Done",
    });
    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-2",
      text: "Done",
    });

    await act(async () => {
      root.unmount();
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("normalizes request user input questions and options", async () => {
    const handlers: Handlers = {
      onRequestUserInput: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-9",
        message: {
          method: "item/tool/requestUserInput",
          id: 55,
          params: {
            threadId: "thread-9",
            turnId: "turn-9",
            itemId: "item-9",
            questions: [
              {
                id: "",
                header: "",
                question: "",
                options: [
                  { label: "", description: "" },
                  { label: "  ", description: " " },
                ],
              },
              {
                id: "q-1",
                header: "",
                question: "Choose",
                options: [
                  { label: "", description: "" },
                  { label: "Yes", description: "" },
                  { label: "", description: "No label" },
                ],
              },
            ],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-9",
      request_id: 55,
      params: {
        thread_id: "thread-9",
        turn_id: "turn-9",
        item_id: "item-9",
        questions: [
          {
            id: "q-1",
            header: "",
            question: "Choose",
            isOther: false,
            isSecret: false,
            options: [
              { label: "Yes", description: "" },
              { label: "", description: "No label" },
            ],
          },
        ],
      },
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("normalizes secret input field from snake_case", async () => {
    const handlers: Handlers = {
      onRequestUserInput: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-secret",
        message: {
          method: "item/tool/requestUserInput",
          id: 87,
          params: {
            thread_id: "thread-secret",
            turn_id: "turn-secret",
            item_id: "item-secret",
            questions: [
              {
                id: "token",
                header: "Credential",
                question: "Paste token",
                is_secret: true,
              },
            ],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-secret",
      request_id: 87,
      params: {
        thread_id: "thread-secret",
        turn_id: "turn-secret",
        item_id: "item-secret",
        questions: [
          {
            id: "token",
            header: "Credential",
            question: "Paste token",
            isOther: false,
            isSecret: true,
            options: undefined,
          },
        ],
      },
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
    );

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

  it("keeps token usage updates when normalized realtime adapters handle item/completed", async () => {
    const handlers: Handlers = {
      onThreadTokenUsageUpdated: vi.fn(),
      onAgentMessageCompleted: vi.fn(),
    };
    const { root } = await mount(handlers, {
      useNormalizedRealtimeAdapters: true,
    });

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "item/completed",
          params: {
            threadId: "thread-1",
            item: { type: "agentMessage", id: "item-1", text: "Done" },
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cached_input_tokens: 2,
              model_context_window: 128000,
            },
          },
        },
      });
    });

    expect(handlers.onAgentMessageCompleted).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      itemId: "item-1",
      text: "Done",
    });
    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      {
        total: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 2,
          totalTokens: 15,
        },
        last: {
          inputTokens: 10,
          outputTokens: 5,
          cachedInputTokens: 2,
          totalTokens: 15,
        },
        modelContextWindow: 128000,
      },
    );

    await act(async () => {
      root.unmount();
    });
  });
});
