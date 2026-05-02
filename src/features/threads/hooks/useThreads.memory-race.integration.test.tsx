// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import type { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import {
  loadClaudeSession,
  listClaudeSessions,
  listThreads,
  projectMemoryCreate,
  resumeThread,
  sendConversationCompletionEmail,
} from "../../../services/tauri";
import { useThreads } from "./useThreads";

type AppServerHandlers = Parameters<typeof useAppServerEvents>[0];
type ThreadMessagingMockOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  dispatch: (action: {
    type: "upsertItem";
    workspaceId: string;
    threadId: string;
    item: {
      id: string;
      kind: "message";
      role: "user";
      text: string;
      images?: string[];
    };
    hasCustomName: boolean;
  }) => void;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  onInputMemoryCaptured?: typeof triggerInputMemoryCaptured;
};

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
let optimisticUserSequence = 0;

function emitOptimisticUserBubble(
  options: Pick<ThreadMessagingMockOptions, "dispatch" | "getCustomName">,
  workspace: WorkspaceInfo,
  threadId: string,
  text: string,
  images: string[] = [],
) {
  optimisticUserSequence += 1;
  options.dispatch({
    type: "upsertItem",
    workspaceId: workspace.id,
    threadId,
    item: {
      id: `optimistic-user-test-${optimisticUserSequence}`,
      kind: "message",
      role: "user",
      text,
      ...(images.length > 0 ? { images } : {}),
    },
    hasCustomName: Boolean(options.getCustomName(workspace.id, threadId)),
  });
}

vi.mock("../../app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (incoming: AppServerHandlers) => {
    handlers = incoming;
  },
}));

