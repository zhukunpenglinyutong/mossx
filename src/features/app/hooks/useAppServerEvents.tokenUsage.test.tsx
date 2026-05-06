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

describe("useAppServerEvents token usage", () => {
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

  it("keeps token_count last usage as zero when only total snapshot exists", async () => {
    const handlers: Handlers = {
      onThreadTokenUsageUpdated: vi.fn(),
      getActiveCodexThreadId: vi.fn(() => "thread-codex-2"),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "token_count",
          params: {
            info: {
              total_token_usage: {
                input_tokens: 120000,
                cached_input_tokens: 10000,
                model_context_window: 200000,
              },
            },
          },
        },
      });
    });

    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-1",
      "thread-codex-2",
      {
        total: {
          inputTokens: 120000,
          outputTokens: 0,
          cachedInputTokens: 10000,
          totalTokens: 120000,
        },
        last: {
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          totalTokens: 0,
        },
        modelContextWindow: 200000,
      },
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("emits item/completed token usage updates when cached tokens are present", async () => {
    const handlers: Handlers = {
      onThreadTokenUsageUpdated: vi.fn(),
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
            item: { id: "tool-1", type: "command", status: "completed" },
            usage: {
              input_tokens: 0,
              output_tokens: 0,
              cached_input_tokens: 12,
              model_context_window: 200000,
            },
          },
        },
      });
    });

    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      {
        total: {
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 12,
          totalTokens: 0,
        },
        last: {
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 12,
          totalTokens: 0,
        },
        modelContextWindow: 200000,
      },
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("prefers token_count last snapshot while keeping total snapshot", async () => {
    const handlers: Handlers = {
      onThreadTokenUsageUpdated: vi.fn(),
      getActiveCodexThreadId: vi.fn(() => "thread-codex-1"),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-1",
        message: {
          method: "token_count",
          params: {
            info: {
              total_token_usage: {
                input_tokens: 180000,
                cached_input_tokens: 0,
                model_context_window: 200000,
              },
              last_token_usage: {
                input_tokens: 20000,
                cached_input_tokens: 0,
                model_context_window: 200000,
              },
            },
          },
        },
      });
    });

    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-1",
      "thread-codex-1",
      {
        total: {
          inputTokens: 180000,
          outputTokens: 0,
          cachedInputTokens: 0,
          totalTokens: 180000,
        },
        last: {
          inputTokens: 20000,
          outputTokens: 0,
          cachedInputTokens: 0,
          totalTokens: 20000,
        },
        modelContextWindow: 200000,
      },
    );

    await act(async () => {
      root.unmount();
    });
  });
});
