import { describe, expect, it, vi } from "vitest";
import { recoverThreadBindingForManualRecovery } from "./manualThreadRecovery";

describe("recoverThreadBindingForManualRecovery", () => {
  it("returns the rebound thread when refresh succeeds", async () => {
    const refreshThread = vi.fn(async () => "thread-recovered");
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const recoveredThreadId = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(recoveredThreadId).toBe("thread-recovered");
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-stale");
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("starts a fresh codex thread when stale thread rebind fails", async () => {
    const refreshThread = vi.fn(async () => null);
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const recoveredThreadId = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(recoveredThreadId).toBe("thread-fresh");
    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      activate: true,
      engine: "codex",
    });
  });

  it("keeps the engine family when stale non-codex recovery falls back to a fresh thread", async () => {
    const refreshThread = vi.fn(async () => null);
    const startThreadForWorkspace = vi.fn(async () => "claude-pending-new");

    const recoveredThreadId = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "claude:session-stale",
      threadsByWorkspace: {
        "ws-1": [
          {
            id: "claude:session-stale",
            engineSource: "claude",
          },
        ],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(recoveredThreadId).toBe("claude-pending-new");
    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      activate: true,
      engine: "claude",
    });
  });

  it("falls back to a fresh thread when refresh rejects", async () => {
    const refreshThread = vi.fn(async () => {
      throw new Error("thread not found: thread-stale");
    });
    const startThreadForWorkspace = vi.fn(async () => " thread-fresh ");

    const recoveredThreadId = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(recoveredThreadId).toBe("thread-fresh");
    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      activate: true,
      engine: "codex",
    });
  });
});
