// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem, TurnPlan } from "../../../../types";
import { EditToolGroupBlock } from "./EditToolGroupBlock";

function createEditToolItem(id: string): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id,
    kind: "tool",
    toolType: "edit",
    title: "Edit file",
    detail: JSON.stringify({
      file_path: "src/App.tsx",
      old_string: "old",
      new_string: "new",
    }),
    status: "completed",
  };
}

describe("EditToolGroupBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens plan popover with explanation and steps", () => {
    const plan: TurnPlan = {
      turnId: "turn-1",
      explanation: "Plan summary",
      steps: [
        { step: "Step A", status: "inProgress" },
        { step: "Step B", status: "completed" },
      ],
    };
    const onOpenFullPlan = vi.fn();

    render(
      <EditToolGroupBlock
        items={[createEditToolItem("tool-1")]}
        plan={plan}
        isPlanMode
        onOpenFullPlan={onOpenFullPlan}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Plan" }));
    expect(screen.getByRole("dialog", { name: "Plan" })).toBeTruthy();
    expect(screen.getByText("Plan summary")).toBeTruthy();
    expect(screen.getByText("Step A")).toBeTruthy();
    expect(screen.getByText("Step B")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open full Plan panel" }));
    expect(onOpenFullPlan).toHaveBeenCalledTimes(1);
  });

  it("shows consistent empty state when no plan exists", () => {
    render(
      <EditToolGroupBlock
        items={[createEditToolItem("tool-2")]}
        plan={null}
        isPlanMode={false}
        isProcessing={false}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Plan" })[0]);
    expect(screen.getByText("No plan generated. Send a message to start.")).toBeTruthy();
  });

  it("opens git diff when clicking edited file name", () => {
    const onOpenDiffPath = vi.fn();
    render(
      <EditToolGroupBlock
        items={[createEditToolItem("tool-3")]}
        onOpenDiffPath={onOpenDiffPath}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "App.tsx" }));
    expect(onOpenDiffPath).toHaveBeenCalledWith("src/App.tsx");
  });
});
