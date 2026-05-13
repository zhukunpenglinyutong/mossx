import { describe, expect, it, vi } from "vitest";
import {
  recoverThreadBindingAndResendForManualRecovery,
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

    expect(result).toEqual({
      kind: "rebound",
      threadId: "thread-recovered",
      retryable: false,
      userAction: "retry",
    });
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-stale");
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("does not start a fresh codex thread unless explicit continuation is allowed", async () => {
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

    expect(result).toEqual({
      kind: "failed",
      reason: "no verified replacement thread",
      retryable: true,
      userAction: "recover-thread",
    });
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("starts a fresh codex thread when explicit fresh continuation is allowed", async () => {
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
      allowFreshThread: true,
    });

    expect(result).toEqual({
      kind: "fresh",
      threadId: "thread-fresh",
      retryable: true,
      userAction: "start-fresh-thread",
    });
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
      allowFreshThread: true,
    });

    expect(result).toEqual({
      kind: "fresh",
      threadId: "claude-pending-new",
      retryable: true,
      userAction: "start-fresh-thread",
    });
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
      allowFreshThread: true,
    });

    expect(result).toEqual({
      kind: "fresh",
      threadId: "thread-fresh",
      retryable: true,
      userAction: "start-fresh-thread",
    });
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
      retryable: true,
      userAction: "recover-thread",
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
      retryable: true,
      userAction: "recover-thread",
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
      retryable: true,
      userAction: "recover-thread",
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
      allowFreshThread: true,
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "runtime unavailable",
      retryable: true,
      userAction: "start-fresh-thread",
    });
  });

  it("suppresses replayed user message only for rebound resend", () => {
    expect(
      shouldSuppressManualRecoveryResendUserMessage({
        kind: "rebound",
        threadId: "thread-recovered",
        retryable: false,
        userAction: "retry",
      }),
    ).toBe(true);
    expect(
      shouldSuppressManualRecoveryResendUserMessage({
        kind: "fresh",
        threadId: "thread-fresh",
        retryable: true,
        userAction: "start-fresh-thread",
      }),
    ).toBe(false);
  });
});

describe("recoverThreadBindingAndResendForManualRecovery", () => {
  const connectedWorkspace = {
    id: "ws-1",
    connected: true,
  };
  const disconnectedWorkspace = {
    id: "ws-1",
    connected: false,
  };

  it("resends to a fresh codex thread when historical stale recovery cannot rebind", async () => {
    const resolveWorkspace = vi.fn(() => disconnectedWorkspace);
    const refreshThread = vi.fn(async () => {
      throw new Error("thread not found: thread-stale");
    });
    const startThreadForWorkspace = vi.fn(async () => " thread-fresh ");
    const connectWorkspace = vi.fn(async () => undefined);
    const sendUserMessageToThread = vi.fn(async () => undefined);

    const result = await recoverThreadBindingAndResendForManualRecovery({
      workspaceId: " ws-1 ",
      threadId: " thread-stale ",
      message: {
        text: " 继续 ",
      },
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      resolveWorkspace,
      refreshThread,
      startThreadForWorkspace,
      connectWorkspace,
      sendUserMessageToThread,
    });

    expect(result).toEqual({
      kind: "fresh",
      threadId: "thread-fresh",
      retryable: true,
      userAction: "start-fresh-thread",
    });
    expect(resolveWorkspace).toHaveBeenCalledWith("ws-1");
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "thread-stale");
    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      activate: true,
      engine: "codex",
    });
    expect(connectWorkspace).toHaveBeenCalledWith(disconnectedWorkspace);
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      disconnectedWorkspace,
      "thread-fresh",
      "继续",
      [],
      {
        suppressUserMessageRender: false,
        skipOptimisticUserBubble: false,
      },
    );
  });

  it("resends to a rebound thread and suppresses the duplicate user bubble", async () => {
    const resolveWorkspace = vi.fn(() => connectedWorkspace);
    const refreshThread = vi.fn(async () => "thread-rebound");
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");
    const connectWorkspace = vi.fn(async () => undefined);
    const sendUserMessageToThread = vi.fn(async () => undefined);

    const result = await recoverThreadBindingAndResendForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      message: {
        text: "继续",
        images: ["image-a.png"],
      },
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      resolveWorkspace,
      refreshThread,
      startThreadForWorkspace,
      connectWorkspace,
      sendUserMessageToThread,
    });

    expect(result).toEqual({
      kind: "rebound",
      threadId: "thread-rebound",
      retryable: false,
      userAction: "retry",
    });
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
    expect(connectWorkspace).not.toHaveBeenCalled();
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      connectedWorkspace,
      "thread-rebound",
      "继续",
      ["image-a.png"],
      {
        suppressUserMessageRender: true,
        skipOptimisticUserBubble: true,
      },
    );
  });

  it("fails before recovery when workspace lookup misses", async () => {
    const refreshThread = vi.fn(async () => "thread-rebound");
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");
    const sendUserMessageToThread = vi.fn(async () => undefined);

    const result = await recoverThreadBindingAndResendForManualRecovery({
      workspaceId: "ws-missing",
      threadId: "thread-stale",
      message: {
        text: "继续",
      },
      threadsByWorkspace: {},
      resolveWorkspace: vi.fn(() => null),
      refreshThread,
      startThreadForWorkspace,
      connectWorkspace: vi.fn(async () => undefined),
      sendUserMessageToThread,
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "workspace unavailable",
      retryable: true,
      userAction: "start-fresh-thread",
    });
    expect(refreshThread).not.toHaveBeenCalled();
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
    expect(sendUserMessageToThread).not.toHaveBeenCalled();
  });

  it("fails before recovery when there is no prompt or image to resend", async () => {
    const refreshThread = vi.fn(async () => "thread-rebound");
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const result = await recoverThreadBindingAndResendForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      message: {
        text: " ",
        images: [],
      },
      threadsByWorkspace: {},
      resolveWorkspace: vi.fn(() => connectedWorkspace),
      refreshThread,
      startThreadForWorkspace,
      connectWorkspace: vi.fn(async () => undefined),
      sendUserMessageToThread: vi.fn(async () => undefined),
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "missing message to resend",
      retryable: true,
      userAction: "start-fresh-thread",
    });
    expect(refreshThread).not.toHaveBeenCalled();
    expect(startThreadForWorkspace).not.toHaveBeenCalled();
  });

  it("returns a failed result when resend throws after recovery", async () => {
    const refreshThread = vi.fn(async () => null);
    const startThreadForWorkspace = vi.fn(async () => "thread-fresh");

    const result = await recoverThreadBindingAndResendForManualRecovery({
      workspaceId: "ws-1",
      threadId: "thread-stale",
      message: {
        text: "继续",
      },
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-stale", engineSource: "codex" }],
      },
      resolveWorkspace: vi.fn(() => connectedWorkspace),
      refreshThread,
      startThreadForWorkspace,
      connectWorkspace: vi.fn(async () => undefined),
      sendUserMessageToThread: vi.fn(async () => {
        throw new Error("send failed");
      }),
    });

    expect(result).toEqual({
      kind: "failed",
      reason: "send failed",
      retryable: true,
      userAction: "start-fresh-thread",
    });
  });
});
