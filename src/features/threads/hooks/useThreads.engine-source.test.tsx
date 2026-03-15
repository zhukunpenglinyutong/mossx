// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import type { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import { useThreads } from "./useThreads";

type AppServerHandlers = Parameters<typeof useAppServerEvents>[0];

let handlers: AppServerHandlers | null = null;

vi.mock("../../app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (incoming: AppServerHandlers) => {
    handlers = incoming;
  },
}));

vi.mock("./useThreadMessaging", () => ({
  useThreadMessaging: () => ({
    interruptTurn: vi.fn(),
    sendUserMessage: vi.fn(),
    sendUserMessageToThread: vi.fn(),
    startFork: vi.fn(),
    startReview: vi.fn(),
    startResume: vi.fn(),
    startMcp: vi.fn(),
    startSpecRoot: vi.fn(),
    startStatus: vi.fn(),
    startFast: vi.fn(),
    startMode: vi.fn(),
    startExport: vi.fn(),
    startImport: vi.fn(),
    startLsp: vi.fn(),
    startShare: vi.fn(),
    reviewPrompt: null,
    openReviewPrompt: vi.fn(),
    closeReviewPrompt: vi.fn(),
    showPresetStep: false,
    choosePreset: vi.fn(),
    highlightedPresetIndex: -1,
    setHighlightedPresetIndex: vi.fn(),
    highlightedBranchIndex: -1,
    setHighlightedBranchIndex: vi.fn(),
    highlightedCommitIndex: -1,
    setHighlightedCommitIndex: vi.fn(),
    handleReviewPromptKeyDown: vi.fn(),
    confirmBranch: vi.fn(),
    selectBranch: vi.fn(),
    selectBranchAtIndex: vi.fn(),
    selectCommit: vi.fn(),
    selectCommitAtIndex: vi.fn(),
    confirmCommit: vi.fn(),
    updateCustomInstructions: vi.fn(),
    confirmCustom: vi.fn(),
  }),
}));

vi.mock("../../../services/tauri", () => ({
  respondToServerRequest: vi.fn(),
  respondToUserInputRequest: vi.fn(),
  listThreadTitles: vi.fn(),
  setThreadTitle: vi.fn(),
  renameThreadTitleKey: vi.fn(),
  generateThreadTitle: vi.fn(),
  rememberApprovalRule: vi.fn(),
  sendUserMessage: vi.fn(),
  startReview: vi.fn(),
  startThread: vi.fn(),
  listThreads: vi.fn(),
  resumeThread: vi.fn(),
  archiveThread: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAccountInfo: vi.fn(),
  interruptTurn: vi.fn(),
  projectMemoryUpdate: vi.fn(),
  projectMemoryCreate: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "CodeMoss",
  path: "/tmp/codemoss",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useThreads engine source", () => {
  beforeEach(() => {
    handlers = null;
    vi.clearAllMocks();
  });

  it("keeps thread engine source when selecting an unloaded thread", async () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        activeEngine: "codex",
        onWorkspaceConnected: vi.fn(),
      }),
    );

    expect(handlers).not.toBeNull();

    act(() => {
      handlers?.onThreadStarted?.("ws-1", {
        id: "claude:session-1",
        preview: "Claude thread",
        updatedAt: 1_700_000_000_000,
      });
    });

    expect(
      result.current.threadsByWorkspace["ws-1"]?.find(
        (thread) => thread.id === "claude:session-1",
      )?.engineSource,
    ).toBe("claude");

    act(() => {
      result.current.setActiveThreadId("claude:session-1");
    });

    await waitFor(() => {
      expect(result.current.activeThreadId).toBe("claude:session-1");
    });

    expect(
      result.current.threadsByWorkspace["ws-1"]?.find(
        (thread) => thread.id === "claude:session-1",
      )?.engineSource,
    ).toBe("claude");
  });
});
