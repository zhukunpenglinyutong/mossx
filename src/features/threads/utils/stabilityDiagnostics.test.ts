import { describe, expect, it } from "vitest";
import {
  buildPartialHistoryDiagnostic,
  classifyStaleThreadRecovery,
  resolveThreadStabilityDiagnostic,
} from "./stabilityDiagnostics";

describe("resolveThreadStabilityDiagnostic", () => {
  it("detects runtime quarantine diagnostics", () => {
    expect(
      resolveThreadStabilityDiagnostic(
        "会话启动失败： [RUNTIME_RECOVERY_QUARANTINED] Runtime recovery paused for workspace ws-1 (engine codex).",
      ),
    ).toEqual({
      category: "runtime_quarantined",
      reconnectReason: "recovery-quarantined",
      rawMessage:
        "会话启动失败： [RUNTIME_RECOVERY_QUARANTINED] Runtime recovery paused for workspace ws-1 (engine codex).",
    });
  });

  it("detects connectivity drift diagnostics from runtime pipe and stale thread errors", () => {
    expect(resolveThreadStabilityDiagnostic("Broken pipe (os error 32)")).toEqual({
      category: "connectivity_drift",
      reconnectReason: "broken-pipe",
      rawMessage: "Broken pipe (os error 32)",
    });
    expect(
      resolveThreadStabilityDiagnostic(
        "会话失败： thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30",
      ),
    ).toEqual({
      category: "connectivity_drift",
      reconnectReason: "thread-not-found",
      rawMessage: "会话失败： thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30",
    });
    expect(
      resolveThreadStabilityDiagnostic(
        "Context compaction failed: thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30",
      ),
    ).toEqual({
      category: "connectivity_drift",
      reconnectReason: "thread-not-found",
      rawMessage:
        "Context compaction failed: thread not found: 019da207-c1ae-7cb3-9cb6-25f281fbfb30",
    });
    expect(resolveThreadStabilityDiagnostic("Session failed to start: session not found")).toEqual({
      category: "connectivity_drift",
      reconnectReason: "session-not-found",
      rawMessage: "Session failed to start: session not found",
    });
  });

  it("detects runtime ended diagnostics", () => {
    expect(
      resolveThreadStabilityDiagnostic(
        "[RUNTIME_ENDED] Managed runtime ended before this conversation turn settled.",
      ),
    ).toEqual({
      category: "connectivity_drift",
      reconnectReason: "runtime-ended",
      rawMessage:
        "[RUNTIME_ENDED] Managed runtime ended before this conversation turn settled.",
    });
  });
});

describe("classifyStaleThreadRecovery", () => {
  it("classifies stale binding, runtime loss, and recovery user actions", () => {
    expect(classifyStaleThreadRecovery("Thread not found: abc")).toEqual({
      reasonCode: "stale-thread-binding",
      staleReason: "thread-not-found",
      retryable: true,
      userAction: "recover-thread",
      recommendedOutcome: "rebound",
      rawMessage: "Thread not found: abc",
    });
    expect(classifyStaleThreadRecovery("[SESSION_NOT_FOUND] session file not found")).toEqual({
      reasonCode: "stale-thread-binding",
      staleReason: "session-not-found",
      retryable: true,
      userAction: "recover-thread",
      recommendedOutcome: "rebound",
      rawMessage: "[SESSION_NOT_FOUND] session file not found",
    });
    expect(classifyStaleThreadRecovery("Broken pipe (os error 32)")).toEqual({
      reasonCode: "broken-pipe",
      staleReason: "broken-pipe",
      retryable: true,
      userAction: "reconnect",
      recommendedOutcome: "failed",
      rawMessage: "Broken pipe (os error 32)",
    });
    expect(
      classifyStaleThreadRecovery("[RUNTIME_ENDED] Managed runtime ended before this turn settled."),
    ).toEqual({
      reasonCode: "runtime-ended",
      staleReason: "runtime-ended",
      retryable: true,
      userAction: "reconnect",
      recommendedOutcome: "failed",
      rawMessage: "[RUNTIME_ENDED] Managed runtime ended before this turn settled.",
    });
    expect(
      classifyStaleThreadRecovery(
        "[SESSION_CREATE_RUNTIME_RECOVERING] Managed runtime was restarting.",
      ),
    ).toEqual({
      reasonCode: "stopping-runtime-race",
      staleReason: "stopping-runtime-race",
      retryable: true,
      userAction: "reconnect",
      recommendedOutcome: "failed",
      rawMessage: "[SESSION_CREATE_RUNTIME_RECOVERING] Managed runtime was restarting.",
    });
  });

  it("does not classify mixed multi-line diagnostics as recoverable stale binding", () => {
    expect(
      classifyStaleThreadRecovery("thread not found\nnormal assistant explanation"),
    ).toBeNull();
  });
});

describe("buildPartialHistoryDiagnostic", () => {
  it("normalizes partial history diagnostics", () => {
    expect(buildPartialHistoryDiagnostic("missing_items, missing_plan")).toEqual({
      category: "partial_history",
      rawMessage: "missing_items, missing_plan",
    });
  });
});
