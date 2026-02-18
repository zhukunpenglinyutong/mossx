import { describe, expect, it } from "vitest";
import { normalizePlanStepStatus, normalizePlanUpdate } from "./threadNormalize";

describe("threadNormalize plan helpers", () => {
  it("normalizes in_progress and case variants", () => {
    expect(normalizePlanStepStatus("in_progress")).toBe("inProgress");
    expect(normalizePlanStepStatus("In-Progress")).toBe("inProgress");
    expect(normalizePlanStepStatus("completed")).toBe("completed");
  });

  it("falls back invalid values to pending", () => {
    expect(normalizePlanStepStatus("unknown")).toBe("pending");
    expect(normalizePlanStepStatus("")).toBe("pending");
    expect(normalizePlanStepStatus(null)).toBe("pending");
    expect(normalizePlanStepStatus(undefined)).toBe("pending");
  });

  it("builds normalized plan and keeps only valid steps", () => {
    const normalized = normalizePlanUpdate("turn-1", "Plan", [
      { step: "Step 1", status: "in_progress" },
      { step: "Step 2", status: "completed" },
      { step: "", status: "completed" },
      { foo: "bar" },
    ]);

    expect(normalized).toEqual({
      turnId: "turn-1",
      explanation: "Plan",
      steps: [
        { step: "Step 1", status: "inProgress" },
        { step: "Step 2", status: "completed" },
      ],
    });
  });

  it("returns null when both explanation and steps are empty", () => {
    expect(normalizePlanUpdate("turn-1", "", [])).toBeNull();
  });
});
