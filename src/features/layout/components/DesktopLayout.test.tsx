// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { cleanup, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopLayout } from "./DesktopLayout";

function renderDesktopLayout(overrides: Partial<ComponentProps<typeof DesktopLayout>> = {}) {
  return render(
    <DesktopLayout
      sidebarNode={<aside>sidebar</aside>}
      updateToastNode={<div>update-toast</div>}
      approvalToastsNode={<div>approval-toast</div>}
      errorToastsNode={<div>error-toast</div>}
      homeNode={<div>home</div>}
      showHome={false}
      showWorkspace
      showKanban={false}
      showGitHistory={false}
      hideRightPanel={false}
      isSoloMode={false}
      kanbanNode={<div>kanban</div>}
      gitHistoryNode={<div>git-history</div>}
      settingsOpen={false}
      settingsNode={<div>settings</div>}
      topbarLeftNode={<div>topbar-left</div>}
      centerMode="chat"
      editorSplitLayout="vertical"
      isEditorFileMaximized={false}
      messagesNode={<div>messages</div>}
      gitDiffViewerNode={<div>git-diff-viewer</div>}
      fileViewPanelNode={<div>file-viewer</div>}
      rightPanelToolbarNode={<div>right-toolbar</div>}
      gitDiffPanelNode={<div>activity-panel</div>}
      planPanelNode={<div>plan-panel</div>}
      composerNode={<div>composer</div>}
      runtimeConsoleDockNode={<div>runtime-dock</div>}
      terminalDockNode={<div>terminal-dock</div>}
      debugPanelNode={<div>debug-panel</div>}
      hasActivePlan
      onSidebarResizeStart={vi.fn()}
      onRightPanelResizeStart={vi.fn()}
      onPlanPanelResizeStart={vi.fn()}
      onGitHistoryPanelResizeStart={vi.fn()}
      {...overrides}
    />,
  );
}

describe("DesktopLayout", () => {
  it("keeps plan section expanded in normal activity view", () => {
    const { container } = renderDesktopLayout();

    expect(container.textContent ?? "").toContain("activity-panel");
    expect(container.textContent ?? "").toContain("plan-panel");

    const rightPanel = container.querySelector(".right-panel");
    expect(rightPanel?.className).not.toContain("plan-collapsed");
    expect(rightPanel?.className).not.toContain("is-solo");
  });

  it("collapses the plan section and marks the right panel in SOLO mode", () => {
    cleanup();
    const { container } = renderDesktopLayout({ isSoloMode: true });

    expect(container.textContent ?? "").toContain("activity-panel");
    expect(container.textContent ?? "").toContain("plan-panel");

    const rightPanel = container.querySelector(".right-panel");
    expect(rightPanel?.className).toContain("plan-collapsed");
    expect(rightPanel?.className).toContain("is-solo");
  });
});
