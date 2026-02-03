// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "sidebar.projects": "Projects",
        "sidebar.addWorkspace": "Add workspace",
        "sidebar.openHome": "Open home",
        "sidebar.toggleSearch": "Toggle search",
        "sidebar.searchProjects": "Search projects",
      };
      return translations[key] ?? key;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

import { Sidebar } from "./Sidebar";

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
  getPinTimestamp: vi.fn(() => null),
  onRenameThread: vi.fn(),
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
};

describe("Sidebar", () => {
  it("toggles the search bar from the header icon", () => {
    vi.useFakeTimers();
    render(<Sidebar {...baseProps} />);

    const toggleButton = screen.getByRole("button", { name: "Toggle search" });
    expect(screen.queryByLabelText("Search projects")).toBeNull();

    act(() => {
      fireEvent.click(toggleButton);
    });
    const input = screen.getByLabelText("Search projects") as HTMLInputElement;
    expect(input).toBeTruthy();

    act(() => {
      fireEvent.change(input, { target: { value: "alpha" } });
      vi.runOnlyPendingTimers();
    });
    expect(input.value).toBe("alpha");

    act(() => {
      fireEvent.click(toggleButton);
      vi.runOnlyPendingTimers();
    });
    expect(screen.queryByLabelText("Search projects")).toBeNull();

    act(() => {
      fireEvent.click(toggleButton);
      vi.runOnlyPendingTimers();
    });
    const reopened = screen.getByLabelText("Search projects") as HTMLInputElement;
    expect(reopened.value).toBe("");
    vi.useRealTimers();
  });
});
