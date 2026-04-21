import { describe, expect, it } from "vitest";
import { normalizeBoundedIntegerInput } from "./runtimePoolSection.utils";

describe("normalizeBoundedIntegerInput", () => {
  it("falls back when the input is empty or invalid", () => {
    expect(normalizeBoundedIntegerInput("", 1, 0, 8)).toBe(1);
    expect(normalizeBoundedIntegerInput("abc", 7200, 15, 14400)).toBe(7200);
  });

  it("clamps below min and above max", () => {
    expect(normalizeBoundedIntegerInput("-5", 1, 0, 8)).toBe(0);
    expect(normalizeBoundedIntegerInput("99999", 7200, 15, 14400)).toBe(14400);
  });

  it("keeps valid integer input", () => {
    expect(normalizeBoundedIntegerInput(" 7 ", 1, 0, 8)).toBe(7);
  });
});
