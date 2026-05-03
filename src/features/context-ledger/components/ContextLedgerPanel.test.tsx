/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextLedgerPanel } from "./ContextLedgerPanel";
import type { ContextLedgerComparison, ContextLedgerProjection } from "../types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const serialized = params
        ? Object.values(params).map((value) => String(value)).join("|")
        : "";
      return serialized ? `${key}:${serialized}` : key;
    },
  }),
}));

const projection: ContextLedgerProjection = {
  visible: true,
  totalBlockCount: 3,
  totalGroupCount: 2,
  totalUsageTokens: 220_000,
  contextWindowTokens: 200_000,
  groups: [
    {
      kind: "recent_turns",
      blocks: [
        {
          id: "recent-turns",
          kind: "usage_snapshot",
          title: "codex-recent-turns",
          titleKey: "composer.contextLedgerTitleRecentTurnsCodex",
          detail: null,
          detailKey: "composer.contextLedgerDetailUsageWindow",
          detailParams: {
            usedTokens: 60_000,
            contextWindowTokens: 200_000,
            totalTokens: 220_000,
          },
          participationState: "shared",
          freshness: "pending_sync",
          estimate: {
            kind: "tokens",
            value: 220_000,
          },
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
          detail: "Team review profile",
          inspectionContent: "## Review Scope\n\n- Team review profile\n- `SKILL.md` source",
          sourcePath: "/repo/.claude/skills/build-review/SKILL.md",
          backendSource: "project_claude",
          attributionKind: "engine_injected",
          attributionConfidence: "coarse",
          participationState: "selected",
          freshness: "fresh",
          estimate: {
            kind: "unknown",
            value: null,
          },
        },
        {
          id: "note-1",
          kind: "note_card",
          title: "Release notes",
          detail: "Weekly notes",
          sourceRef: "note-1",
          participationState: "carried_over",
          carryOverReason: "inherited_from_last_send",
          freshness: "fresh",
          estimate: {
            kind: "chars",
            value: 120,
          },
        },
      ],
    },
  ],
};

const comparison: ContextLedgerComparison = {
  basis: "last_send",
  addedCount: 1,
  removedCount: 1,
  retainedCount: 1,
  changedCount: 1,
  currentUsageTokens: 220_000,
  previousUsageTokens: 180_000,
  usageTokenDelta: 40_000,
  items: [
    {
      key: "helper:build-review",
      title: "build-review",
      kind: "helper_selection",
      change: "changed",
    },
    {
      key: "manual:known-issue",
      title: "Known issue",
      kind: "manual_memory",
      change: "added",
    },
  ],
};

