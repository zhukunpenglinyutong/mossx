// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { WorkspaceCard } from "./WorkspaceCard";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "Content Analysis",
  path: "/repo/content-analysis",
  connected: true,
  settings: { sidebarCollapsed: false },
};

afterEach(() => {
  cleanup();
});

describe("WorkspaceCard", () => {
  it("places the exited sessions toggle in the right action area before refresh", () => {
    const { container } = render(
      <WorkspaceCard
        workspace={workspace}
        isActive
        isThreadListDegraded
        isThreadListRefreshing={false}
        hasPrimaryActiveThread={false}
        showExitedSessionsToggle
        hideExitedSessions={false}
        hiddenExitedSessionsCount={0}
        isCollapsed={false}
        onShowWorkspaceMenu={vi.fn()}
        onQuickReloadWorkspaceThreads={vi.fn()}
        onSelectWorkspace={vi.fn()}
        onToggleWorkspaceCollapse={vi.fn()}
        onToggleExitedSessions={vi.fn()}
      />,
    );

    const leadingIcons = container.querySelector(".workspace-leading-icons");
    const actions = container.querySelector(".workspace-actions");
    const exitedToggle = container.querySelector(".workspace-exited-toggle");
    const refreshButton = container.querySelector(".workspace-degraded-badge");

    expect(leadingIcons?.contains(exitedToggle)).toBe(false);
    expect(actions?.contains(exitedToggle)).toBe(true);
    expect(actions?.firstElementChild).toBe(exitedToggle);
    expect(exitedToggle?.nextElementSibling).toBe(refreshButton);
  });
});
