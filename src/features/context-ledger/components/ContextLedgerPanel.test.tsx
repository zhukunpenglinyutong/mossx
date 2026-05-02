/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextLedgerPanel } from "./ContextLedgerPanel";
import type { ContextLedgerProjection } from "../types";

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
          sourcePath: "/repo/.claude/skills/build-review/SKILL.md",
          backendSource: "project_claude",
          attributionKind: "engine_injected",
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
          participationState: "selected",
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

describe("ContextLedgerPanel", () => {
  it("renders a summary entrypoint and grouped blocks when expanded", () => {
    const onToggle = vi.fn();
    const onExcludeBlock = vi.fn();
    const onTogglePinBlock = vi.fn();
    const { rerender } = render(
      <ContextLedgerPanel
        projection={projection}
        expanded={false}
        onToggle={onToggle}
        onExcludeBlock={onExcludeBlock}
        onTogglePinBlock={onTogglePinBlock}
      />,
    );

    expect(screen.getByText("composer.contextLedgerTitle")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("composer.contextLedgerSummaryTokens:220k"))).toBeTruthy();
    expect(screen.queryByText("composer.contextLedgerTitleRecentTurnsCodex")).toBeNull();

    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <ContextLedgerPanel
        projection={projection}
        expanded
        onToggle={onToggle}
        onExcludeBlock={onExcludeBlock}
        onTogglePinBlock={onTogglePinBlock}
      />,
    );

    expect(screen.getByText("composer.contextLedgerGroupRecentTurns")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerGroupHelperSelection")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerTitleRecentTurnsCodex")).toBeTruthy();
    expect(screen.getByText("build-review")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerParticipationShared")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerEstimateUnknown")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerAttributionEngineInjected")).toBeTruthy();
    expect(screen.getByText("composer.contextLedgerBackendSourceProjectClaude")).toBeTruthy();
    expect(screen.getByRole("region", { name: "composer.contextLedgerTitle" })).toBeTruthy();
    fireEvent.click(screen.getAllByText("composer.contextLedgerActionExcludeNextSend")[0]!);
    expect(onExcludeBlock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByText("composer.contextLedgerActionOpenSourceDetail")[1]!);
    expect(screen.getByRole("dialog", { name: "composer.contextLedgerDetailDialogTitle" })).toBeTruthy();
    expect(screen.getByText("/repo/.claude/skills/build-review/SKILL.md")).toBeTruthy();
  });
});
