// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playNotificationSoundBySelection } from "../../../utils/notificationSounds";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import { useAgentSoundNotifications } from "./useAgentSoundNotifications";

vi.mock("../../../utils/notificationSounds", () => ({
  playNotificationSoundBySelection: vi.fn(),
}));

vi.mock("../../app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: vi.fn(),
}));

type SoundNotificationOptions = Parameters<typeof useAgentSoundNotifications>[0];
type AppServerHandlers = Parameters<typeof useAppServerEvents>[0];

function Harness(props: SoundNotificationOptions) {
  useAgentSoundNotifications(props);
  return null;
}

let latestHandlers: AppServerHandlers | null = null;

async function mountHarness(props: SoundNotificationOptions) {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness {...props} />);
  });
  return { root };
}

function emitTurnCompleted(
  workspaceId = "ws-1",
  threadId = "thread-1",
  turnId = "turn-1",
) {
  act(() => {
    latestHandlers?.onTurnCompleted?.(workspaceId, threadId, turnId);
  });
}

describe("useAgentSoundNotifications", () => {
  beforeEach(() => {
    latestHandlers = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T10:00:00.000Z"));
    vi.mocked(useAppServerEvents).mockImplementation((handlers) => {
      latestHandlers = handlers;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not play notification sound for agent message completion events", async () => {
    const { root } = await mountHarness({ enabled: true, soundId: "default" });

    act(() => {
      latestHandlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "item-1",
        text: "streamed chunk",
      });
    });

    expect(playNotificationSoundBySelection).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("plays notification sound once for a completed turn", async () => {
    const { root } = await mountHarness({
      enabled: true,
      soundId: "bell",
      customSoundPath: "mock-notification.wav",
    });

    emitTurnCompleted("ws-1", "thread-1", "turn-1");

    expect(playNotificationSoundBySelection).toHaveBeenCalledTimes(1);
    expect(playNotificationSoundBySelection).toHaveBeenCalledWith({
      soundId: "bell",
      customSoundPath: "mock-notification.wav",
      label: "notification",
      onDebug: undefined,
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores duplicate completed events for the same turn", async () => {
    const { root } = await mountHarness({ enabled: true, soundId: "default" });

    emitTurnCompleted("ws-1", "thread-1", "turn-1");
    emitTurnCompleted("ws-1", "thread-1", "turn-1");

    expect(playNotificationSoundBySelection).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it("allows one notification sound for each distinct completed turn", async () => {
    const { root } = await mountHarness({ enabled: true, soundId: "default" });

    emitTurnCompleted("ws-1", "thread-1", "turn-1");
    emitTurnCompleted("ws-1", "thread-1", "turn-2");

    expect(playNotificationSoundBySelection).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores stale duplicate completed events after a newer turn completes", async () => {
    const { root } = await mountHarness({ enabled: true, soundId: "default" });

    emitTurnCompleted("ws-1", "thread-1", "turn-1");
    emitTurnCompleted("ws-1", "thread-1", "turn-2");
    emitTurnCompleted("ws-1", "thread-1", "turn-1");

    expect(playNotificationSoundBySelection).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps notification sounds silent when disabled", async () => {
    const { root } = await mountHarness({ enabled: false, soundId: "default" });

    emitTurnCompleted("ws-1", "thread-1", "turn-1");
    act(() => {
      latestHandlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-1",
        itemId: "item-1",
        text: "streamed chunk",
      });
    });

    expect(playNotificationSoundBySelection).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps short-window fallback dedupe for legacy completed events without turn id", async () => {
    const { root } = await mountHarness({ enabled: true, soundId: "default" });

    emitTurnCompleted("ws-1", "thread-1", "");
    vi.setSystemTime(new Date("2026-04-21T10:00:01.000Z"));
    emitTurnCompleted("ws-1", "thread-1", "");
    vi.setSystemTime(new Date("2026-04-21T10:00:02.600Z"));
    emitTurnCompleted("ws-1", "thread-1", "");

    expect(playNotificationSoundBySelection).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores malformed completed events without a stable thread identity", async () => {
    const { root } = await mountHarness({ enabled: true, soundId: "default" });

    act(() => {
      latestHandlers?.onTurnCompleted?.("  ", " \n ", "turn-1");
    });

    expect(playNotificationSoundBySelection).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("does not collide when workspace and thread identifiers contain colons", async () => {
    const { root } = await mountHarness({ enabled: true, soundId: "default" });

    emitTurnCompleted("workspace", "alpha:beta", "turn-1");
    emitTurnCompleted("workspace:alpha", "beta", "turn-1");

    expect(playNotificationSoundBySelection).toHaveBeenCalledTimes(2);

    await act(async () => {
      root.unmount();
    });
  });
});
