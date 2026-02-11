// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import type { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import { projectMemoryCreate } from "../../../services/tauri";
import { useThreads } from "./useThreads";

type AppServerHandlers = Parameters<typeof useAppServerEvents>[0];

let handlers: AppServerHandlers | null = null;
let triggerInputMemoryCaptured:
  | ((payload: {
      workspaceId: string;
      threadId: string;
      turnId: string;
      inputText: string;
      memoryId: string | null;
      workspaceName: string | null;
      workspacePath: string | null;
      engine: string | null;
    }) => void)
  | null = null;

vi.mock("../../app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (incoming: AppServerHandlers) => {
    handlers = incoming;
  },
}));

vi.mock("./useThreadMessaging", () => ({
  useThreadMessaging: (options: { onInputMemoryCaptured?: typeof triggerInputMemoryCaptured }) => {
    triggerInputMemoryCaptured = options.onInputMemoryCaptured ?? null;
    return {
      interruptTurn: vi.fn(),
      sendUserMessage: vi.fn(),
      sendUserMessageToThread: vi.fn(),
      startFork: vi.fn(),
      startReview: vi.fn(),
      startResume: vi.fn(),
      startMcp: vi.fn(),
      startStatus: vi.fn(),
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
    };
  },
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

describe("useThreads memory race integration", () => {
  beforeEach(() => {
    handlers = null;
    triggerInputMemoryCaptured = null;
    vi.clearAllMocks();
    vi.mocked(projectMemoryCreate).mockResolvedValue({
      id: "m-1",
      workspaceId: "ws-1",
      kind: "conversation",
      title: "t",
      summary: "s",
      cleanText: "c",
      tags: [],
      importance: "medium",
      source: "assistant_output_digest",
      fingerprint: "f",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it("merges to conversation when assistant completes before input capture callback", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    expect(handlers).not.toBeNull();
    expect(triggerInputMemoryCaptured).not.toBeNull();

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-race-1",
        itemId: "assistant-item-1",
        text: "这是助手输出。",
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "thread-race-1",
        turnId: "turn-1",
        inputText: "这是用户输入。",
        memoryId: null,
        workspaceName: "CodeMoss",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCreate).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("conversation");
    expect(payload?.threadId).toBe("thread-race-1");
    expect(payload?.messageId).toBe("assistant-item-1");
    expect(payload?.engine).toBe("claude");
  });

  it("merges memory even when capture arrives with pending Claude thread ID after session rename", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    expect(handlers).not.toBeNull();
    expect(triggerInputMemoryCaptured).not.toBeNull();

    act(() => {
      handlers?.onThreadSessionIdUpdated?.("ws-1", "claude-pending-123", "session-abc");
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "claude:session-abc",
        itemId: "assistant-item-2",
        text: "这是已完成输出。",
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "claude-pending-123",
        turnId: "turn-2",
        inputText: "这是晚到的输入采集。",
        memoryId: null,
        workspaceName: "CodeMoss",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCreate).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("conversation");
    expect(payload?.threadId).toBe("claude:session-abc");
    expect(payload?.messageId).toBe("assistant-item-2");
    expect(payload?.engine).toBe("claude");
  });

  it("classifies merged memory as known_issue and dynamic importance", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-race-3",
        itemId: "assistant-item-3",
        text: "The API returned error 500 with stack trace.",
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "thread-race-3",
        turnId: "turn-3",
        inputText: "Please help debug this issue",
        memoryId: null,
        workspaceName: "CodeMoss",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCreate).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("known_issue");
    expect(payload?.importance).toBe("low");
  });

  it("classifies merged memory as code_decision", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-race-4",
        itemId: "assistant-item-4",
        text: "Architecture decision and tradeoff discussion for migration.",
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "thread-race-4",
        turnId: "turn-4",
        inputText: "Let's decide the migration strategy",
        memoryId: null,
        workspaceName: "CodeMoss",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCreate).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("code_decision");
  });

  it("classifies merged memory as project_context", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-race-6",
        itemId: "assistant-item-6",
        text: "Project setup and tech stack for this repository are documented.",
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "thread-race-6",
        turnId: "turn-6",
        inputText: "This workspace uses React and TypeScript",
        memoryId: null,
        workspaceName: "CodeMoss",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCreate).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("project_context");
  });

  it("falls back to conversation when classifier returns note", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-race-7",
        itemId: "assistant-item-7",
        text: "你好呀，很高兴认识你。",
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "thread-race-7",
        turnId: "turn-7",
        inputText: "我们随便聊聊",
        memoryId: null,
        workspaceName: "CodeMoss",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCreate).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("conversation");
  });

  it("still merges when assistant completion arrives after 30s (slow Claude turn)", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    let current = 1_700_000_000_000;
    nowSpy.mockImplementation(() => current);

    try {
      renderHook(() =>
        useThreads({
          activeWorkspace: workspace,
          onWorkspaceConnected: vi.fn(),
        }),
      );

      act(() => {
        triggerInputMemoryCaptured?.({
          workspaceId: "ws-1",
          threadId: "thread-race-5",
          turnId: "turn-5",
          inputText: "Please diagnose this production failure",
          memoryId: null,
          workspaceName: "CodeMoss",
          workspacePath: "/tmp/codemoss",
          engine: "claude",
        });
      });

      current += 45_000;

      act(() => {
        handlers?.onAgentMessageCompleted?.({
          workspaceId: "ws-1",
          threadId: "thread-race-5",
          itemId: "assistant-item-5",
          text: "The service failed with stack trace and error logs.",
        });
      });

      await waitFor(() => {
        expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
      });
    } finally {
      nowSpy.mockRestore();
    }
  });
});
