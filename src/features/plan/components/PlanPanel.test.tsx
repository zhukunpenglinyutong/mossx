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
});
