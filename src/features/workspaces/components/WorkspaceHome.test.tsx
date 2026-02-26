// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineDisplayInfo } from "../../engine/hooks/useEngineController";
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
        "workspace.conversationType": "Conversation type",
        "workspace.engineClaudeCode": "Claude Code",
        "workspace.engineCodex": "Codex",
        "workspace.engineGemini": "Gemini",
        "workspace.engineOpenCode": "OpenCode",
        "workspace.engineComingSoon": "Coming soon",
        "sidebar.cliNotInstalled": "Not Installed",
        "workspace.startConversation": "Start conversation",
        "workspace.startingConversation": "Starting...",
        "workspace.continueLatestConversation": "Continue latest conversation",
        "workspace.guidedStart": "Guided start",
        "workspace.guidedStartHint": "Hint",
        "workspace.guideProjectSpecTitle": "Open Spec Hub",
        "workspace.guideProjectSpecDescription": "desc",
        "workspace.specProviderOpenSpecAction": "Open OpenSpec module",
        "workspace.specProviderSpecKitTitle": "Spec-kit compatibility module",
        "workspace.specProviderSpecKitDescription": "spec-kit desc",
        "workspace.specProviderSpecKitAction": "Use Spec-kit layout",
        "workspace.generalGuidesTitle": "General guided actions",
        "workspace.generalGuidesHint": "General hint",
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

vi.mock("../../engine/components/EngineIcon", () => ({
  EngineIcon: () => <span data-testid="engine-icon" />,
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

const engines: EngineDisplayInfo[] = [
  {
    type: "claude",
    displayName: "Claude Code",
    shortName: "Claude Code",
    installed: true,
    version: "1.0.0",
    error: null,
  },
  {
    type: "codex",
    displayName: "Codex CLI",
    shortName: "Codex",
    installed: true,
    version: "1.0.0",
    error: null,
  },
  {
    type: "opencode",
    displayName: "OpenCode",
    shortName: "OpenCode",
    installed: true,
    version: "1.0.0",
    error: null,
  },
];

function renderWorkspaceHome(overrides?: Partial<ComponentProps<typeof WorkspaceHome>>) {
  const props: ComponentProps<typeof WorkspaceHome> = {
    workspace,
    engines,
    currentBranch: "main",
    recentThreads: threads,
    onSelectConversation: vi.fn(),
    onStartConversation: vi.fn().mockResolvedValue(undefined),
    onContinueLatestConversation: vi.fn(),
    onStartGuidedConversation: vi.fn().mockResolvedValue(undefined),
    onOpenSpecHub: vi.fn(),
    onRevealWorkspace: vi.fn().mockResolvedValue(undefined),
    onDeleteConversations: vi.fn().mockResolvedValue({
      succeededThreadIds: [],
      failed: [],
    }),
    ...overrides,
  };
  render(<WorkspaceHome {...props} />);
  return props;
}

describe("WorkspaceHome", () => {
  it("renders hero, guide, and recent sections with reachable primary CTAs", () => {
    renderWorkspaceHome();

    expect(screen.getByRole("heading", { name: "hnms-openspec" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Guided start" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent conversations" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start conversation" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue latest conversation" })).toBeTruthy();
  });

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

  it("announces manage-mode state and exposes pressed state for selected threads", () => {
    renderWorkspaceHome();

    fireEvent.click(screen.getAllByRole("button", { name: "Manage conversations" })[0]);
    const selectedCounter = screen.getByText("0 selected");
    expect(selectedCounter.getAttribute("aria-live")).toBe("polite");

    fireEvent.click(screen.getAllByText("Thread A")[0]);
    const selectedThread = screen.getByRole("button", { name: "Thread A. Idle" });
    expect(selectedThread.getAttribute("aria-pressed")).toBe("true");
  });

  it("deletes selected conversations only on second confirmation click", async () => {
    const onDeleteConversations = vi.fn().mockResolvedValue({
      succeededThreadIds: ["thread-1"],
      failed: [],
    });
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
    const onDeleteConversations = vi.fn().mockResolvedValue({
      succeededThreadIds: [],
      failed: [],
    });
    renderWorkspaceHome({ onDeleteConversations });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage conversations" })[0]);
    fireEvent.click(screen.getByText("Thread A"));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel delete" }));

    expect(onDeleteConversations).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeTruthy();
  });

  it("keeps failed threads selected after partial delete", async () => {
    const onDeleteConversations = vi.fn().mockResolvedValue({
      succeededThreadIds: ["thread-1"],
      failed: [
        {
          threadId: "thread-2",
          code: "WORKSPACE_NOT_CONNECTED",
          message: "workspace not connected",
        },
      ],
    });
    renderWorkspaceHome({ onDeleteConversations });

    fireEvent.click(screen.getAllByRole("button", { name: "Manage conversations" })[0]);
    fireEvent.click(screen.getByText("Thread A"));
    fireEvent.click(screen.getByText("Thread B"));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete 2" }));

    await waitFor(() => {
      expect(onDeleteConversations).toHaveBeenCalledWith(["thread-1", "thread-2"]);
    });
    await waitFor(() => {
      expect(screen.getByText("1 selected")).toBeTruthy();
    });
  });

  it("falls back to opencode when it is the only installed engine", async () => {
    const onStartConversation = vi.fn().mockResolvedValue(undefined);
    renderWorkspaceHome({
      onStartConversation,
      engines: [
        {
          type: "claude",
          displayName: "Claude Code",
          shortName: "Claude Code",
          installed: false,
          version: null,
          error: "missing",
        },
        {
          type: "codex",
          displayName: "Codex CLI",
          shortName: "Codex",
          installed: false,
          version: null,
          error: "missing",
        },
        {
          type: "opencode",
          displayName: "OpenCode",
          shortName: "OpenCode",
          installed: true,
          version: "1.0.0",
          error: null,
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Start conversation" }));

    await waitFor(() => {
      expect(onStartConversation).toHaveBeenCalledWith("opencode");
    });
  });

  it("continues the latest conversation from hero CTA", () => {
    const onContinueLatestConversation = vi.fn();
    renderWorkspaceHome({ onContinueLatestConversation });

    fireEvent.click(screen.getByRole("button", { name: "Continue latest conversation" }));

    expect(onContinueLatestConversation).toHaveBeenCalledTimes(1);
  });

  it("opens spec hub when clicking Open Spec Hub guide", () => {
    const onOpenSpecHub = vi.fn();
    const onStartGuidedConversation = vi.fn().mockResolvedValue(undefined);
    renderWorkspaceHome({ onOpenSpecHub, onStartGuidedConversation });

    fireEvent.click(screen.getByRole("button", { name: /Open Spec Hub/i }));

    expect(onOpenSpecHub).toHaveBeenCalledTimes(1);
    expect(onStartGuidedConversation).not.toHaveBeenCalled();
  });

  it("keeps Open Spec Hub guide enabled even when no engine is selectable", () => {
    const onOpenSpecHub = vi.fn();
    renderWorkspaceHome({
      onOpenSpecHub,
      engines: [
        {
          type: "claude",
          displayName: "Claude Code",
          shortName: "Claude Code",
          installed: false,
          version: null,
          error: "missing",
        },
      ],
    });

    const openSpecHubButton = screen.getByRole("button", { name: /Open Spec Hub/i });
    expect((openSpecHubButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(openSpecHubButton);
    expect(onOpenSpecHub).toHaveBeenCalledTimes(1);
  });
});
