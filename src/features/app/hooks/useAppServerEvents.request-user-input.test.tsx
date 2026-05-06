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

function TestHarness({ handlers }: { handlers: Handlers }) {
  useAppServerEvents(handlers);
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

async function mount(handlers: Handlers) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<TestHarness handlers={handlers} />);
  });
  return { root };
}

describe("useAppServerEvents request user input", () => {
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

  it("preserves multiSelect flag for request user input questions", async () => {
    const handlers: Handlers = {
      onRequestUserInput: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-multi",
        message: {
          method: "item/tool/requestUserInput",
          id: "req-multi-1",
          params: {
            threadId: "thread-multi",
            turnId: "turn-multi",
            itemId: "item-multi",
            questions: [
              {
                id: "q-1",
                header: "Focus",
                question: "Choose multiple",
                multiSelect: true,
                options: [{ label: "A", description: "" }],
              },
            ],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-multi",
      request_id: "req-multi-1",
      params: {
        thread_id: "thread-multi",
        turn_id: "turn-multi",
        item_id: "item-multi",
        questions: [
          {
            id: "q-1",
            header: "Focus",
            question: "Choose multiple",
            isOther: false,
            isSecret: false,
            multiSelect: true,
            options: [{ label: "A", description: "" }],
          },
        ],
      },
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("prefers params.request_id over transport-level message.id for requestUserInput", async () => {
    const handlers: Handlers = {
      onRequestUserInput: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-req-id",
        message: {
          method: "item/tool/requestUserInput",
          id: 999,
          params: {
            request_id: "ask-real-1",
            threadId: "thread-real",
            turnId: "turn-real",
            itemId: "item-real",
            questions: [{ id: "q-1", header: "", question: "Choose one" }],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-req-id",
      request_id: "ask-real-1",
      params: {
        thread_id: "thread-real",
        turn_id: "turn-real",
        item_id: "item-real",
        questions: [
          {
            id: "q-1",
            header: "",
            question: "Choose one",
            isOther: false,
            isSecret: false,
            options: undefined,
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

  it("falls back to turn.threadId and active codex thread for user input request", async () => {
    const handlers: Handlers = {
      onRequestUserInput: vi.fn(),
      getActiveCodexThreadId: vi.fn(() => "codex-active-thread"),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-nested",
        message: {
          method: "item/tool/requestUserInput",
          id: "req-nested-1",
          params: {
            turn: {
              id: "turn-nested-1",
              threadId: "thread-from-turn",
            },
            questions: [{ id: "q1", header: "", question: "Proceed?" }],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenLastCalledWith({
      workspace_id: "ws-nested",
      request_id: "req-nested-1",
      params: {
        thread_id: "thread-from-turn",
        turn_id: "turn-nested-1",
        item_id: "",
        questions: [
          {
            id: "q1",
            header: "",
            question: "Proceed?",
            isOther: false,
            isSecret: false,
            options: undefined,
          },
        ],
      },
    });

    act(() => {
      listener?.({
        workspace_id: "ws-nested",
        message: {
          method: "item/tool/requestUserInput",
          id: "req-nested-2",
          params: {
            turnId: "turn-no-thread",
            questions: [{ id: "q2", header: "", question: "Continue?" }],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenLastCalledWith({
      workspace_id: "ws-nested",
      request_id: "req-nested-2",
      params: {
        thread_id: "codex-active-thread",
        turn_id: "turn-no-thread",
        item_id: "",
        questions: [
          {
            id: "q2",
            header: "",
            question: "Continue?",
            isOther: false,
            isSecret: false,
            options: undefined,
          },
        ],
      },
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("marks requestUserInput as completed when payload indicates completion", async () => {
    const handlers: Handlers = {
      onRequestUserInput: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-completed",
        message: {
          method: "item/tool/requestUserInput",
          id: "req-completed-1",
          params: {
            threadId: "thread-completed",
            turnId: "turn-completed",
            itemId: "item-completed",
            completed: true,
            questions: [{ id: "q1", header: "", question: "Done?" }],
          },
        },
      });
    });

    expect(handlers.onRequestUserInput).toHaveBeenCalledWith({
      workspace_id: "ws-completed",
      request_id: "req-completed-1",
      params: {
        thread_id: "thread-completed",
        turn_id: "turn-completed",
        item_id: "item-completed",
        completed: true,
        questions: [
          {
            id: "q1",
            header: "",
            question: "Done?",
            isOther: false,
            isSecret: false,
            options: undefined,
          },
        ],
      },
    });

    await act(async () => {
      root.unmount();
    });
  });
});
