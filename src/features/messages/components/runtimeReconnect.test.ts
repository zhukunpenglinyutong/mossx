import { describe, expect, it } from "vitest";
import {
  normalizeRuntimeReconnectErrorMessage,
  normalizeRuntimeReconnectRecoveryResult,
  resolveRuntimeReconnectHint,
} from "./runtimeReconnect";

describe("resolveRuntimeReconnectHint", () => {
  it("matches POSIX and Windows pipe disconnect errors", () => {
    expect(resolveRuntimeReconnectHint("Broken pipe (os error 32)")).toEqual({
      reason: "broken-pipe",
      rawMessage: "Broken pipe (os error 32)",
    });
    expect(resolveRuntimeReconnectHint("The pipe is being closed. (os error 232)")).toEqual({
      reason: "broken-pipe",
      rawMessage: "The pipe is being closed. (os error 232)",
    });
  });

  it("matches workspace disconnect errors and ignores unrelated text", () => {
    expect(resolveRuntimeReconnectHint("workspace not connected")).toEqual({
      reason: "workspace-not-connected",
      rawMessage: "workspace not connected",
    });
    expect(resolveRuntimeReconnectHint("thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30")).toEqual({
      reason: "thread-not-found",
      rawMessage: "thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30",
    });
    expect(
      resolveRuntimeReconnectHint(
        "Context compaction failed: thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30",
      ),
    ).toEqual({
      reason: "thread-not-found",
      rawMessage:
        "Context compaction failed: thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30",
    });
    expect(resolveRuntimeReconnectHint("会话启动失败： [SESSION_NOT_FOUND] session file not found")).toEqual({
      reason: "session-not-found",
      rawMessage: "会话启动失败： [SESSION_NOT_FOUND] session file not found",
    });
    expect(
      resolveRuntimeReconnectHint(
        "会话启动失败： [RUNTIME_RECOVERY_QUARANTINED] Runtime recovery paused for workspace ws-1 (engine codex).",
      ),
    ).toEqual({
      reason: "recovery-quarantined",
      rawMessage:
        "会话启动失败： [RUNTIME_RECOVERY_QUARANTINED] Runtime recovery paused for workspace ws-1 (engine codex).",
    });
    expect(resolveRuntimeReconnectHint("request timed out")).toBeNull();
  });

  it("ignores long assistant replies that only quote runtime disconnect text", () => {
    expect(
      resolveRuntimeReconnectHint(
        "Broken pipe (os error 32)\n\n结论先行：这是一次 stale session 问题，需要后端重建。",
      ),
    ).toBeNull();
  });

  it("does not treat explanatory single-line thread-not-found text as a recovery error", () => {
    expect(
      resolveRuntimeReconnectHint(
        "解释：thread not found 通常表示旧会话句柄已经失效，需要重新打开会话。",
      ),
    ).toBeNull();
  });

  it("keeps reconnect detection for repeated raw error lines", () => {
    expect(
      resolveRuntimeReconnectHint("Broken pipe (os error 32)\nBroken pipe (os error 32)"),
    ).toEqual({
      reason: "broken-pipe",
      rawMessage: "Broken pipe (os error 32)",
    });
  });
});

describe("normalizeRuntimeReconnectErrorMessage", () => {
  it("normalizes unknown error input to a readable string", () => {
    expect(normalizeRuntimeReconnectErrorMessage(new Error("runtime gone"))).toBe("runtime gone");
    expect(normalizeRuntimeReconnectErrorMessage({ reason: "pipe closed" })).toBe('{"reason":"pipe closed"}');
    expect(normalizeRuntimeReconnectErrorMessage(undefined)).toBe("undefined");
  });
});

describe("normalizeRuntimeReconnectRecoveryResult", () => {
  it("normalizes legacy string and empty callback results", () => {
    expect(normalizeRuntimeReconnectRecoveryResult(" thread-1 ")).toEqual({
      kind: "rebound",
      threadId: "thread-1",
    });
    expect(normalizeRuntimeReconnectRecoveryResult(" ")).toEqual({ kind: "failed" });
    expect(normalizeRuntimeReconnectRecoveryResult(null)).toEqual({ kind: "failed" });
    expect(normalizeRuntimeReconnectRecoveryResult(undefined)).toEqual({
      kind: "rebound",
      threadId: null,
    });
  });

  it("normalizes structured recovery callback results defensively", () => {
    expect(
      normalizeRuntimeReconnectRecoveryResult({
        kind: "fresh",
        threadId: " thread-fresh ",
      }),
    ).toEqual({
      kind: "fresh",
      threadId: "thread-fresh",
    });
    expect(
      normalizeRuntimeReconnectRecoveryResult({
        kind: "rebound",
        threadId: "",
      }),
    ).toEqual({
      kind: "failed",
      reason: "invalid recovery thread id",
    });
    expect(
      normalizeRuntimeReconnectRecoveryResult({
        kind: "failed",
        reason: { code: "thread-not-found" },
      }),
    ).toEqual({
      kind: "failed",
      reason: '{"code":"thread-not-found"}',
    });
    expect(
      normalizeRuntimeReconnectRecoveryResult({
        kind: "unknown",
      }),
    ).toEqual({
      kind: "failed",
      reason: "invalid recovery result",
    });
  });
});
