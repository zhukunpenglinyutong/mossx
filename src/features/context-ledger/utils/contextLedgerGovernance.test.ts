import { describe, expect, it } from "vitest";
import type { ContextLedgerBlock } from "../types";
import {
  buildContextLedgerGovernanceBuckets,
  canBatchClearCarryOverBlock,
  canBatchExcludeBlock,
  canBatchKeepBlock,
  isBatchGovernableBlock,
} from "./contextLedgerGovernance";

function makeBlock(overrides: Partial<ContextLedgerBlock>): ContextLedgerBlock {
  return {
    id: "block-1",
    kind: "manual_memory",
    title: "Known issue",
    participationState: "selected",
    carryOverReason: null,
    freshness: "fresh",
    estimate: { kind: "chars", value: 12 },
    ...overrides,
  };
}

describe("contextLedgerGovernance", () => {
  it("classifies batch governance eligibility by block kind", () => {
    expect(isBatchGovernableBlock(makeBlock({ kind: "manual_memory" }))).toBe(true);
    expect(isBatchGovernableBlock(makeBlock({ kind: "note_card" }))).toBe(true);
    expect(isBatchGovernableBlock(makeBlock({ kind: "helper_selection" }))).toBe(true);
    expect(isBatchGovernableBlock(makeBlock({ kind: "file_reference" }))).toBe(false);
  });

  it("separates keep, exclude, and clear eligibility by participation state", () => {
    expect(canBatchKeepBlock(makeBlock({ participationState: "selected" }))).toBe(true);
    expect(canBatchKeepBlock(makeBlock({ participationState: "carried_over" }))).toBe(true);
    expect(canBatchKeepBlock(makeBlock({ participationState: "pinned_next_send" }))).toBe(false);

    expect(canBatchExcludeBlock(makeBlock({ participationState: "selected" }))).toBe(true);
    expect(canBatchExcludeBlock(makeBlock({ participationState: "pinned_next_send" }))).toBe(true);
    expect(canBatchExcludeBlock(makeBlock({ participationState: "carried_over" }))).toBe(false);

    expect(canBatchClearCarryOverBlock(makeBlock({ participationState: "carried_over" }))).toBe(true);
    expect(canBatchClearCarryOverBlock(makeBlock({ participationState: "selected" }))).toBe(false);
  });

  it("builds governance buckets by explicit block source kind", () => {
    const buckets = buildContextLedgerGovernanceBuckets([
      makeBlock({ id: "m1", sourceRef: "memory-1" }),
      makeBlock({ id: "m2", kind: "note_card", sourceRef: "note-1" }),
      makeBlock({ id: "m3", kind: "helper_selection", sourceRef: "skill:doc-backup" }),
      makeBlock({ id: "m4", kind: "file_reference", sourceRef: "src/App.tsx" }),
      makeBlock({ id: "m5", kind: "helper_selection", sourceRef: "commons:review" }),
    ]);

    expect(buckets.manualMemoryIds).toEqual(["memory-1"]);
    expect(buckets.noteCardIds).toEqual(["note-1"]);
    expect(buckets.helperKeys).toEqual(["skill:doc-backup", "commons:review"]);
  });
});
