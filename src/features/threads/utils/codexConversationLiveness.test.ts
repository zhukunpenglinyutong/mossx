import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  buildCodexLivenessDiagnostic,
  canUseLocalFirstSendCodexDraftReplacement,
  canUseDisposableCodexDraftReplacement,
  hasDurableCodexConversationActivity,
  resolveCodexAcceptedTurnFact,
  shouldDeferCodexActivityUntilTurnAccepted,
} from "./codexConversationLiveness";

describe("codexConversationLiveness", () => {
  it("treats unknown accepted-turn fact as durable-safe", () => {
    const resolution = resolveCodexAcceptedTurnFact({
      items: [],
    });

    expect(resolution).toEqual({
      fact: "unknown",
      source: "no-authoritative-fact",
      hasDurableActivity: false,
    });
    expect(canUseDisposableCodexDraftReplacement(resolution)).toBe(false);
    expect(shouldDeferCodexActivityUntilTurnAccepted(resolution)).toBe(true);
    expect(
      canUseLocalFirstSendCodexDraftReplacement({
        resolution,
        hasLocalUserIntent: true,
      }),
    ).toBe(true);
    expect(
      canUseLocalFirstSendCodexDraftReplacement({
        resolution,
        hasLocalUserIntent: false,
      }),
    ).toBe(false);
  });

  it("allows disposable replacement only for an authoritative empty draft", () => {
    const resolution = resolveCodexAcceptedTurnFact({
      record: {
        fact: "empty-draft",
        source: "thread-start",
        updatedAt: 100,
      },
      items: [],
    });

    expect(resolution.fact).toBe("empty-draft");
    expect(canUseDisposableCodexDraftReplacement(resolution)).toBe(true);
    expect(shouldDeferCodexActivityUntilTurnAccepted(resolution)).toBe(true);
  });

  it("promotes durable activity even when the stored fact is missing", () => {
    const items: ConversationItem[] = [
      {
        id: "user-1",
        kind: "message",
        role: "user",
        text: "already accepted",
      },
    ];

    expect(hasDurableCodexConversationActivity(items)).toBe(true);
    const resolution = resolveCodexAcceptedTurnFact({ items });
    expect(resolution.fact).toBe("accepted");
    expect(shouldDeferCodexActivityUntilTurnAccepted(resolution)).toBe(false);
    expect(
      canUseLocalFirstSendCodexDraftReplacement({
        resolution,
        hasLocalUserIntent: true,
      }),
    ).toBe(false);
  });

  it("does not treat optimistic local bubbles as durable accepted work", () => {
    const items: ConversationItem[] = [
      {
        id: "optimistic-user-1",
        kind: "message",
        role: "user",
        text: "pending",
      },
    ];

    expect(hasDurableCodexConversationActivity(items)).toBe(false);
    expect(resolveCodexAcceptedTurnFact({ items }).fact).toBe("unknown");
  });

  it("builds correlatable diagnostics with stable dimensions", () => {
    expect(
      buildCodexLivenessDiagnostic({
        workspaceId: "ws-1",
        threadId: "thread-1",
        stage: "fresh-continuation",
        outcome: "fresh",
        acceptedTurnFact: "empty-draft",
        source: "first-turn-fallback",
        reason: "thread not found",
        runtimeGeneration: 2,
        turnId: "turn-1",
        lastEventAgeMs: 12_000,
      }),
    ).toEqual({
      workspaceId: "ws-1",
      threadId: "thread-1",
      engine: "codex",
      stage: "fresh-continuation",
      outcome: "fresh",
      acceptedTurnFact: "empty-draft",
      source: "first-turn-fallback",
      reason: "thread not found",
      runtimeGeneration: 2,
      turnId: "turn-1",
      lastEventAgeMs: 12_000,
    });
  });
});
