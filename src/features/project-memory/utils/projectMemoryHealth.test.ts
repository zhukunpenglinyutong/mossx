import { describe, expect, it } from "vitest";
import { deriveProjectMemoryHealthState, resolveProjectMemoryReviewState } from "./projectMemoryHealth";

describe("projectMemoryHealth", () => {
  it("marks complete conversation turns", () => {
    expect(
      deriveProjectMemoryHealthState({
        recordKind: "conversation_turn",
        userInput: "问题",
        assistantResponse: "回复",
      }),
    ).toBe("complete");
  });

  it("marks recent input-only turns as pending fusion", () => {
    expect(
      deriveProjectMemoryHealthState(
        {
          recordKind: "conversation_turn",
          userInput: "问题",
          createdAt: 1_000,
        },
        2_000,
      ),
    ).toBe("pending_fusion");
  });

  it("marks old input-only turns as input_only", () => {
    expect(
      deriveProjectMemoryHealthState(
        {
          recordKind: "conversation_turn",
          userInput: "问题",
          createdAt: 1_000,
        },
        60_000,
      ),
    ).toBe("input_only");
  });

  it("marks assistant-only and failed capture states", () => {
    expect(
      deriveProjectMemoryHealthState({
        recordKind: "conversation_turn",
        assistantResponse: "回复",
      }),
    ).toBe("assistant_only");
    expect(
      deriveProjectMemoryHealthState({
        recordKind: "conversation_turn",
      }),
    ).toBe("capture_failed");
  });

  it("derives review state with explicit value winning", () => {
    expect(resolveProjectMemoryReviewState({ recordKind: "conversation_turn" })).toBe(
      "unreviewed",
    );
    expect(resolveProjectMemoryReviewState({ recordKind: "manual_note" })).toBe("kept");
    expect(
      resolveProjectMemoryReviewState({
        recordKind: "conversation_turn",
        reviewState: "obsolete",
      }),
    ).toBe("obsolete");
  });
});