vi.mock("./useThreadMessaging", () => ({
  useThreadMessaging: (options: ThreadMessagingMockOptions) => {
    triggerInputMemoryCaptured = options.onInputMemoryCaptured ?? null;
    const sendUserMessage = vi.fn(async (text: string, images: string[] = []) => {
      if (!options.activeWorkspace || !options.activeThreadId) {
        return;
      }
      emitOptimisticUserBubble(
        options,
        options.activeWorkspace,
        options.activeThreadId,
        text,
        images,
      );
    });
    const sendUserMessageToThread = vi.fn(
      async (
        workspace: WorkspaceInfo,
        threadId: string,
        text: string,
        images: string[] = [],
      ) => {
        emitOptimisticUserBubble(options, workspace, threadId, text, images);
      },
    );
    return {
      interruptTurn: vi.fn(),
      sendUserMessage,
      sendUserMessageToThread,
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
  connectWorkspace: vi.fn().mockResolvedValue(undefined),
  listThreadTitles: vi.fn(),
  setThreadTitle: vi.fn(),
  renameThreadTitleKey: vi.fn(),
  generateThreadTitle: vi.fn(),
  rememberApprovalRule: vi.fn(),
  sendUserMessage: vi.fn(),
  startReview: vi.fn(),
  startThread: vi.fn(),
  listThreads: vi.fn(),
  listClaudeSessions: vi.fn(),
  resumeThread: vi.fn(),
  loadClaudeSession: vi.fn(),
  archiveThread: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAccountInfo: vi.fn(),
  interruptTurn: vi.fn(),
  projectMemoryUpdate: vi.fn(),
  projectMemoryCreate: vi.fn(),
  sendConversationCompletionEmail: vi.fn(),
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "ccgui",
  path: "/tmp/codemoss",
  connected: true,
  settings: { sidebarCollapsed: false },
};

describe("useThreads memory race integration", () => {
  beforeEach(() => {
    handlers = null;
    triggerInputMemoryCaptured = null;
    optimisticUserSequence = 0;
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
    vi.mocked(loadClaudeSession).mockResolvedValue({ messages: [] });
    vi.mocked(sendConversationCompletionEmail).mockResolvedValue({
      provider: "custom",
      acceptedRecipients: ["dev@example.com"],
      durationMs: 12,
    });
    vi.mocked(listThreads).mockResolvedValue({
      result: { data: [], nextCursor: null },
    });
    vi.mocked(listClaudeSessions).mockResolvedValue([]);
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
        workspaceName: "ccgui",
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
        workspaceName: "ccgui",
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
        workspaceName: "ccgui",
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
        workspaceName: "ccgui",
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
        workspaceName: "ccgui",
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
        workspaceName: "ccgui",
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

  it("dedupes repeated assistant output and avoids redundant summary/output blocks", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    const duplicatedOutput = [
      "好的，更新记录：",
      "",
      "**2026年2月23日中午**，与妻子张冰冰一起从老家灯塔回沈阳，开车未走高速。好的，更新记录：",
      "",
      "**2026年2月23日中午**，与妻子张冰冰一起从老家灯塔回沈阳，开车未走高速。",
    ].join("\n");

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-race-8",
        itemId: "assistant-item-8",
        text: duplicatedOutput,
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "thread-race-8",
        turnId: "turn-8",
        inputText: "是和我老婆张冰冰一起回来的.我们开车没走高速",
        memoryId: null,
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCreate)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCreate).mock.calls[0] ?? [];
    const summary = payload?.summary ?? "";
    const detail = payload?.detail ?? "";
    expect((summary.match(/好的，更新记录/g) ?? []).length).toBeLessThanOrEqual(1);
    expect((summary.match(/2026年2月23日中午/g) ?? []).length).toBe(1);
    expect((detail.match(/2026年2月23日中午/g) ?? []).length).toBe(1);
    expect(detail).not.toContain("助手输出：");
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
          workspaceName: "ccgui",
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

  it("reconciles codex realtime output from history once after turn completion", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(resumeThread).mockResolvedValue({
        result: {
          thread: {
            id: "codex-thread-1",
            preview: "Clean history",
            updated_at: 2000,
            turns: [
              {
                items: [
                  {
                    type: "userMessage",
                    id: "user-1",
                    content: [{ type: "text", text: "拉起一下 Computer use" }],
                  },
                  {
                    type: "agentMessage",
                    id: "assistant-history-1",
                    text: "Computer Use 目前没拉起来，请检查 macOS 权限。",
                  },
                ],
              },
            ],
          },
        },
      });

      renderHook(() =>
        useThreads({
          activeWorkspace: workspace,
          onWorkspaceConnected: vi.fn(),
        }),
      );

      act(() => {
        handlers?.onTurnStarted?.("ws-1", "codex-thread-1", "turn-1");
      });

      act(() => {
        handlers?.onAgentMessageCompleted?.({
          workspaceId: "ws-1",
          threadId: "codex-thread-1",
          itemId: "assistant-live-1",
          text: "Computer Use 目前没拉起来。Computer Use 目前没拉起来。",
        });
      });
      expect(vi.mocked(resumeThread)).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_500);
      });
      expect(vi.mocked(resumeThread)).not.toHaveBeenCalled();

      act(() => {
        handlers?.onTurnCompleted?.("ws-1", "codex-thread-1", "turn-1");
        handlers?.onTurnCompleted?.("ws-1", "codex-thread-1", "turn-1");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_500);
      });

      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "codex-thread-1");
      expect(vi.mocked(resumeThread)).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a single visible queued follow-up user bubble through codex history reconcile", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(resumeThread).mockResolvedValue({
        result: {
          thread: {
            id: "codex-thread-2",
            preview: "Queued follow-up",
            updated_at: 3000,
            turns: [
              {
                items: [
                  {
                    type: "userMessage",
                    id: "user-history-2",
                    content: [{ type: "text", text: "继续排查这个问题" }],
                  },
                  {
                    type: "agentMessage",
                    id: "assistant-history-2",
                    text: "已经切到后续 queued follow-up 继续分析。",
                  },
                ],
              },
            ],
          },
        },
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: workspace,
          onWorkspaceConnected: vi.fn(),
          activeEngine: "codex",
        }),
      );

      act(() => {
        handlers?.onTurnStarted?.("ws-1", "codex-thread-2", "turn-prev");
      });

      await act(async () => {
        await result.current.sendUserMessageToThread(
          workspace,
          "codex-thread-2",
          "继续排查这个问题",
        );
      });
      await act(async () => {
        await Promise.resolve();
      });

      const optimisticItems =
        result.current.threadItemsByThread["codex-thread-2"] ?? [];
      expect(
        optimisticItems.some(
          (item) =>
            item.kind === "message" &&
            item.role === "user" &&
            item.id.startsWith("optimistic-user-"),
        ),
      ).toBe(true);

      act(() => {
        handlers?.onTurnCompleted?.("ws-1", "codex-thread-2", "turn-prev");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_500);
      });
      await act(async () => {
        await Promise.resolve();
      });

      const midReconcileUserItems = (
        result.current.threadItemsByThread["codex-thread-2"] ?? []
      ).filter(
        (item) =>
          item.kind === "message" &&
          item.role === "user" &&
          item.text === "继续排查这个问题",
      );
      expect(midReconcileUserItems).toHaveLength(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_500);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(vi.mocked(resumeThread)).toHaveBeenCalledTimes(1);

      const matchingUserItems = (
        result.current.threadItemsByThread["codex-thread-2"] ?? []
      ).filter(
        (item) =>
          item.kind === "message" &&
          item.role === "user" &&
          item.text === "继续排查这个问题",
      );
      expect(matchingUserItems).toHaveLength(1);
      expect(matchingUserItems[0]).toMatchObject({ id: "user-history-2" });

      expect(
        (result.current.threadItemsByThread["codex-thread-2"] ?? []).some(
          (item) =>
            item.kind === "message" &&
            item.role === "user" &&
            item.id.startsWith("optimistic-user-"),
        ),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconciles claude realtime output from history once after turn completion", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(loadClaudeSession).mockResolvedValue({
        messages: [
          {
            kind: "message",
            id: "user-history-1",
            role: "user",
            text: "继续分析",
          },
          {
            kind: "message",
            id: "assistant-history-1",
            role: "assistant",
            text: "这是 history 对齐后的 Claude 最终正文。",
          },
        ],
      });

      const { result } = renderHook(() =>
        useThreads({
          activeWorkspace: workspace,
          onWorkspaceConnected: vi.fn(),
        }),
      );

      await act(async () => {
        await result.current.listThreadsForWorkspace(workspace, {
          preserveState: true,
        });
      });

      act(() => {
        handlers?.onTurnStarted?.("ws-1", "claude:session-1", "turn-1");
      });

      act(() => {
        handlers?.onAgentMessageCompleted?.({
          workspaceId: "ws-1",
          threadId: "claude:session-1",
          itemId: "assistant-live-1",
          text: "重复的 Claude 最终正文。重复的 Claude 最终正文。",
        });
      });
      expect(vi.mocked(loadClaudeSession)).not.toHaveBeenCalled();

      act(() => {
        handlers?.onTurnCompleted?.("ws-1", "claude:session-1", "turn-1");
        handlers?.onTurnCompleted?.("ws-1", "claude:session-1", "turn-1");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_500);
      });

      expect(vi.mocked(loadClaudeSession)).toHaveBeenCalledWith(
        "/tmp/codemoss",
        "session-1",
      );
      expect(vi.mocked(loadClaudeSession)).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends completion email once when a non-codex completion carries the normalized turn id", async () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        activeEngine: "claude",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("claude:session-email");
    });

    await act(async () => {
      await result.current.sendUserMessage("请完成后邮件提醒");
    });

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "claude:session-email", "claude-turn-email-1");
    });

    act(() => {
      result.current.toggleCompletionEmailIntent("claude:session-email");
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "claude:session-email",
        itemId: "assistant-email-1",
        text: "已经完成，可以发送邮件。",
      });
      handlers?.onTurnCompleted?.(
        "ws-1",
        "claude:session-email",
        "  claude-turn-email-1  ",
      );
    });

    await waitFor(() => {
      expect(vi.mocked(sendConversationCompletionEmail)).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(sendConversationCompletionEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        threadId: "claude:session-email",
        turnId: "claude-turn-email-1",
      }),
    );
    const [request] = vi.mocked(sendConversationCompletionEmail).mock.calls[0] ?? [];
    expect(request?.textBody).toContain("请完成后邮件提醒");
    expect(request?.textBody).toContain("已经完成，可以发送邮件。");

    act(() => {
      handlers?.onTurnCompleted?.(
        "ws-1",
        "claude:session-email",
        "claude-turn-email-1",
      );
    });
    expect(vi.mocked(sendConversationCompletionEmail)).toHaveBeenCalledTimes(1);
  });

  it("diagnoses and clears a pending completion email intent when completion lacks turn id", async () => {
    const onDebug = vi.fn();
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        activeEngine: "gemini",
        onDebug,
      }),
    );

    act(() => {
      result.current.setActiveThreadId("gemini:session-email");
    });

    await act(async () => {
      await result.current.sendUserMessage("Gemini 完成后邮件提醒");
    });

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "gemini:session-email", "gemini-turn-email-1");
    });

    act(() => {
      result.current.toggleCompletionEmailIntent("gemini:session-email");
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "gemini:session-email",
        itemId: "assistant-email-missing-turn",
        text: "Gemini 已完成。",
      });
      handlers?.onTurnCompleted?.("ws-1", "gemini:session-email", "");
    });

    await waitFor(() => {
      expect(onDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          label: "completion-email/missed-terminal",
          payload: expect.objectContaining({
            workspaceId: "ws-1",
            threadId: "gemini:session-email",
            targetTurnId: "gemini-turn-email-1",
            reason: "missing_turn_id",
          }),
        }),
      );
    });

    expect(vi.mocked(sendConversationCompletionEmail)).not.toHaveBeenCalled();
    expect(result.current.completionEmailIntentByThread["gemini:session-email"]).toBeUndefined();
  });
});
