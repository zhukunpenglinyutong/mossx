// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainHeaderActions } from "./MainHeaderActions";

describe("MainHeaderActions", () => {
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
});
