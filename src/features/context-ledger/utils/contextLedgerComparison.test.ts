import { describe, expect, it } from "vitest";
import { buildContextLedgerComparison } from "./contextLedgerComparison";
import type { ContextLedgerProjection } from "../types";

function makeProjection(
  overrides: Partial<ContextLedgerProjection> = {},
): ContextLedgerProjection {
  return {
    visible: true,
    totalBlockCount: 0,
    totalGroupCount: 0,
    totalUsageTokens: 100,
    contextWindowTokens: 1000,
    groups: [],
    ...overrides,
  };
}

describe("buildContextLedgerComparison", () => {
  it("classifies added, removed, retained, and changed blocks", () => {
    const previous = makeProjection({
      totalBlockCount: 3,
      totalGroupCount: 2,
      groups: [
        {
          kind: "manual_memory",
          blocks: [
            {
              id: "memory-1",
              kind: "manual_memory",
              title: "Known issue",
              participationState: "selected",
              freshness: "fresh",
              estimate: { kind: "chars", value: 42 },
              sourceRef: "memory-1",
            },
            {
              id: "memory-2",
              kind: "manual_memory",
              title: "Removed memory",
              participationState: "selected",
              freshness: "fresh",
              estimate: { kind: "chars", value: 10 },
              sourceRef: "memory-2",
            },
          ],
        },
        {
          kind: "helper_selection",
          blocks: [
            {
              id: "helper-1",
              kind: "helper_selection",
              title: "build-review",
              detail: "old detail",
              participationState: "selected",
              freshness: "fresh",
              estimate: { kind: "unknown", value: null },
              sourceRef: "skill:build-review",
            },
          ],
        },
      ],
    });
    const current = makeProjection({
      totalBlockCount: 3,
      totalGroupCount: 2,
      totalUsageTokens: 140,
      groups: [
        {
          kind: "manual_memory",
          blocks: [
            {
              id: "memory-1",
              kind: "manual_memory",
              title: "Known issue",
              participationState: "selected",
              freshness: "fresh",
              estimate: { kind: "chars", value: 42 },
              sourceRef: "memory-1",
            },
            {
              id: "memory-3",
              kind: "manual_memory",
              title: "Added memory",
              participationState: "selected",
              freshness: "fresh",
              estimate: { kind: "chars", value: 11 },
              sourceRef: "memory-3",
            },
          ],
        },
        {
          kind: "helper_selection",
          blocks: [
            {
              id: "helper-1",
              kind: "helper_selection",
              title: "build-review",
              detail: "new detail",
              participationState: "selected",
              freshness: "fresh",
              estimate: { kind: "unknown", value: null },
              sourceRef: "skill:build-review",
            },
          ],
        },
      ],
    });

    const comparison = buildContextLedgerComparison(
      current,
      previous,
      "last_send",
    );

    expect(comparison).not.toBeNull();
    expect(comparison?.addedCount).toBe(1);
    expect(comparison?.removedCount).toBe(1);
    expect(comparison?.retainedCount).toBe(1);
    expect(comparison?.changedCount).toBe(1);
    expect(comparison?.usageTokenDelta).toBe(40);
    expect(comparison?.items.map((item) => `${item.change}:${item.title}`)).toEqual([
      "changed:build-review",
      "added:Added memory",
      "removed:Removed memory",
    ]);
  });

  it("returns null when the two snapshots are materially equivalent", () => {
    const projection = makeProjection({
      totalBlockCount: 1,
      totalGroupCount: 1,
      groups: [
        {
          kind: "recent_turns",
          blocks: [
            {
              id: "recent-turns",
              kind: "usage_snapshot",
              title: "Recent turns",
              participationState: "shared",
              freshness: "fresh",
              estimate: { kind: "tokens", value: 100 },
            },
          ],
        },
      ],
    });

    expect(
      buildContextLedgerComparison(projection, projection, "last_send"),
    ).toBeNull();
  });

  it("treats carry-over reason and attribution confidence changes as material", () => {
    const previous = makeProjection({
      totalBlockCount: 1,
      totalGroupCount: 1,
      groups: [
        {
          kind: "helper_selection",
          blocks: [
            {
              id: "helper-1",
              kind: "helper_selection",
              title: "build-review",
              participationState: "carried_over",
              carryOverReason: "inherited_from_last_send",
              freshness: "fresh",
              attributionKind: "engine_injected",
              attributionConfidence: "coarse",
              estimate: { kind: "unknown", value: null },
              sourceRef: "skill:build-review",
            },
          ],
        },
      ],
    });
    const current = makeProjection({
      totalBlockCount: 1,
      totalGroupCount: 1,
      groups: [
        {
          kind: "helper_selection",
          blocks: [
            {
              id: "helper-1",
              kind: "helper_selection",
              title: "build-review",
              participationState: "pinned_next_send",
              carryOverReason: "will_carry_next_send",
              freshness: "fresh",
              attributionKind: "engine_injected",
              attributionConfidence: "precise",
              estimate: { kind: "unknown", value: null },
              sourceRef: "skill:build-review",
            },
          ],
        },
      ],
    });

    const comparison = buildContextLedgerComparison(current, previous, "last_send");
    expect(comparison?.changedCount).toBe(1);
    expect(comparison?.items[0]?.change).toBe("changed");
  });
});
