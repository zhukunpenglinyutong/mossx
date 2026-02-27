// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanPanel } from "./PlanPanel";

describe("PlanPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows mode guidance when not in plan mode", () => {
    render(<PlanPanel plan={null} isProcessing={false} isPlanMode={false} />);

    expect(screen.getByText("Switch to Plan mode to view plan")).toBeTruthy();
  });

  it("shows waiting label while processing in plan mode", () => {
    render(<PlanPanel plan={null} isProcessing isPlanMode />);

    expect(screen.getByText("Generating plan...")).toBeTruthy();
  });

  it("shows idle empty label in plan mode", () => {
    render(<PlanPanel plan={null} isProcessing={false} isPlanMode />);

    expect(screen.getByText("No plan")).toBeTruthy();
  });

  it("shows codex idle label in code mode and supports close action", () => {
    const onClose = vi.fn();
    render(
      <PlanPanel
        plan={null}
        isProcessing={false}
        isPlanMode={false}
        isCodexEngine
        onClose={onClose}
      />,
    );

    expect(screen.getByText("No plan")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "tools.closePlanPanel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders long plans without dropping steps and keeps list container", () => {
    const steps = Array.from({ length: 40 }, (_, index) => ({
      step: `Long step ${index + 1}`,
      status: index % 3 === 0 ? "completed" : index % 3 === 1 ? "inProgress" : "pending",
    })) as Array<{ step: string; status: "pending" | "inProgress" | "completed" }>;

    const { container } = render(
      <PlanPanel
        plan={{
          turnId: "turn-long",
          explanation: "Long plan",
          steps,
        }}
        isProcessing={false}
        isPlanMode
      />,
    );

    const list = container.querySelector(".plan-list");
    expect(list).toBeTruthy();
    expect(screen.getByText("Long step 1")).toBeTruthy();
    expect(screen.getByText("Long step 40")).toBeTruthy();
    expect(container.querySelectorAll(".plan-step").length).toBe(40);
  });
});
