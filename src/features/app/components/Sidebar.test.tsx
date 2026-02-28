// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { afterEach } from "vitest";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "sidebar.addWorkspace": "Add workspace",
        "sidebar.toggleSearch": "Toggle search",
        "sidebar.searchProjects": "Search projects",
        "sidebar.quickNewThread": "New Thread",
        "sidebar.quickAutomation": "Automation",
        "sidebar.quickSkills": "Skills",
        "sidebar.projects": "Projects",
        "sidebar.mcpSkillsMarket": "MCP & Skills Market",
        "sidebar.longTermMemory": "Long-term Memory",
        "sidebar.pluginMarket": "Plugin Market",
        "sidebar.specHub": "Spec Hub",
        "sidebar.openHome": "Open home",
        "panels.memory": "Project Memory",
        "common.terminal": "Terminal",
        "common.toggleTerminalPanel": "Toggle terminal panel",
        "git.logMode": "Git",
        "sidebar.comingSoon": "Coming soon",
        "sidebar.comingSoonMessage": "This feature is coming soon",
        "sidebar.threadsSection": "Threads",
        "settings.title": "Settings",
        "tabbar.primaryNavigation": "Primary navigation",
      };
      return translations[key] ?? key;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

const { pushErrorToastMock } = vi.hoisted(() => ({
  pushErrorToastMock: vi.fn(),
}));
vi.mock("../../../services/toasts", () => ({
  pushErrorToast: pushErrorToastMock,
}));

import { Sidebar } from "./Sidebar";

afterEach(() => {
  cleanup();
});

const baseProps = {
  workspaces: [],
  groupedWorkspaces: [],
  hasWorkspaceGroups: false,
  deletingWorktreeIds: new Set<string>(),
  threadsByWorkspace: {},
  threadParentById: {},
  threadStatusById: {},
  threadListLoadingByWorkspace: {},
  threadListPagingByWorkspace: {},
  threadListCursorByWorkspace: {},
  activeWorkspaceId: null,
  activeThreadId: null,
  accountRateLimits: null,
  usageShowRemaining: false,
  accountInfo: null,
  onSwitchAccount: vi.fn(),
  onCancelSwitchAccount: vi.fn(),
  accountSwitching: false,
  onOpenSettings: vi.fn(),
  onOpenDebug: vi.fn(),
  showDebugButton: false,
  onAddWorkspace: vi.fn(),
  onSelectHome: vi.fn(),
  onSelectWorkspace: vi.fn(),
  onConnectWorkspace: vi.fn(),
  onAddAgent: vi.fn(),
  onAddWorktreeAgent: vi.fn(),
  onAddCloneAgent: vi.fn(),
  onToggleWorkspaceCollapse: vi.fn(),
  onSelectThread: vi.fn(),
  onDeleteThread: vi.fn(),
  onSyncThread: vi.fn(),
  pinThread: vi.fn(() => false),
  unpinThread: vi.fn(),
  isThreadPinned: vi.fn(() => false),
  isThreadAutoNaming: vi.fn(() => false),
  getPinTimestamp: vi.fn(() => null),
  pinnedThreadsVersion: 0,
  onRenameThread: vi.fn(),
  onAutoNameThread: vi.fn(),
  onDeleteWorkspace: vi.fn(),
  onDeleteWorktree: vi.fn(),
  onLoadOlderThreads: vi.fn(),
  onReloadWorkspaceThreads: vi.fn(),
  workspaceDropTargetRef: createRef<HTMLElement>(),
  isWorkspaceDropActive: false,
  workspaceDropText: "Drop Project Here",
  onWorkspaceDragOver: vi.fn(),
  onWorkspaceDragEnter: vi.fn(),
  onWorkspaceDragLeave: vi.fn(),
  onWorkspaceDrop: vi.fn(),
  appMode: "chat" as const,
  onAppModeChange: vi.fn(),
  onOpenMemory: vi.fn(),
  onOpenProjectMemory: vi.fn(),
  onOpenSpecHub: vi.fn(),
  onOpenWorkspaceHome: vi.fn(),
};

describe("Sidebar", () => {
  it("keeps search input hidden when search toggle is not present", () => {
    render(<Sidebar {...baseProps} />);

    expect(screen.queryByRole("button", { name: "Toggle search" })).toBeNull();
    expect(screen.queryByLabelText("Search projects")).toBeNull();
  });

  it("renders quick skills entry", () => {
    render(<Sidebar {...baseProps} />);
    expect(screen.getByRole("button", { name: "Skills" })).toBeTruthy();
  });

  it("shows coming soon toast when clicking the skills entry", () => {
    const onOpenSpecHub = vi.fn();
    pushErrorToastMock.mockClear();
    render(<Sidebar {...baseProps} onOpenSpecHub={onOpenSpecHub} />);
    fireEvent.click(screen.getByRole("button", { name: "Skills" }));

    expect(pushErrorToastMock).toHaveBeenCalledTimes(1);
    expect(onOpenSpecHub).not.toHaveBeenCalled();
  });

  it("opens workspace home when no workspace is active", () => {
    const onOpenWorkspaceHome = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        activeWorkspaceId={null}
        onOpenWorkspaceHome={onOpenWorkspaceHome}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open home" }));

    expect(onOpenWorkspaceHome).toHaveBeenCalledTimes(1);
  });

  it("opens workspace home when workspace is active", () => {
    const onOpenWorkspaceHome = vi.fn();
    render(
      <Sidebar
        {...baseProps}
        activeWorkspaceId="workspace-1"
        onOpenWorkspaceHome={onOpenWorkspaceHome}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open home" }));

    expect(onOpenWorkspaceHome).toHaveBeenCalledTimes(1);
  });

  it("renders quick nav and workspace list containers", () => {
    const { container } = render(<Sidebar {...baseProps} />);

    expect(container.querySelector(".sidebar-primary-nav")).toBeTruthy();
    expect(container.querySelector(".sidebar-quick-icon-strip")).toBeTruthy();
    expect(container.querySelector(".sidebar-content-column")).toBeTruthy();
    expect(container.querySelector(".workspace-list")).toBeTruthy();
  });

  it("shows quick action entries in settings dropdown and triggers home action", () => {
    const onOpenWorkspaceHome = vi.fn();
    const onToggleTerminal = vi.fn();
    const { container } = render(
      <Sidebar
        {...baseProps}
        showTerminalButton
        isTerminalOpen={false}
        onToggleTerminal={onToggleTerminal}
        onOpenWorkspaceHome={onOpenWorkspaceHome}
      />,
    );

    const settingsToggle = container.querySelector(".sidebar-primary-nav-item-bottom");
    expect(settingsToggle).toBeTruthy();
    fireEvent.click(settingsToggle as Element);

    const dropdown = container.querySelector(".sidebar-settings-dropdown");
    expect(dropdown).toBeTruthy();
    const menu = within(dropdown as HTMLElement);

    expect(menu.getByRole("menuitem", { name: "New Thread" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Automation" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Skills" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Long-term Memory" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Spec Hub" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Project Memory" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Terminal" })).toBeTruthy();
    expect(menu.getByRole("menuitem", { name: "Git" })).toBeTruthy();

    fireEvent.click(menu.getByRole("menuitem", { name: "Open home" }));
    expect(onOpenWorkspaceHome).toHaveBeenCalledTimes(1);
  });
});