describe("ContextLedgerPanel", () => {
  it("renders a summary entrypoint and grouped blocks when expanded", () => {
    const onToggle = vi.fn();
    const onHide = vi.fn();
    const onShow = vi.fn();
    const onExcludeBlock = vi.fn();
    const onClearCarryOverBlock = vi.fn();
    const onBatchKeepBlocks = vi.fn();
    const onBatchExcludeBlocks = vi.fn();
    const onBatchClearCarryOverBlocks = vi.fn();
    const onTogglePinBlock = vi.fn();
    const onOpenBlockSource = vi.fn();
    const { rerender } = render(
      <ContextLedgerPanel
        projection={projection}
        comparison={comparison}
        expanded={false}
        hidden={false}
        onToggle={onToggle}
        onHide={onHide}
        onShow={onShow}
        onExcludeBlock={onExcludeBlock}
        onClearCarryOverBlock={onClearCarryOverBlock}
        onBatchKeepBlocks={onBatchKeepBlocks}
        onBatchExcludeBlocks={onBatchExcludeBlocks}
        onBatchClearCarryOverBlocks={onBatchClearCarryOverBlocks}
        onTogglePinBlock={onTogglePinBlock}
        onOpenBlockSource={onOpenBlockSource}
      />,
    );

    expect(screen.getByText("composer.contextLedgerTitle")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("composer.contextLedgerSummaryTokens:220k"))).toBeTruthy();
    expect(screen.queryByText("composer.contextLedgerTitleRecentTurnsCodex")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /composer.contextLedgerTitle/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "composer.contextLedgerHide" }));
    expect(onHide).toHaveBeenCalledTimes(1);

    rerender(
      <ContextLedgerPanel
        projection={projection}
        comparison={comparison}
        expanded
        hidden={false}
        onToggle={onToggle}
        onHide={onHide}
        onShow={onShow}
        onExcludeBlock={onExcludeBlock}
        onClearCarryOverBlock={onClearCarryOverBlock}
        onBatchKeepBlocks={onBatchKeepBlocks}
        onBatchExcludeBlocks={onBatchExcludeBlocks}
        onBatchClearCarryOverBlocks={onBatchClearCarryOverBlocks}
        onTogglePinBlock={onTogglePinBlock}
        onOpenBlockSource={onOpenBlockSource}
      />,
    );

    expect(screen.getByText("composer.contextLedgerGroupRecentTurns")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerTruthNote")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerComparisonLastSend")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerComparisonUsageDelta:+40k")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerComparisonLastSendHint")).toBeTruthy();
    expect(screen.getAllByText("composer.contextLedgerComparisonAdded:1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("composer.contextLedgerComparisonChanged:1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Known issue")).toBeNull();
    expect(screen.getByText("composer.contextLedgerGroupHelperSelection")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerTitleRecentTurnsCodex")).toBeTruthy();
    expect(screen.getAllByText("build-review").length).toBeGreaterThan(0);
    expect(screen.queryByText("composer.contextLedgerBlockUsageSnapshot")).toBeNull();
    expect(screen.queryByText("composer.contextLedgerParticipationShared")).toBeNull();
    expect(screen.getByText("composer.contextLedgerEstimateUnknown")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerAttributionEngineInjected")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerBackendSourceProjectClaude")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerAttributionConfidenceCoarse")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerAttributionExplanationCoarse")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerCarryOverExplanationInherited")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerBatchTitle")).toBeTruthy();
    expect(screen.getByRole("region", { name: "composer.contextLedgerTitle" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("composer.contextLedgerBatchSelectBlock:Release notes"));
    fireEvent.click(screen.getByText("composer.contextLedgerBatchClearSelected:1"));
    expect(onBatchClearCarryOverBlocks).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("composer.contextLedgerBatchSelectAll"));
    fireEvent.click(screen.getByText("composer.contextLedgerBatchExcludeSelected:1"));
    expect(onBatchExcludeBlocks).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByText("composer.contextLedgerActionExcludeNextSend")[0]!);
    expect(onExcludeBlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("composer.contextLedgerActionClearCarriedOver"));
    expect(onClearCarryOverBlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("composer.contextLedgerActionOpenNoteSource"));
    expect(onOpenBlockSource).toHaveBeenCalledWith({
      kind: "note_card",
      noteId: "note-1",
    });
    fireEvent.click(screen.getAllByText("composer.contextLedgerActionOpenSourceDetail")[1]!);
    expect(screen.getByRole("dialog", { name: "composer.contextLedgerDetailDialogTitle" })).toBeTruthy();
    expect(screen.getByText("/repo/.claude/skills/build-review/SKILL.md")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Review Scope" })).toBeTruthy();
    expect(screen.getByText("SKILL.md")).toBeTruthy();
    fireEvent.click(screen.getByText("composer.contextLedgerDetailDialogClose"));
    fireEvent.click(screen.getAllByText("composer.contextLedgerActionOpenSourceDetail")[0]!);
    expect(screen.getAllByText("composer.contextLedgerTitleRecentTurnsCodex").length).toBeGreaterThan(1);
    const recentTurnsDialog = screen.getByRole("dialog", { name: "composer.contextLedgerDetailDialogTitle" });
    expect(recentTurnsDialog).toBeTruthy();
    expect(recentTurnsDialog.textContent).toContain("composer.contextLedgerDetailUsageWindow:60000|200000|220000");

    rerender(
      <ContextLedgerPanel
        projection={projection}
        comparison={comparison}
        expanded
        hidden
        onToggle={onToggle}
        onHide={onHide}
        onShow={onShow}
        onExcludeBlock={onExcludeBlock}
        onClearCarryOverBlock={onClearCarryOverBlock}
        onBatchKeepBlocks={onBatchKeepBlocks}
        onBatchExcludeBlocks={onBatchExcludeBlocks}
        onBatchClearCarryOverBlocks={onBatchClearCarryOverBlocks}
        onTogglePinBlock={onTogglePinBlock}
        onOpenBlockSource={onOpenBlockSource}
      />,
    );

    expect(screen.queryByRole("region", { name: "composer.contextLedgerTitle" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "composer.contextLedgerShow" }));
    expect(onShow).toHaveBeenCalledTimes(1);
  });
});
