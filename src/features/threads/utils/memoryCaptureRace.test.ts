import { describe, expect, it } from "vitest";
import {
  shouldMergeOnAssistantCompleted,
  shouldMergeOnInputCapture,
} from "./memoryCaptureRace";

describe("memoryCaptureRace", () => {
  it("returns false when no pending assistant completion on input capture", () => {
    expect(shouldMergeOnInputCapture(null, 10_000, 30_000)).toBe(false);
  });

  it("returns true when assistant completion is fresh on input capture", () => {
    expect(shouldMergeOnInputCapture(9_000, 10_000, 30_000)).toBe(true);
  });

  it("returns false when assistant completion is stale on input capture", () => {
    expect(shouldMergeOnInputCapture(1_000, 40_100, 30_000)).toBe(false);
  });

  it("returns false when no pending input capture on assistant completed", () => {
    expect(shouldMergeOnAssistantCompleted(null, 10_000, 30_000)).toBe(false);
  });

  it("returns true when input capture is fresh on assistant completed", () => {
    expect(shouldMergeOnAssistantCompleted(9_000, 10_000, 30_000)).toBe(true);
  });

  it("returns false when input capture is stale on assistant completed", () => {
    expect(shouldMergeOnAssistantCompleted(1_000, 40_100, 30_000)).toBe(false);
  });
});
