// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServerEvent } from "../../../types";
import { subscribeAppServerEvents } from "../../../services/events";
import {
  CANONICAL_REALTIME_FIXTURES,
  LEGACY_REALTIME_ALIAS_FIXTURES,
} from "../../threads/contracts/realtimeEventContract";
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

function canonicalEvent(semantic: string): AppServerEvent {
  const fixture = CANONICAL_REALTIME_FIXTURES.find(
    (candidate) => candidate.semantic === semantic,
  );
  if (!fixture) {
    throw new Error(`Missing canonical realtime fixture for ${semantic}`);
  }
  return fixture.event;
}

describe("useAppServerEvents realtime contract", () => {
  it("routes canonical lifecycle, heartbeat, usage, and error payloads through stable handlers", async () => {
    const handlers: Handlers = {
      onTurnStarted: vi.fn(),
      onTurnCompleted: vi.fn(),
      onProcessingHeartbeat: vi.fn(),
      onThreadTokenUsageUpdated: vi.fn(),
      onTurnError: vi.fn(),
    };
    const { root } = await mount(handlers);

    act(() => {
      listener?.(canonicalEvent("turnStarted"));
      listener?.(canonicalEvent("processingHeartbeat"));
      listener?.(canonicalEvent("usageUpdate"));
      listener?.(canonicalEvent("turnError"));
      listener?.(canonicalEvent("turnCompleted"));
    });

    expect(handlers.onTurnStarted).toHaveBeenCalledWith(
      "ws-realtime-contract",
      "codex:contract-thread",
      "turn-contract-1",
    );
    expect(handlers.onProcessingHeartbeat).toHaveBeenCalledWith(
      "ws-realtime-contract",
      "codex:contract-thread",
      7,
    );
    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-realtime-contract",
      "codex:contract-thread",
      expect.objectContaining({
        modelContextWindow: 200000,
      }),
    );
    expect(handlers.onTurnError).toHaveBeenCalledWith(
      "ws-realtime-contract",
      "codex:contract-thread",
      "turn-contract-1",
      expect.objectContaining({
        message: "canonical turn error",
        willRetry: false,
      }),
    );
    expect(handlers.onTurnCompleted).toHaveBeenCalledWith(
      "ws-realtime-contract",
      "codex:contract-thread",
      "turn-contract-1",
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("accepts legacy token_count usage as compatibility input", async () => {
    const handlers: Handlers = {
      onThreadTokenUsageUpdated: vi.fn(),
    };
    const { root } = await mount(handlers);
    const usageAlias = LEGACY_REALTIME_ALIAS_FIXTURES.find(
      (candidate) => candidate.semantic === "usageUpdate",
    );
    if (!usageAlias) {
      throw new Error("Missing legacy usage fixture");
    }

    act(() => {
      listener?.(usageAlias.event);
    });

    expect(handlers.onThreadTokenUsageUpdated).toHaveBeenCalledWith(
      "ws-realtime-contract",
      "codex:contract-thread",
      expect.objectContaining({
        total: expect.objectContaining({
          inputTokens: 2,
          outputTokens: 3,
          cachedInputTokens: 1,
          totalTokens: 5,
        }),
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });
});
