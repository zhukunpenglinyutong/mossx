// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import type { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import {
  loadClaudeSession,
  listClaudeSessions,
  listThreads,
  projectMemoryCompleteTurn,
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
  projectMemoryCompleteTurn: vi.fn(),
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
    vi.mocked(projectMemoryCompleteTurn).mockResolvedValue({
      id: "m-1",
      workspaceId: "ws-1",
      schemaVersion: 2,
      recordKind: "conversation_turn",
      kind: "conversation",
      title: "t",
      summary: "s",
      cleanText: "c",
      tags: [],
      importance: "medium",
      source: "conversation_turn",
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
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("conversation");
    expect(payload?.threadId).toBe("thread-race-1");
    expect(payload?.assistantMessageId).toBe("assistant-item-1");
    expect(payload?.engine).toBe("claude");
    expect(payload?.userInput).toBe("这是用户输入。");
    expect(payload?.assistantResponse).toBe("这是助手输出。");
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
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
    expect(payload?.kind).toBe("conversation");
    expect(payload?.threadId).toBe("claude:session-abc");
    expect(payload?.assistantMessageId).toBe("assistant-item-2");
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
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
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
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
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
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
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
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
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
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
    const summary = payload?.summary ?? "";
    const assistantResponse = payload?.assistantResponse ?? "";
    expect((summary.match(/好的，更新记录/g) ?? []).length).toBeLessThanOrEqual(1);
    expect((summary.match(/2026年2月23日中午/g) ?? []).length).toBe(1);
    expect((assistantResponse.match(/2026年2月23日中午/g) ?? []).length).toBe(1);
    expect(assistantResponse).not.toContain("助手输出：");
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
        expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("keeps same-thread Codex turn memories isolated by turn id", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        activeEngine: "codex",
      }),
    );

    const firstUserInput = [
      "第一轮用户输入：需要完整保存这段很长的 Codex 提问。",
      "包含边界：路径 C:\\work\\mossx 和 /Users/dev/mossx 都不能影响存储。",
    ].join("\n");
    const firstAssistantResponse = [
      "第一轮 AI 回复：这是完整回答正文。",
      "不能因为同线程第二轮先完成就丢失。",
    ].join("\n");
    const secondUserInput = "第二轮用户输入：先完成这一轮。";
    const secondAssistantResponse = "第二轮 AI 回复：先完成但不能清掉第一轮 pending。";

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-memory",
        turnId: "codex-turn-1",
        inputText: firstUserInput,
        memoryId: "memory-codex-1",
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: "codex",
      });
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-memory",
        turnId: "codex-turn-2",
        inputText: secondUserInput,
        memoryId: "memory-codex-2",
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: "codex",
      });
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-memory",
        turnId: "codex-turn-2",
        itemId: "assistant-codex-2",
        text: secondAssistantResponse,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-memory",
        turnId: "codex-turn-1",
        itemId: "assistant-codex-1",
        text: firstAssistantResponse,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(2);
    });

    const codexPayloads = vi.mocked(projectMemoryCompleteTurn).mock.calls.map(
      ([payload]) => payload,
    );
    expect(codexPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          engine: "codex",
          threadId: "codex-thread-memory",
          turnId: "codex-turn-1",
          memoryId: "memory-codex-1",
          userInput: firstUserInput,
          assistantResponse: firstAssistantResponse,
          assistantMessageId: "assistant-codex-1",
        }),
        expect.objectContaining({
          engine: "codex",
          threadId: "codex-thread-memory",
          turnId: "codex-turn-2",
          memoryId: "memory-codex-2",
          userInput: secondUserInput,
          assistantResponse: secondAssistantResponse,
          assistantMessageId: "assistant-codex-2",
        }),
      ]),
    );
  });

  it("updates one Codex turn memory when the final answer arrives after an initial assistant segment", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        activeEngine: "codex",
      }),
    );

    const initialAssistantSegment =
      "我会先按项目启动协议读取 Trellis/本地规范，再做只读扫描：项目结构、技术栈、启动方式、核心模块与潜在风险。当前不改文件。";
    const finalAssistantSegment = [
      "项目是什么？",
      "这是一个 Spring Boot 2.7.18 + Java 11 的多端认证 Demo，核心能力是注册、登录、JWT 鉴权、Refresh Token。",
      "主要风险有 5 个：SecurityConfig 注释乱码、JWT Filter 直接信任 Token claims、H2 Console 暴露、Actuator 全量放行、仓库混入 .DS_Store。",
    ].join("\n\n");

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-multi-segment",
        turnId: "codex-turn-multi-segment",
        inputText: "项目分析",
        memoryId: "memory-codex-multi-segment",
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: "codex",
      });
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-multi-segment",
        turnId: "codex-turn-multi-segment",
        itemId: "assistant-codex-segment-1",
        text: initialAssistantSegment,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-multi-segment",
        turnId: "codex-turn-multi-segment",
        itemId: "assistant-codex-segment-2",
        text: finalAssistantSegment,
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(2);
    });

    const [firstPayload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
    const [secondPayload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[1] ?? [];
    expect(firstPayload).toEqual(
      expect.objectContaining({
        engine: "codex",
        memoryId: "memory-codex-multi-segment",
        turnId: "codex-turn-multi-segment",
        assistantMessageId: "assistant-codex-segment-1",
        assistantResponse: initialAssistantSegment,
      }),
    );
    expect(secondPayload).toEqual(
      expect.objectContaining({
        engine: "codex",
        memoryId: "memory-codex-multi-segment",
        turnId: "codex-turn-multi-segment",
        assistantMessageId: "assistant-codex-segment-2",
      }),
    );
    expect(secondPayload?.assistantResponse).toContain(initialAssistantSegment);
    expect(secondPayload?.assistantResponse).toContain(finalAssistantSegment);
    expect(secondPayload?.assistantResponse).toContain("JWT Filter 直接信任 Token claims");
  });

  it("keeps Codex multi-segment memory open when initial completion arrives before input capture", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        activeEngine: "codex",
      }),
    );

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-completed-first",
        turnId: "codex-turn-completed-first",
        itemId: "assistant-codex-early",
        text: "我会先读取项目规范并做只读扫描。",
      });
    });

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-completed-first",
        turnId: "codex-turn-completed-first",
        inputText: "项目分析",
        memoryId: "memory-codex-completed-first",
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: "codex",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-completed-first",
        turnId: "codex-turn-completed-first",
        itemId: "assistant-codex-final",
        text: "最终分析：这是 Spring Boot 认证 Demo，风险包括 JWT claims 信任、H2 Console 暴露和 Actuator 放行。",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(2);
    });

    const [secondPayload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[1] ?? [];
    expect(secondPayload).toEqual(
      expect.objectContaining({
        engine: "codex",
        memoryId: "memory-codex-completed-first",
        turnId: "codex-turn-completed-first",
        assistantMessageId: "assistant-codex-final",
      }),
    );
    expect(secondPayload?.assistantResponse).toContain("我会先读取项目规范并做只读扫描。");
    expect(secondPayload?.assistantResponse).toContain("最终分析：这是 Spring Boot 认证 Demo");
  });

  it("keeps Codex multi-segment memory open when engine metadata is missing", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        activeEngine: "codex",
      }),
    );

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-missing-engine",
        turnId: "codex-turn-missing-engine",
        inputText: "项目分析",
        memoryId: "memory-codex-missing-engine",
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: null,
      });
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-missing-engine",
        turnId: "codex-turn-missing-engine",
        itemId: "assistant-codex-missing-engine-1",
        text: "第一段：先扫描项目。",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "codex-thread-missing-engine",
        turnId: "codex-turn-missing-engine",
        itemId: "assistant-codex-missing-engine-2",
        text: "第二段：最终结论包含完整风险列表。",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(2);
    });

    const [secondPayload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[1] ?? [];
    expect(secondPayload).toEqual(
      expect.objectContaining({
        memoryId: "memory-codex-missing-engine",
        turnId: "codex-turn-missing-engine",
        assistantMessageId: "assistant-codex-missing-engine-2",
      }),
    );
    expect(secondPayload?.assistantResponse).toContain("第一段：先扫描项目。");
    expect(secondPayload?.assistantResponse).toContain("第二段：最终结论包含完整风险列表。");
  });

  it("writes a completed Claude turn only once when duplicate completed events arrive", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "thread-duplicate-complete",
        turnId: "turn-duplicate-complete",
        inputText: "用户输入：重复 completed 只能写一次。",
        memoryId: "memory-duplicate-complete",
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: "claude",
      });
    });

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-duplicate-complete",
        turnId: "turn-duplicate-complete",
        itemId: "assistant-duplicate-complete",
        text: "AI 回复：重复 completed 只能写一次。",
      });
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-duplicate-complete",
        turnId: "turn-duplicate-complete",
        itemId: "assistant-duplicate-complete",
        text: "AI 回复：重复 completed 只能写一次。",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });
  });

  it("uses the same Project Memory turn contract for Gemini normalized smoke", async () => {
    renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        activeEngine: "gemini",
      }),
    );

    act(() => {
      triggerInputMemoryCaptured?.({
        workspaceId: "ws-1",
        threadId: "gemini:memory-smoke",
        turnId: "gemini-turn-memory-1",
        inputText: "Gemini 用户输入全文。",
        memoryId: "memory-gemini-1",
        workspaceName: "ccgui",
        workspacePath: "/tmp/codemoss",
        engine: "gemini",
      });
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "gemini:memory-smoke",
        turnId: "gemini-turn-memory-1",
        itemId: "assistant-gemini-1",
        text: "Gemini AI 回复全文。",
      });
    });

    await waitFor(() => {
      expect(vi.mocked(projectMemoryCompleteTurn)).toHaveBeenCalledTimes(1);
    });

    const [payload] = vi.mocked(projectMemoryCompleteTurn).mock.calls[0] ?? [];
    expect(payload).toEqual(
      expect.objectContaining({
        engine: "gemini",
        threadId: "gemini:memory-smoke",
        turnId: "gemini-turn-memory-1",
        memoryId: "memory-gemini-1",
        userInput: "Gemini 用户输入全文。",
        assistantResponse: "Gemini AI 回复全文。",
        assistantMessageId: "assistant-gemini-1",
      }),
    );
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

  it("preserves only the latest Codex auto-compaction curtain through history reconcile and clears it after usage refresh", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-02T00:00:00.000Z"));
      vi.mocked(resumeThread).mockResolvedValue({
        result: {
          thread: {
            id: "codex-thread-compact",
            preview: "Compaction thread",
            updated_at: 4_000,
            turns: [
              {
                items: [
                  {
                    type: "userMessage",
                    id: "user-history-compact",
                    content: [{ type: "text", text: "继续完成当前回复" }],
                  },
                  {
                    type: "agentMessage",
                    id: "assistant-history-compact",
                    text: "history 对齐后的 Codex 最终正文。",
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
          useUnifiedHistoryLoader: true,
        }),
      );

      const getCompactionMessages = () =>
        (result.current.threadItemsByThread["codex-thread-compact"] ?? []).filter(
          (item) =>
            item.kind === "message" &&
            item.role === "assistant" &&
            item.engineSource === "codex" &&
            item.id.startsWith(
              "context-compacted-codex-compact-codex-thread-compact",
            ),
        );

      act(() => {
        handlers?.onContextCompacting?.("ws-1", "codex-thread-compact", {
          usagePercent: 96,
          thresholdPercent: 92,
          targetPercent: 70,
          auto: true,
          manual: false,
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      act(() => {
        handlers?.onContextCompacted?.("ws-1", "codex-thread-compact", "turn-old", {
          auto: true,
          manual: false,
        });
      });

      expect(getCompactionMessages()).toHaveLength(1);
      expect(getCompactionMessages()[0]).toMatchObject({
        text: "threads.codexCompactionCompleted",
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      act(() => {
        handlers?.onTurnStarted?.("ws-1", "codex-thread-compact", "turn-new");
      });
      act(() => {
        handlers?.onContextCompacting?.("ws-1", "codex-thread-compact", {
          usagePercent: 98,
          thresholdPercent: 92,
          targetPercent: 70,
          auto: true,
          manual: false,
        });
      });

      expect(getCompactionMessages()).toHaveLength(1);
      expect(getCompactionMessages()[0]).toMatchObject({
        text: "threads.codexCompactionStarted",
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      act(() => {
        handlers?.onContextCompacted?.("ws-1", "codex-thread-compact", "turn-new", {
          auto: true,
          manual: false,
        });
        handlers?.onTurnCompleted?.("ws-1", "codex-thread-compact", "turn-new");
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_500);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith(
        "ws-1",
        "codex-thread-compact",
      );
      expect(getCompactionMessages()).toHaveLength(1);
      expect(getCompactionMessages()[0]).toMatchObject({
        text: "threads.codexCompactionCompleted",
      });
      expect(
        (result.current.threadItemsByThread["codex-thread-compact"] ?? []).some(
          (item) =>
            item.kind === "message" &&
            item.role === "assistant" &&
            item.id === "assistant-history-compact",
        ),
      ).toBe(true);
      expect(
        result.current.threadStatusById["codex-thread-compact"]?.codexCompactionLifecycleState,
      ).toBe("completed");

      act(() => {
        handlers?.onThreadTokenUsageUpdated?.("ws-1", "codex-thread-compact", {
          total: {
            totalTokens: 180_000,
            inputTokens: 100_000,
            cachedInputTokens: 20_000,
            outputTokens: 60_000,
            reasoningOutputTokens: 0,
          },
          last: {
            totalTokens: 55_000,
            inputTokens: 30_000,
            cachedInputTokens: 10_000,
            outputTokens: 15_000,
            reasoningOutputTokens: 0,
          },
          modelContextWindow: 200_000,
        });
      });

      expect(
        result.current.threadStatusById["codex-thread-compact"]?.codexCompactionLifecycleState,
      ).toBe("idle");

      await act(async () => {
        await result.current.refreshThread("ws-1", "codex-thread-compact");
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(getCompactionMessages()).toHaveLength(0);
      expect(
        result.current.threadItemsByThread["codex-thread-compact"] ?? [],
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "assistant-history-compact",
            kind: "message",
            role: "assistant",
            text: "history 对齐后的 Codex 最终正文。",
          }),
        ]),
      );
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
