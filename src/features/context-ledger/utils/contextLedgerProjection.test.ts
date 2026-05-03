import { describe, expect, it } from "vitest";
import { buildContextLedgerProjection, resolveDualContextUsageModel } from "./contextLedgerProjection";
import type { ContextLedgerProjectionInput } from "../types";

function makeInput(overrides: Partial<ContextLedgerProjectionInput> = {}): ContextLedgerProjectionInput {
  return {
    engine: "codex",
    contextUsage: null,
    contextDualViewEnabled: false,
    dualContextUsage: null,
    manualMemoryInjectionMode: "detail",
    selectedManualMemories: [],
    selectedNoteCards: [],
    selectedInlineFileReferences: [],
    activeFileReference: null,
    selectedContextChips: [],
    ...overrides,
  };
}

describe("resolveDualContextUsageModel", () => {
  it("uses last input+cached tokens for current window occupancy", () => {
    const usage = resolveDualContextUsageModel(
      {
        total: {
          totalTokens: 220_000,
          inputTokens: 140_000,
          cachedInputTokens: 40_000,
          outputTokens: 40_000,
          reasoningOutputTokens: 0,
        },
        last: {
          totalTokens: 80_000,
          inputTokens: 50_000,
          cachedInputTokens: 10_000,
          outputTokens: 20_000,
          reasoningOutputTokens: 0,
        },
        modelContextWindow: 200_000,
      },
      false,
      "idle",
      null,
      null,
      null,
    );

    expect(usage.usedTokens).toBe(60_000);
    expect(usage.percent).toBe(30);
    expect(usage.hasUsage).toBe(true);
  });
});

