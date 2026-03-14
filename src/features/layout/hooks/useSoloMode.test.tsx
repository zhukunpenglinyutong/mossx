// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSoloMode } from "./useSoloMode";

describe("useSoloMode", () => {
  it("captures layout state on enter and restores it on exit", () => {
    const setActiveTab = vi.fn();
    const setCenterMode = vi.fn();
    const setFilePanelMode = vi.fn();
    const collapseSidebar = vi.fn();
    const expandSidebar = vi.fn();
    const collapseRightPanel = vi.fn();
    const expandRightPanel = vi.fn();

    const { result } = renderHook(() =>
      useSoloMode({
        enabled: true,
        activeTab: "git",
        centerMode: "editor",
        filePanelMode: "files",
        sidebarCollapsed: false,
        rightPanelCollapsed: true,
        setActiveTab,
        setCenterMode,
        setFilePanelMode,
        collapseSidebar,
        expandSidebar,
        collapseRightPanel,
        expandRightPanel,
      }),
    );

    act(() => {
      result.current.toggleSoloMode();
    });

    expect(result.current.isSoloMode).toBe(true);
    expect(setActiveTab).toHaveBeenCalledWith("codex");
    expect(setCenterMode).toHaveBeenCalledWith("chat");
    expect(setFilePanelMode).toHaveBeenCalledWith("activity");
    expect(collapseSidebar).toHaveBeenCalledTimes(1);
    expect(expandRightPanel).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.toggleSoloMode();
    });

    expect(result.current.isSoloMode).toBe(false);
    expect(setActiveTab).toHaveBeenCalledWith("git");
    expect(setCenterMode).toHaveBeenCalledWith("editor");
    expect(setFilePanelMode).toHaveBeenCalledWith("files");
    expect(expandSidebar).toHaveBeenCalledTimes(1);
    expect(collapseRightPanel).toHaveBeenCalledTimes(1);
  });
});
