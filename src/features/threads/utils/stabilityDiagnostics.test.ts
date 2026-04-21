import { describe, expect, it } from "vitest";
import {
  buildPartialHistoryDiagnostic,
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

describe("buildPartialHistoryDiagnostic", () => {
  it("normalizes partial history diagnostics", () => {
    expect(buildPartialHistoryDiagnostic("missing_items, missing_plan")).toEqual({
      category: "partial_history",
      rawMessage: "missing_items, missing_plan",
    });
  });
});