describe("buildContextLedgerProjection", () => {
  it("builds deterministic manual memory blocks from injectable text", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        selectedManualMemories: [
          {
            id: "m-2",
            title: "Second",
            summary: "Second summary",
            detail: "用户输入：Second question\n\n助手输出摘要：Second answer",
            kind: "known_issue",
            importance: "high",
            updatedAt: 20,
            tags: [],
          },
          {
            id: "m-1",
            title: "First",
            summary: "First summary",
            detail: "用户输入：First question\n\n助手输出摘要：First answer",
            kind: "known_issue",
            importance: "high",
            updatedAt: 10,
            tags: [],
          },
        ],
      }),
    );

    const group = projection.groups.find((entry) => entry.kind === "manual_memory");
    expect(group?.blocks.map((entry) => entry.sourceRef)).toEqual(["m-2", "m-1"]);
    expect(group?.blocks[0]?.title).toBe("Second question");
    expect(group?.blocks[0]?.estimate.kind).toBe("chars");
    expect(group?.blocks[0]?.estimate.value).toBeGreaterThan(0);
  });

  it("deduplicates repeated active and inline file references", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        activeFileReference: {
          path: "/repo/src/demo.ts",
          lineRange: { startLine: 5, endLine: 8 },
        },
        selectedInlineFileReferences: [
          { id: "same", label: "📄 demo.ts", path: "/repo/src/demo.ts" },
          { id: "other", label: "📄 other.ts", path: "/repo/src/other.ts" },
        ],
      }),
    );

    const group = projection.groups.find((entry) => entry.kind === "attached_resource");
    expect(group?.blocks.filter((entry) => entry.kind === "file_reference")).toHaveLength(2);
    expect(group?.blocks[0]?.detail).toContain("L5-8");
  });

  it("keeps recent-turn usage aligned with dual view and marks it shared", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        contextDualViewEnabled: true,
        contextUsage: {
          total: {
            totalTokens: 220_000,
            inputTokens: 140_000,
            cachedInputTokens: 40_000,
            outputTokens: 40_000,
            reasoningOutputTokens: 0,
          },
          last: {
            totalTokens: 80_000,
            inputTokens: 50_000,
            cachedInputTokens: 10_000,
            outputTokens: 20_000,
            reasoningOutputTokens: 0,
          },
          modelContextWindow: 200_000,
        },
        dualContextUsage: {
          usedTokens: 60_000,
          contextWindow: 200_000,
          percent: 30,
          hasUsage: true,
          compactionState: "compacted",
          compactionSource: "auto",
          usageSyncPendingAfterCompaction: true,
        },
      }),
    );

    const recentTurns = projection.groups.find((entry) => entry.kind === "recent_turns")?.blocks[0];
    const compaction = projection.groups.find((entry) => entry.kind === "compaction_summary")?.blocks[0];
    expect(recentTurns?.estimate.value).toBe(220_000);
    expect(recentTurns?.participationState).toBe("shared");
    expect(recentTurns?.freshness).toBe("pending_sync");
    expect(recentTurns?.inspectionTitleKey).toBe("composer.contextLedgerTitleRecentTurnsCodex");
    expect(recentTurns?.inspectionContentKey).toBe("composer.contextLedgerInspectionUsageWindow");
    expect(recentTurns?.inspectionContentParams).toEqual({
      usedTokens: 60_000,
      contextWindowTokens: 200_000,
      totalTokens: 220_000,
    });
    expect(compaction?.freshness).toBe("pending_sync");
  });

  it("hides the ledger when only a recent-turn usage snapshot exists", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        contextUsage: {
          total: {
            totalTokens: 220_000,
            inputTokens: 140_000,
            cachedInputTokens: 40_000,
            outputTokens: 40_000,
            reasoningOutputTokens: 0,
          },
          last: {
            totalTokens: 80_000,
            inputTokens: 50_000,
            cachedInputTokens: 10_000,
            outputTokens: 20_000,
            reasoningOutputTokens: 0,
          },
          modelContextWindow: 200_000,
        },
      }),
    );

    expect(projection.visible).toBe(false);
  });

  it("keeps helper selections separate from attached resources", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        selectedContextChips: [
          {
            type: "skill",
            name: "doc-backup",
            description: "backup docs",
            path: "/repo/.claude/skills/doc-backup/SKILL.md",
            source: "global_claude",
          },
        ],
      }),
    );

    expect(projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks).toHaveLength(1);
    expect(projection.groups.find((entry) => entry.kind === "attached_resource")).toBeUndefined();
    expect(
      projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks[0]?.attributionKind,
    ).toBe("engine_injected");
    expect(
      projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks[0]?.backendSource,
    ).toBe("global_claude");
  });

  it("classifies workspace-managed and system-managed helper sources via backend provenance", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        selectedContextChips: [
          {
            type: "commons",
            name: "workspace-lint",
            description: "workspace command",
            path: "/tmp/workspaces/ws-1/commands/workspace-lint.md",
            source: "workspace_managed",
          },
          {
            type: "skill",
            name: "shared",
            description: "plugin skill",
            path: "/Users/demo/.claude/plugins/cache/owner/plugin/skills/shared/SKILL.md",
            source: "global_claude_plugin",
          },
          {
            type: "skill",
            name: "unknown",
            description: "unknown source",
          },
        ],
      }),
    );

    const helperBlocks = projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks ?? [];
    expect(helperBlocks[0]?.attributionKind).toBe("workspace_context");
    expect(helperBlocks[0]?.attributionConfidence).toBe("precise");
    expect(helperBlocks[1]?.attributionKind).toBe("system_injected");
    expect(helperBlocks[1]?.attributionConfidence).toBe("coarse");
    expect(helperBlocks[2]?.attributionKind).toBe("degraded");
    expect(helperBlocks[2]?.attributionConfidence).toBe("degraded");
  });

  it("marks retained explicit blocks as carried over from the previous send", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        selectedManualMemories: [
          {
            id: "memory-1",
            title: "Known issue",
            summary: "Summary",
            detail: "用户输入：Question\n\n助手输出摘要：Answer",
            kind: "known_issue",
            importance: "high",
            updatedAt: 10,
            tags: [],
          },
        ],
        selectedContextChips: [
          {
            type: "skill",
            name: "doc-backup",
            description: "backup docs",
          },
        ],
        retainedManualMemoryIds: ["memory-1"],
        retainedContextChipKeys: ["skill:doc-backup"],
      }),
    );

    const manualBlock = projection.groups.find((entry) => entry.kind === "manual_memory")?.blocks[0];
    const helperBlock = projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks[0];
    expect(manualBlock?.participationState).toBe("carried_over");
    expect(manualBlock?.carryOverReason).toBe("inherited_from_last_send");
    expect(helperBlock?.participationState).toBe("carried_over");
    expect(helperBlock?.carryOverReason).toBe("inherited_from_last_send");
  });

  it("marks unsupported-engine usage as degraded rather than pretending precise attribution", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        engine: "opencode",
        contextUsage: {
          total: {
            totalTokens: 100,
            inputTokens: 60,
            cachedInputTokens: 0,
            outputTokens: 40,
            reasoningOutputTokens: 0,
          },
          last: {
            totalTokens: 20,
            inputTokens: 20,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
          },
          modelContextWindow: 1000,
        },
      }),
    );

    expect(
      projection.groups.find((entry) => entry.kind === "recent_turns")?.blocks[0]?.participationState,
    ).toBe("degraded");
  });

  it("marks carried manual memory and helper selections as pinned for the next send", () => {
    const projection = buildContextLedgerProjection(
      makeInput({
        selectedManualMemories: [
          {
            id: "memory-1",
            title: "Known issue",
            summary: "summary",
            detail: "用户输入：Question\n\n助手输出摘要：Answer",
            kind: "known_issue",
            importance: "high",
            updatedAt: 20,
            tags: [],
          },
        ],
        selectedContextChips: [
          {
            type: "skill",
            name: "doc-backup",
            description: "backup docs",
            path: "/repo/.codex/skills/doc-backup/SKILL.md",
            source: "global_codex",
          },
        ],
        carryOverManualMemoryIds: ["memory-1"],
        carryOverContextChipKeys: ["skill:doc-backup"],
      }),
    );

    expect(
      projection.groups.find((entry) => entry.kind === "manual_memory")?.blocks[0]?.participationState,
    ).toBe("pinned_next_send");
    expect(
      projection.groups.find((entry) => entry.kind === "manual_memory")?.blocks[0]?.carryOverReason,
    ).toBe("will_carry_next_send");
    expect(
      projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks[0]?.participationState,
    ).toBe("pinned_next_send");
    expect(
      projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks[0]?.carryOverReason,
    ).toBe("will_carry_next_send");
    expect(
      projection.groups.find((entry) => entry.kind === "helper_selection")?.blocks[0]?.backendSource,
    ).toBe("global_codex");
  });
});
