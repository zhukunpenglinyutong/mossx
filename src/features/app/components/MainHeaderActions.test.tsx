// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainHeaderActions } from "./MainHeaderActions";

function getLatestTooltipText() {
  const tooltips = screen.getAllByRole("tooltip");
  return tooltips[tooltips.length - 1]?.textContent ?? "";
}

describe("MainHeaderActions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders SOLO toggle and dispatches explicit enter action", () => {
    const onToggleSoloMode = vi.fn();

    render(
      <MainHeaderActions
        isCompact={false}
        rightPanelCollapsed={false}
        sidebarToggleProps={{
          isCompact: false,
          sidebarCollapsed: false,
          rightPanelCollapsed: false,
          rightPanelAvailable: true,
          onCollapseSidebar: vi.fn(),
          onExpandSidebar: vi.fn(),
          onCollapseRightPanel: vi.fn(),
          onExpandRightPanel: vi.fn(),
        }}
        showSoloButton
        onToggleSoloMode={onToggleSoloMode}
      />,
    );

    const button = screen.getByRole("button", { name: "sidebar.enterSoloMode" });
    expect(button.getAttribute("data-tauri-drag-region")).toBe("false");

    fireEvent.click(button);
    expect(onToggleSoloMode).toHaveBeenCalledTimes(1);
  });

  it("renders client documentation action and dispatches open action", () => {
    const onOpenClientDocumentation = vi.fn();

    render(
      <MainHeaderActions
        isCompact={false}
        rightPanelCollapsed={false}
        sidebarToggleProps={{
          isCompact: false,
          sidebarCollapsed: false,
          rightPanelCollapsed: false,
          rightPanelAvailable: false,
          onCollapseSidebar: vi.fn(),
          onExpandSidebar: vi.fn(),
          onCollapseRightPanel: vi.fn(),
          onExpandRightPanel: vi.fn(),
        }}
        showClientDocumentationButton
        onOpenClientDocumentation={onOpenClientDocumentation}
      />,
    );

    const button = screen.getByRole("button", { name: "clientDocumentation.open" });
    expect(button.getAttribute("data-tauri-drag-region")).toBe("false");

    fireEvent.click(button);
    expect(onOpenClientDocumentation).toHaveBeenCalledTimes(1);
  });

  it("shows tooltips for icon-only header actions on hover", async () => {
    render(
      <MainHeaderActions
        isCompact={false}
        rightPanelCollapsed={false}
        sidebarToggleProps={{
          isCompact: false,
          sidebarCollapsed: false,
          rightPanelCollapsed: false,
          rightPanelAvailable: true,
          onCollapseSidebar: vi.fn(),
          onExpandSidebar: vi.fn(),
          onCollapseRightPanel: vi.fn(),
          onExpandRightPanel: vi.fn(),
        }}
        showRuntimeConsoleButton
        onToggleRuntimeConsole={vi.fn()}
        showTerminalButton
        onToggleTerminal={vi.fn()}
        showSoloButton
        onToggleSoloMode={vi.fn()}
      />,
    );

    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole("button", { name: "files.openRunConsole" }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(getLatestTooltipText()).toContain("files.openRunConsole");

    await act(async () => {
      fireEvent.mouseLeave(screen.getByRole("button", { name: "files.openRunConsole" }));
      fireEvent.mouseEnter(screen.getByRole("button", { name: "common.toggleTerminalPanel" }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(getLatestTooltipText()).toContain("common.toggleTerminalPanel");

    await act(async () => {
      fireEvent.mouseLeave(screen.getByRole("button", { name: "common.toggleTerminalPanel" }));
      fireEvent.mouseEnter(screen.getByRole("button", { name: "sidebar.enterSoloMode" }));
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(getLatestTooltipText()).toContain("sidebar.enterSoloMode");
  });
});
