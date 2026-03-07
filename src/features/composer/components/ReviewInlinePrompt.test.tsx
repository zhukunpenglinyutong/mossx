/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewPromptState } from "../../threads/hooks/useReviewPrompt";
import { ReviewInlinePrompt } from "./ReviewInlinePrompt";

function createReviewPrompt(
  step: NonNullable<ReviewPromptState>["step"],
): NonNullable<ReviewPromptState> {
  return {
    workspace: {
      id: "ws-1",
      name: "Workspace",
      path: "/tmp/workspace",
      connected: true,
      settings: {
        sidebarCollapsed: false,
      },
    },
    threadIdSnapshot: "thread-1",
    step,
    branches: [
      { name: "main", lastCommit: 10 },
      { name: "codex/2026-03-07-v0.2.5", lastCommit: 20 },
      { name: "feature/review", lastCommit: 30 },
    ],
    commits: [
      { sha: "a111111", summary: "fix: dropdown", author: "alice", timestamp: 1000 },
      { sha: "b222222", summary: "feat: review preset", author: "bob", timestamp: 2000 },
      { sha: "c333333", summary: "chore: cleanup", author: "carol", timestamp: 3000 },
    ],
    isLoadingBranches: false,
    isLoadingCommits: false,
    selectedBranch: "main",
    selectedCommitSha: "a111111",
    selectedCommitTitle: "fix: dropdown",
    customInstructions: "",
    error: null,
    isSubmitting: false,
  };
}

function createProps(step: NonNullable<ReviewPromptState>["step"]) {
  return {
    reviewPrompt: createReviewPrompt(step),
    onClose: vi.fn(),
    onShowPreset: vi.fn(),
    onChoosePreset: vi.fn(),
    highlightedPresetIndex: 0,
    onHighlightPreset: vi.fn(),
    highlightedBranchIndex: 0,
    onHighlightBranch: vi.fn(),
    highlightedCommitIndex: 0,
    onHighlightCommit: vi.fn(),
    onSelectBranch: vi.fn(),
    onSelectBranchAtIndex: vi.fn(),
    onConfirmBranch: vi.fn(async () => {}),
    onSelectCommit: vi.fn(),
    onSelectCommitAtIndex: vi.fn(),
    onConfirmCommit: vi.fn(async () => {}),
    onUpdateCustomInstructions: vi.fn(),
    onConfirmCustom: vi.fn(async () => {}),
  };
}

afterEach(() => {
  cleanup();
});

describe("ReviewInlinePrompt search flows", () => {
  it("filters base branches and keeps selection callback working", () => {
    const props = createProps("baseBranch");
    const { container } = render(<ReviewInlinePrompt {...props} />);
    const input = container.querySelector("input.review-inline-input");
    expect(input).toBeTruthy();

    fireEvent.change(input as HTMLInputElement, {
      target: { value: "codex/" },
    });

    expect(screen.getByRole("option", { name: "codex/2026-03-07-v0.2.5" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "main" })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: "codex/2026-03-07-v0.2.5" }));
    expect(props.onSelectBranch).toHaveBeenCalledWith("codex/2026-03-07-v0.2.5");
  });

  it("filters commits and keeps selection callback working", () => {
    const props = createProps("commit");
    const { container } = render(<ReviewInlinePrompt {...props} />);
    const input = container.querySelector("input.review-inline-input");
    expect(input).toBeTruthy();

    fireEvent.change(input as HTMLInputElement, {
      target: { value: "review preset" },
    });

    expect(screen.getByRole("option", { name: /feat: review preset/i })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /fix: dropdown/i })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /feat: review preset/i }));
    expect(props.onSelectCommit).toHaveBeenCalledWith("b222222", "feat: review preset");
  });

  it("does not change selection on hover, only on click", () => {
    const props = createProps("commit");
    render(<ReviewInlinePrompt {...props} />);

    const hoverTarget = screen.getByRole("option", { name: /feat: review preset/i });
    fireEvent.mouseEnter(hoverTarget);
    expect(props.onSelectCommit).not.toHaveBeenCalled();

    fireEvent.click(hoverTarget);
    expect(props.onSelectCommit).toHaveBeenCalledWith("b222222", "feat: review preset");
  });

  it("restores highlight to selected commit after mouse leave", () => {
    const props = createProps("commit");
    props.highlightedCommitIndex = 1;
    render(<ReviewInlinePrompt {...props} />);

    const listbox = screen.getByRole("listbox", { name: "Commits" });
    fireEvent.mouseLeave(listbox);

    expect(props.onHighlightCommit).toHaveBeenCalledWith(0);
  });

  it("forwards keyboard events to review prompt key handler", () => {
    const props = createProps("preset");
    const onKeyDown = vi.fn((_: { key: string }) => true);
    render(<ReviewInlinePrompt {...props} onKeyDown={onKeyDown} />);

    fireEvent.keyDown(window, { key: "Enter" });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    const firstArg = onKeyDown.mock.calls[0]?.[0] as { key?: string } | undefined;
    expect(firstArg?.key).toBe("Enter");
  });
});
