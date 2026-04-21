// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import { registerSharedSessionNativeBinding } from "../../shared-session/runtime/sharedSessionBridge";
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

describe("useAppServerEvents runtime ended routing", () => {
  it("uses explicit runtime ended thread-turn mappings for multi-thread teardown", async () => {
    const handlers: Handlers = {
      onTurnError: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-runtime-ended-multi",
      sharedThreadId: "shared-thread-1",
      nativeThreadId: "native-thread-1",
      engine: "codex",
    });
    registerSharedSessionNativeBinding({
      workspaceId: "ws-runtime-ended-multi",
      sharedThreadId: "shared-thread-2",
      nativeThreadId: "native-thread-2",
      engine: "codex",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-runtime-ended-multi",
        message: {
          method: "runtime/ended",
          params: {
            reasonCode: "process_exit",
            message: "Managed runtime process exited unexpectedly.",
            affectedThreadIds: ["native-thread-1", "native-thread-2"],
            affectedTurnIds: ["turn-ignored-1", "turn-ignored-2"],
            affectedActiveTurns: [
              {
                threadId: "native-thread-2",
                turnId: "turn-2",
              },
              {
                threadId: "native-thread-1",
                turnId: "turn-1",
              },
            ],
          },
        },
      });
    });

    expect(handlers.onTurnError).toHaveBeenNthCalledWith(
      1,
      "ws-runtime-ended-multi",
      "shared-thread-1",
      "turn-1",
      expect.objectContaining({
        message: "[RUNTIME_ENDED] Managed runtime process exited unexpectedly.",
        willRetry: false,
      }),
    );
    expect(handlers.onTurnError).toHaveBeenNthCalledWith(
      2,
      "ws-runtime-ended-multi",
      "shared-thread-2",
      "turn-2",
      expect.objectContaining({
        message: "[RUNTIME_ENDED] Managed runtime process exited unexpectedly.",
        willRetry: false,
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("falls back to affectedActiveTurns when runtime ended payload omits affectedThreadIds", async () => {
    const handlers: Handlers = {
      onTurnError: vi.fn(),
      onRuntimeEnded: vi.fn(),
    };
    registerSharedSessionNativeBinding({
      workspaceId: "ws-runtime-ended-map-only",
      sharedThreadId: "shared-thread-a",
      nativeThreadId: "native-thread-a",
      engine: "codex",
    });
    registerSharedSessionNativeBinding({
      workspaceId: "ws-runtime-ended-map-only",
      sharedThreadId: "shared-thread-b",
      nativeThreadId: "native-thread-b",
      engine: "codex",
    });
    const { root } = await mount(handlers);

    act(() => {
      listener?.({
        workspace_id: "ws-runtime-ended-map-only",
        message: {
          method: "runtime/ended",
          params: {
            reasonCode: "process_exit",
            message: "Managed runtime process exited unexpectedly.",
            pendingRequestCount: -3,
            affectedActiveTurns: [
              {
                threadId: "native-thread-a",
                turnId: "turn-a",
              },
              {
                threadId: "native-thread-b",
                turnId: "turn-b",
              },
            ],
          },
        },
      });
    });

    expect(handlers.onRuntimeEnded).toHaveBeenCalledWith(
      "ws-runtime-ended-map-only",
      expect.objectContaining({
        affectedThreadIds: [],
        pendingRequestCount: 0,
      }),
    );
    expect(handlers.onTurnError).toHaveBeenNthCalledWith(
      1,
      "ws-runtime-ended-map-only",
      "shared-thread-a",
      "turn-a",
      expect.objectContaining({
        message: "[RUNTIME_ENDED] Managed runtime process exited unexpectedly.",
      }),
    );
    expect(handlers.onTurnError).toHaveBeenNthCalledWith(
      2,
      "ws-runtime-ended-map-only",
      "shared-thread-b",
      "turn-b",
      expect.objectContaining({
        message: "[RUNTIME_ENDED] Managed runtime process exited unexpectedly.",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });
});
