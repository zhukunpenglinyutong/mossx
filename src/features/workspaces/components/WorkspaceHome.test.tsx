// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceHome, type WorkspaceHomeThreadSummary } from "./WorkspaceHome";

afterEach(() => {
  cleanup();
});

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, number | string>) => {
      const translations: Record<string, string> = {
        "workspace.branch": "Branch",
        "workspace.workspaceType": "Workspace type",
        "workspace.workspaceTypeMain": "Main workspace",
        "workspace.workspaceTypeWorktree": "Worktree",
        "workspace.copyPath": "Copy path",
        "workspace.pathCopied": "Path copied",
        "workspace.openProjectFolder": "Open folder",
        "workspace.startConversation": "Start conversation",
        "workspace.startingConversation": "Starting...",
        "workspace.continueLatestConversation": "Continue latest conversation",
        "workspace.guidedStart": "Guided start",
        "workspace.guidedStartHint": "Hint",
        "workspace.guideProjectSpecTitle": "Read specs",
        "workspace.guideProjectSpecDescription": "desc",
        "workspace.guideProjectSpecPrompt": "prompt",
        "workspace.guideCodebaseScanTitle": "Scan code",
        "workspace.guideCodebaseScanDescription": "desc",
        "workspace.guideCodebaseScanPrompt": "prompt",
        "workspace.guideImplementationPlanTitle": "Plan",
        "workspace.guideImplementationPlanDescription": "desc",
        "workspace.guideImplementationPlanPrompt": "prompt",
        "workspace.guideRequirementsTitle": "Requirements",
        "workspace.guideRequirementsDescription": "desc",
        "workspace.guideRequirementsPrompt": "prompt",
        "workspace.guideReviewTitle": "Review",
        "workspace.guideReviewDescription": "desc",
        "workspace.guideReviewPrompt": "prompt",
        "workspace.guideDebugTitle": "Debug",
        "workspace.guideDebugDescription": "desc",
        "workspace.guideDebugPrompt": "prompt",
        "workspace.recentConversations": "Recent conversations",
        "workspace.recentConversationsHint": "Continue from recent context",
        "workspace.noRecentConversations": "No recent conversations",
        "workspace.manageRecentConversations": "Manage conversations",
        "workspace.selectedConversations": `${params?.count ?? 0} selected`,
        "workspace.selectAllConversations": "Select all",
        "workspace.clearConversationSelection": "Clear selection",
        "workspace.deleteSelectedConversations": "Delete selected",
        "workspace.confirmDeleteSelectedConversations": `Confirm delete ${params?.count ?? 0}`,
        "workspace.cancelDeleteSelectedConversations": "Cancel delete",
        "workspace.deletingConversations": "Deleting...",
        "workspace.cancelConversationManagement": "Cancel",
        "workspace.threadProcessing": "Processing",
        "workspace.threadReviewing": "Reviewing",
        "workspace.threadIdle": "Idle",
      };
      return translations[key] || key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const workspace = {
  id: "ws-1",
  name: "hnms-openspec",
  path: "/tmp/hnms-openspec",
  connected: true,
  kind: "main" as const,
  settings: { sidebarCollapsed: false },
};

const threads: WorkspaceHomeThreadSummary[] = [
  {
    id: "thread-1",
    workspaceId: "ws-1",
    threadId: "thread-1",
    title: "Thread A",
    updatedAt: Date.now() - 10_000,
    isProcessing: false,
    isReviewing: false,
  },
  {
    id: "thread-2",
    workspaceId: "ws-1",
    threadId: "thread-2",
    title: "Thread B",
    updatedAt: Date.now() - 20_000,
    isProcessing: true,
    isReviewing: false,
  },
];

function renderWorkspaceHome(overrides?: Partial<ComponentProps<typeof WorkspaceHome>>) {
  const props: ComponentProps<typeof WorkspaceHome> = {
    workspace,
    currentBranch: "main",
    recentThreads: threads,
    onSelectConversation: vi.fn(),
    onStartConversation: vi.fn().mockResolvedValue(undefined),
    onContinueLatestConversation: vi.fn(),
    onStartGuidedConversation: vi.fn().mockResolvedValue(undefined),
    onRevealWorkspace: vi.fn().mockResolvedValue(undefined),
    onDeleteConversations: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<WorkspaceHome {...props} />);
  return props;
}

describe("WorkspaceHome", () => {
  it("opens conversation on click in default mode", () => {
    const onSelectConversation = vi.fn();
    renderWorkspaceHome({ onSelectConversation });

    fireEvent.click(screen.getAllByText("Thread A")[0]);

    expect(onSelectConversation).toHaveBeenCalledWith("ws-1", "thread-1");
  });

  it("selects thread instead of opening when in manage mode", () => {
    const onSelectConversation = vi.fn();
    renderWorkspaceHome({ onSelectConversation });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage conversations" })[0]);
    fireEvent.click(screen.getAllByText("Thread A")[0]);

    expect(onSelectConversation).not.toHaveBeenCalled();
    expect(screen.getByText("1 selected")).toBeTruthy();
  });

  it("deletes selected conversations only on second confirmation click", async () => {
    const onDeleteConversations = vi.fn().mockResolvedValue(undefined);
    renderWorkspaceHome({ onDeleteConversations });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage conversations" })[0]);
    fireEvent.click(screen.getByText("Thread A"));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(onDeleteConversations).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete 1" }));

    await waitFor(() => {
      expect(onDeleteConversations).toHaveBeenCalledWith(["thread-1"]);
    });
  });

  it("cancels armed delete state without deleting", () => {
    const onDeleteConversations = vi.fn().mockResolvedValue(undefined);
    renderWorkspaceHome({ onDeleteConversations });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage conversations" })[0]);
    fireEvent.click(screen.getByText("Thread A"));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel delete" }));

    expect(onDeleteConversations).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeTruthy();
  });
});
