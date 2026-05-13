import { describe, expect, it } from "vitest";
import {
  buildComposerContextSummary,
  buildComposerSendReadiness,
  projectComposerActivity,
  resolveComposerDisabledReason,
} from "./composerSendReadiness";

describe("composerSendReadiness", () => {
  it("builds target and context summary for Codex", () => {
    const readiness = buildComposerSendReadiness({
      engine: "codex",
      providerLabel: "Codex",
      modelLabel: "gpt-5.2",
      modeLabel: "Code",
      modeImpactLabel: "Full access",
      accessMode: "full-access",
      draftText: "ship it",
      context: {
        selectedMemoryCount: 2,
        selectedNoteCardCount: 1,
        fileReferenceCount: 3,
        imageCount: 1,
        selectedAgentName: "reviewer",
      },
    });

    expect(readiness.target).toMatchObject({
      engine: "codex",
      providerLabel: "Codex",
      modelLabel: "gpt-5.2",
      modeLabel: "Code",
      modeImpactLabel: "Full access",
      accessModeLabel: "full-access",
    });
    expect(readiness.contextSummary.chips).toEqual([
      "memory:2",
      "notes:1",
      "files:3",
      "images:1",
      "agent:reviewer",
    ]);
    expect(readiness.readiness.canSend).toBe(true);
  });

  it("keeps Claude plan target summary independent from runtime state", () => {
    const readiness = buildComposerSendReadiness({
      engine: "claude",
      providerLabel: "Claude Code",
      modelLabel: "Sonnet",
      modeLabel: "Plan",
      draftText: "make a plan",
    });

    expect(readiness.target.providerLabel).toBe("Claude Code");
    expect(readiness.target.modeLabel).toBe("Plan");
    expect(readiness.readiness.primaryAction).toBe("send");
  });

  it("prioritizes config loading over other disabled reasons", () => {
    expect(
      resolveComposerDisabledReason({
        engine: "codex",
        draftText: "hello",
        configLoading: true,
        modeBlocked: true,
        runtimeLifecycleState: "quarantined",
      }),
    ).toBe("config-loading");
  });

  it("maps runtime lifecycle projection into conservative disabled reasons", () => {
    expect(
      resolveComposerDisabledReason({
        engine: "codex",
        draftText: "hello",
        runtimeLifecycleState: "recovering",
      }),
    ).toBe("runtime-recovering");
    expect(
      resolveComposerDisabledReason({
        engine: "codex",
        draftText: "hello",
        runtimeLifecycleState: "quarantined",
      }),
    ).toBe("runtime-quarantined");
    expect(
      resolveComposerDisabledReason({
        engine: "codex",
        draftText: "hello",
        runtimeLifecycleState: "ended",
      }),
    ).toBe("runtime-ended");
  });

  it("projects queue and fusing activity without owning queue mechanics", () => {
    expect(
      projectComposerActivity({
        engine: "codex",
        draftText: "follow up",
        queuedCount: 2,
      }).kind,
    ).toBe("queued");
    expect(
      projectComposerActivity({
        engine: "codex",
        draftText: "follow up",
        queuedCount: 2,
        fusingQueuedMessageId: "queued-1",
      }).kind,
    ).toBe("fusing");
  });

  it("allows queue during active turn but not while request input blocks send", () => {
    const activeTurn = buildComposerSendReadiness({
      engine: "codex",
      draftText: "follow up",
      isProcessing: true,
      canQueue: true,
      canStop: true,
    });
    const awaitingInput = buildComposerSendReadiness({
      engine: "codex",
      draftText: "follow up",
      isProcessing: true,
      canQueue: true,
      requestUserInputState: "pending",
    });

    expect(activeTurn.readiness.canSend).toBe(false);
    expect(activeTurn.readiness.canQueue).toBe(true);
    expect(activeTurn.readiness.primaryAction).toBe("queue");
    expect(awaitingInput.readiness.canQueue).toBe(false);
    expect(awaitingInput.readiness.primaryAction).toBe("jumpToRequest");
  });

  it("shows request_user_input as pointer and blocks only pending state", () => {
    const pending = buildComposerSendReadiness({
      engine: "codex",
      draftText: "answer later",
      requestUserInputState: "pending",
    });
    const submitted = buildComposerSendReadiness({
      engine: "codex",
      draftText: "continue",
      requestUserInputState: "submitted",
    });

    expect(pending.readiness.disabledReason).toBe("awaiting-user-input");
    expect(pending.readiness.primaryAction).toBe("jumpToRequest");
    expect(pending.requestPointer?.canJumpToRequest).toBe(true);
    expect(submitted.readiness.disabledReason).toBeNull();
    expect(submitted.requestPointer).toBeNull();
  });

  it("summarizes empty context explicitly", () => {
    expect(buildComposerContextSummary()).toEqual({
      chips: [],
      compactLabel: "no-extra-context",
      detailLabel: "Sending without extra context.",
    });
  });

  it("sanitizes invalid and fractional context counts before rendering chips", () => {
    expect(
      buildComposerContextSummary({
        selectedMemoryCount: Number.POSITIVE_INFINITY,
        selectedNoteCardCount: -2,
        fileReferenceCount: 2.9,
        imageCount: Number.NaN,
        selectedAgentName: " reviewer ",
      }).chips,
    ).toEqual(["files:2", "agent:reviewer"]);
    expect(
      buildComposerContextSummary({
        ledgerBlockCount: Number.NaN,
        ledgerGroupCount: 3.8,
      }).chips,
    ).toEqual(["groups:3"]);
    expect(
      buildComposerContextSummary({
        selectedAgentName: "   ",
      }).chips,
    ).toEqual([]);
  });
});
