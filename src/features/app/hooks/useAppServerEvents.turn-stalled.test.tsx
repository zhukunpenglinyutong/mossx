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

describe("useAppServerEvents turn stalled", () => {
  it("routes turn stalled payloads", async () => {
    const handlers: Handlers = {
      onTurnStalled: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-stalled",
        message: {
          method: "turn/stalled",
          params: {
            threadId: "thread-1",
            turnId: "turn-1",
            reasonCode: "resume_timeout",
            stage: "resume-pending",
            source: "user-input-resume",
            message: "resume timeout",
            startedAtMs: 123,
            timeoutMs: 45_000,
            runtimeGeneration: "pid:4242:startedAt:1710000000000",
            runtimeProcessId: 4242,
            runtimeStartedAtMs: 1_710_000_000_000,
          },
        },
      });
    });

    expect(handlers.onTurnStalled).toHaveBeenCalledWith(
      "ws-stalled",
      "thread-1",
      "turn-1",
      expect.objectContaining({
        message: "resume timeout",
        reasonCode: "resume_timeout",
        stage: "resume-pending",
        source: "user-input-resume",
        startedAtMs: 123,
        timeoutMs: 45_000,
        runtimeGeneration: "pid:4242:startedAt:1710000000000",
        runtimeProcessId: 4242,
        runtimeStartedAtMs: 1_710_000_000_000,
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });
});
