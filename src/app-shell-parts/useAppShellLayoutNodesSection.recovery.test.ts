import { describe, expect, it, vi } from "vitest";
import {
  recoverThreadBindingForManualRecovery,
  shouldSuppressManualRecoveryResendUserMessage,
} from "./manualThreadRecovery";

describe("recoverThreadBindingForManualRecovery", () => {
  it("returns the rebound thread when refresh succeeds", async () => {
    const refreshThread = vi.fn(async () => "thread-recovered");
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const result = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(result).toEqual({ kind: "rebound", threadId: "thread-recovered" });
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-stale");
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("starts a fresh codex thread when stale thread rebind fails", async () => {
    const refreshThread = vi.fn(async () => null);
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const result = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(result).toEqual({ kind: "fresh", threadId: "thread-fresh" });
    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      activate: true,
      engine: "codex",
    });
  });

  it("keeps the engine family when stale non-codex recovery falls back to a fresh thread", async () => {
    const refreshThread = vi.fn(async () => null);
    const startThreadForWorkspace = vi.fn(async () => "claude-pending-new");

    const result = await recoverThreadBindingForManualRecovery({
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

    expect(result).toEqual({ kind: "fresh", threadId: "claude-pending-new" });
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

    const result = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(result).toEqual({ kind: "fresh", threadId: "thread-fresh" });
    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      activate: true,
      engine: "codex",
    });
  });

  it("does not create a fresh thread when recover-only disallows fresh fallback", async () => {
    const refreshThread = vi.fn(async () => null);
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const result = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
      allowFreshThread: false,
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "no verified replacement thread",
    });
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("keeps the refresh error when recover-only cannot verify a replacement thread", async () => {
    const refreshThread = vi.fn(async () => {
      throw new Error("thread not found: thread-stale");
    });
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const result = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
      allowFreshThread: false,
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "thread not found: thread-stale",
    });
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("fails before runtime calls when required ids are empty", async () => {
    const refreshThread = vi.fn(async () => "thread-recovered");
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const result = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: " ",
      threadsByWorkspace: {},
      refreshThread,
      startThreadForWorkspace,
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "missing workspace or thread id",
    });
    expect(refreshThread).not.toHaveBeenCalled();
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("returns failed when fresh thread creation fails", async () => {
    const refreshThread = vi.fn(async () => null);
    const startThreadForWorkspace = vi.fn(async () => {
      throw new Error("runtime unavailable");
    });

    const result = await recoverThreadBindingForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      refreshThread,
      startThreadForWorkspace,
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "runtime unavailable",
    });
  });

  it("suppresses replayed user message only for rebound resend", () => {
    expect(
      shouldSuppressManualRecoveryResendUserMessage({
        kind: "rebound",
        threadId: "thread-recovered",
      }),
    ).toBe(true);
    expect(
      shouldSuppressManualRecoveryResendUserMessage({
        kind: "fresh",
        threadId: "thread-fresh",
      }),
    ).toBe(false);
  });
});
