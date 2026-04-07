// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPromptUsageForTests,
  getPromptHeatLevel,
  getPromptUsageEntry,
  recordPromptUsage,
} from "./promptUsage";

describe("promptUsage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearPromptUsageForTests();
  });

  it("records prompt usage counts and timestamps", () => {
    recordPromptUsage("prompt:a", 100);
    recordPromptUsage("prompt:a", 200);

    expect(getPromptUsageEntry("prompt:a")).toEqual({
      count: 2,
      lastUsedAt: 200,
    });
  });

  it("maps prompt usage counts into heat levels", () => {
    expect(getPromptHeatLevel(0)).toBe(0);
    expect(getPromptHeatLevel(1)).toBe(1);
    expect(getPromptHeatLevel(4)).toBe(2);
    expect(getPromptHeatLevel(8)).toBe(3);
  });
});
