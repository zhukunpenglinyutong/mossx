// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useThreadMessaging } from "./useThreadMessaging";
import {
  engineSendMessage,
  sendUserMessage,
  projectMemoryCaptureAuto,
} from "../../../services/tauri";
import { projectMemoryFacade } from "../../project-memory/services/projectMemoryFacade";
import { noteCardsFacade } from "../../note-cards/services/noteCardsFacade";

vi.mock("@sentry/react", () => ({
  metrics: {
    count: vi.fn(),
  },
}));

vi.mock("./useReviewPrompt", () => ({
  useReviewPrompt: () => ({
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
  sendUserMessage: vi.fn(),
  startReview: vi.fn(),
  interruptTurn: vi.fn(),
  listMcpServerStatus: vi.fn(),
  engineSendMessage: vi.fn(),
  engineInterruptTurn: vi.fn(),
  engineInterrupt: vi.fn(),
  projectMemoryCaptureAuto: vi.fn(),
}));

vi.mock("../../project-memory/services/projectMemoryFacade", () => ({
  projectMemoryFacade: {
    list: vi.fn(),
    listSummary: vi.fn(),
    get: vi.fn(),
    captureTurnInput: vi.fn(async () => null),
  },
}));

vi.mock("../../note-cards/services/noteCardsFacade", () => ({
  noteCardsFacade: {
    get: vi.fn(),
  },
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "ws",
  path: "/tmp/ws",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function buildHook(
  engine: "claude" | "codex" | "gemini",
  dispatch = vi.fn(),
  onDebug = vi.fn(),
) {
  return renderHook(() =>
    useThreadMessaging({
      activeWorkspace: workspace,
      activeThreadId:
        engine === "claude"
          ? "claude:session-1"
          : engine === "gemini"
            ? "gemini:session-1"
            : "thread-1",
      steerEnabled: false,
      customPrompts: [],
      activeEngine: engine,
      threadStatusById: {},
      itemsByThread: {},
      activeTurnIdByThread: {},
      codexAcceptedTurnByThread: {},
      tokenUsageByThread: {},
      rateLimitsByWorkspace: {},
      pendingInterruptsRef: { current: new Set<string>() },
      interruptedThreadsRef: { current: new Set<string>() },
      dispatch,
      getCustomName: vi.fn(),
      getThreadEngine: vi.fn(),
      markProcessing: vi.fn(),
      markReviewing: vi.fn(),
      setActiveTurnId: vi.fn(),
      recordThreadActivity: vi.fn(),
      safeMessageActivity: vi.fn(),
      onDebug,
      pushThreadErrorMessage: vi.fn(),
      ensureThreadForActiveWorkspace: vi.fn(),
      ensureThreadForWorkspace: vi.fn(),
      refreshThread: vi.fn(),
      forkThreadForWorkspace: vi.fn(),
      updateThreadParent: vi.fn(),
      startThreadForWorkspace: vi.fn(),
      onInputMemoryCaptured: vi.fn(),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  vi.mocked(projectMemoryCaptureAuto).mockResolvedValue(null);
  vi.mocked(projectMemoryFacade.list).mockResolvedValue({
    items: [],
    total: 0,
  } as never);
  vi.mocked(projectMemoryFacade.listSummary).mockResolvedValue({
    items: [],
    total: 0,
  } as never);
  vi.mocked(projectMemoryFacade.get).mockResolvedValue(null);
  vi.mocked(noteCardsFacade.get).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useThreadMessaging context injection", () => {
  it("does not auto inject memory block on claude path", async () => {
    vi.mocked(engineSendMessage).mockResolvedValue({
      result: { turn: { id: "turn-1" } },
    } as never);

    const { result } = buildHook("claude");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "claude:session-1",
        "数据库查询优化",
        [],
        { skipPromptExpansion: true },
      );
    });

    const payload = vi.mocked(engineSendMessage).mock.calls[0]?.[1] as any;
    expect(payload.text).toBe("数据库查询优化");
  });

  it("injects selected memories with detail mode by default on codex path", async () => {
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-2" } },
    } as never);
    vi.mocked(projectMemoryFacade.get).mockResolvedValue({
      id: "m-1",
      workspaceId: "ws-1",
      kind: "known_issue",
      title: "数据库连接池超时",
      summary: "数据库连接池超时",
      detail: "用户输入：数据库连接池超时怎么办\n助手输出摘要：优先检查连接上限与超时设置",
      cleanText: "",
      tags: ["数据库"],
      importance: "high",
      source: "manual",
      fingerprint: "fp",
      createdAt: 1,
      updatedAt: 1,
    } as never);

    const { result } = buildHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "数据库查询优化",
        [],
        {
          skipPromptExpansion: true,
          selectedMemoryIds: ["m-1"],
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg.startsWith("<project-memory-pack")).toBe(true);
    expect(textArg).toContain('source="manual-selection"');
    expect(textArg).toContain("[M1]");
    expect(textArg).toContain("用户输入：数据库连接池超时怎么办");
    expect(textArg).toContain("数据库查询优化");
    expect(projectMemoryFacade.get).toHaveBeenCalledWith("m-1", "ws-1");
  });

  it("keeps selected memory injection detailed on codex path even when preview mode is summary", async () => {
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-2b" } },
    } as never);
    vi.mocked(projectMemoryFacade.get).mockResolvedValue({
      id: "m-2",
      workspaceId: "ws-1",
      kind: "known_issue",
      title: "数据库连接池超时",
      summary: "这是 summary 内容",
      detail: "这段 detail 不应被注入",
      cleanText: "",
      tags: ["数据库"],
      importance: "high",
      source: "manual",
      fingerprint: "fp",
      createdAt: 1,
      updatedAt: 1,
    } as never);

    const { result } = buildHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "数据库查询优化",
        [],
        {
          skipPromptExpansion: true,
          selectedMemoryIds: ["m-2"],
          selectedMemoryInjectionMode: "summary",
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toContain("这是 summary 内容");
    expect(textArg).toContain("这段 detail 不应被注入");
  });

  it("ignores localStorage contextInjectionEnabled=true and keeps plain text", async () => {
    window.localStorage.setItem("projectMemory.contextInjectionEnabled", "true");
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-3" } },
    } as never);

    const { result } = buildHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "plain-text",
        [],
        { skipPromptExpansion: true },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toBe("plain-text");
  });

  it("injects Memory Scout brief as a separate memory-scout block on codex path", async () => {
    const onDebug = vi.fn();
    const dispatch = vi.fn();
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-memory-reference" } },
    } as never);
    vi.mocked(projectMemoryFacade.listSummary).mockResolvedValue({
      items: [
        {
          id: "m-scout-1",
          workspaceId: "ws-1",
          recordKind: "conversation_turn",
          kind: "conversation",
          title: "数据库连接池超时",
          summary: "数据库 timeout 需要检查连接池上限",
          detail: null,
          cleanText: "数据库 timeout 需要检查连接池上限",
          tags: ["数据库", "timeout"],
          importance: "high",
          threadId: "thread-source",
          turnId: "turn-source",
          engine: "codex",
          source: "conversation_turn",
          fingerprint: "fp",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      total: 1,
    } as never);
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        steerEnabled: false,
        customPrompts: [],
        activeEngine: "codex",
        threadStatusById: {},
        itemsByThread: {},
        activeTurnIdByThread: {},
        codexAcceptedTurnByThread: {},
        tokenUsageByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        interruptedThreadsRef: { current: new Set<string>() },
        dispatch,
        getCustomName: vi.fn(),
        getThreadEngine: vi.fn(),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug,
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(),
        ensureThreadForWorkspace: vi.fn(),
        refreshThread: vi.fn(),
        forkThreadForWorkspace: vi.fn(),
        updateThreadParent: vi.fn(),
        startThreadForWorkspace: vi.fn(),
        onInputMemoryCaptured: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "数据库 timeout 怎么排查",
        [],
        {
          skipPromptExpansion: true,
          memoryReferenceEnabled: true,
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toContain('<project-memory-pack source="memory-scout"');
    expect(textArg).toContain("memoryId=m-scout-1");
    expect(textArg).toContain("threadId=thread-source turnId=turn-source engine=codex");
    expect(textArg).toContain("Source Records:");
    expect(textArg).toContain("</project-memory-pack>\n\n数据库 timeout 怎么排查");
    expect(projectMemoryFacade.listSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        query: null,
        pageSize: 200,
      }),
    );
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "memory/scout-injected",
        payload: expect.objectContaining({
          injectedCount: 1,
          reason: null,
        }),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsertItem",
        item: expect.objectContaining({
          role: "assistant",
          text: expect.stringContaining("threads.memoryReferenceQuerying"),
        }),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsertItem",
        item: expect.objectContaining({
          role: "assistant",
          text: expect.stringContaining("threads.memoryReferenceReferenced"),
        }),
      }),
    );
    const memoryReferenceSummaryItems = dispatch.mock.calls
      .map((call) => call[0])
      .filter((action) =>
        action?.type === "upsertItem" &&
        action.item?.role === "assistant" &&
        typeof action.item.text === "string" &&
        action.item.text.includes("threads.memoryReference"),
      )
      .map((action) => action.item);
    expect(memoryReferenceSummaryItems).toHaveLength(2);
    expect(new Set(memoryReferenceSummaryItems.map((item) => item.id)).size).toBe(1);
    expect(memoryReferenceSummaryItems[0]?.text).toContain(
      "threads.memoryReferenceQuerying",
    );
    expect(memoryReferenceSummaryItems[1]?.text).toContain(
      "threads.memoryReferenceReferenced",
    );
  });

  it("recalls identity memory on production Memory Reference path without semantic provider", async () => {
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-identity" } },
    } as never);
    vi.mocked(projectMemoryFacade.listSummary).mockResolvedValue({
      items: [
        {
          id: "m-identity",
          workspaceId: "ws-1",
          recordKind: "conversation_turn",
          kind: "conversation",
          title: "身份介绍",
          summary: "用户介绍了自己的姓名",
          detail: "用户输入：\n我是陈湘宁你是谁你有什么能力",
          cleanText: "我是陈湘宁你是谁你有什么能力",
          tags: ["identity"],
          importance: "high",
          userInput: "我是陈湘宁你是谁你有什么能力",
          assistantResponse: "我是 Codex，你的工程协作伙伴。",
          source: "conversation_turn",
          fingerprint: "fp",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      total: 1,
    } as never);
    const { result } = buildHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "我是谁",
        [],
        {
          skipPromptExpansion: true,
          memoryReferenceEnabled: true,
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toContain('<project-memory-pack source="memory-scout"');
    expect(textArg).toContain("memoryId=m-identity");
    expect(textArg).toContain("我是陈湘宁");
    expect(textArg).toContain("</project-memory-pack>\n\n我是谁");
    expect(projectMemoryFacade.listSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        query: null,
        pageSize: 200,
      }),
    );
  });

  it("keeps manual and memory-scout indexes unique when both sources are injected", async () => {
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-memory-combined" } },
    } as never);
    vi.mocked(projectMemoryFacade.get).mockResolvedValue({
      id: "m-manual-1",
      workspaceId: "ws-1",
      recordKind: "manual_note",
      kind: "note",
      title: "手动发布记忆",
      summary: "发布前先跑 typecheck",
      detail: "发布前先跑 typecheck。",
      cleanText: "发布前先跑 typecheck。",
      tags: ["release"],
      importance: "high",
      source: "manual",
      fingerprint: "fp-manual",
      createdAt: 1,
      updatedAt: 1,
    } as never);
    vi.mocked(projectMemoryFacade.listSummary).mockResolvedValue({
      items: [
        {
          id: "m-scout-2",
          workspaceId: "ws-1",
          recordKind: "conversation_turn",
          kind: "conversation",
          title: "自动关联记忆",
          summary: "部署需要检查环境变量",
          detail: null,
          cleanText: "部署需要检查环境变量",
          tags: ["deploy"],
          importance: "high",
          threadId: "thread-source",
          turnId: "turn-source",
          engine: "codex",
          source: "conversation_turn",
          fingerprint: "fp-scout",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      total: 1,
    } as never);
    const { result } = buildHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "部署前检查什么",
        [],
        {
          skipPromptExpansion: true,
          selectedMemoryIds: ["m-manual-1"],
          memoryReferenceEnabled: true,
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toContain('<project-memory-pack source="manual-selection"');
    expect(textArg).toContain("[M1] memoryId=m-manual-1");
    expect(textArg).toContain('<project-memory-pack source="memory-scout"');
    expect(textArg).toContain("[M2] memoryId=m-scout-2");
    expect(textArg).not.toContain("[M1] memoryId=m-scout-2");
    expect(textArg).toContain("</project-memory-pack>\n\n部署前检查什么");
  });

  it("keeps main send unblocked when Memory Scout returns empty", async () => {
    const onDebug = vi.fn();
    const dispatch = vi.fn();
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-memory-empty" } },
    } as never);
    vi.mocked(projectMemoryFacade.listSummary).mockResolvedValue({
      items: [],
      total: 0,
    } as never);

    const { result } = buildHook("codex", dispatch, onDebug);

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "没有相关记忆的问题",
        [],
        {
          skipPromptExpansion: true,
          memoryReferenceEnabled: true,
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toBe("没有相关记忆的问题");
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          text: expect.stringContaining("threads.memoryReferenceNoRelated"),
        }),
      }),
    );
    const memoryReferenceSummaryItems = dispatch.mock.calls
      .map((call) => call[0])
      .filter((action) =>
        action?.type === "upsertItem" &&
        action.item?.role === "assistant" &&
        typeof action.item.text === "string" &&
        action.item.text.includes("threads.memoryReference"),
      )
      .map((action) => action.item);
    expect(memoryReferenceSummaryItems).toHaveLength(2);
    expect(new Set(memoryReferenceSummaryItems.map((item) => item.id)).size).toBe(1);
    expect(memoryReferenceSummaryItems[0]?.text).toContain(
      "threads.memoryReferenceQuerying",
    );
    expect(memoryReferenceSummaryItems[1]?.text).toContain(
      "threads.memoryReferenceNoRelated",
    );
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "memory/scout-skipped",
        payload: expect.objectContaining({
          reason: "scout_empty",
        }),
      }),
    );
  });

  it("keeps main send unblocked when Memory Scout fails", async () => {
    const onDebug = vi.fn();
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-memory-error" } },
    } as never);
    vi.mocked(projectMemoryFacade.listSummary).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        steerEnabled: false,
        customPrompts: [],
        activeEngine: "codex",
        threadStatusById: {},
        itemsByThread: {},
        activeTurnIdByThread: {},
        codexAcceptedTurnByThread: {},
        tokenUsageByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        interruptedThreadsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: vi.fn(),
        getThreadEngine: vi.fn(),
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        onDebug,
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: vi.fn(),
        ensureThreadForWorkspace: vi.fn(),
        refreshThread: vi.fn(),
        forkThreadForWorkspace: vi.fn(),
        updateThreadParent: vi.fn(),
        startThreadForWorkspace: vi.fn(),
        onInputMemoryCaptured: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "失败也要发送",
        [],
        {
          skipPromptExpansion: true,
          memoryReferenceEnabled: true,
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toBe("失败也要发送");
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "memory/scout-skipped",
        payload: expect.objectContaining({
          reason: "scout_error",
        }),
      }),
    );
  });

  it("keeps main send unblocked when Memory Scout times out", async () => {
    vi.useFakeTimers();
    const onDebug = vi.fn();
    const dispatch = vi.fn();
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-memory-timeout" } },
    } as never);
    vi.mocked(projectMemoryFacade.listSummary).mockReturnValue(new Promise(() => {}) as never);
    const { result } = buildHook("codex", dispatch, onDebug);

    await act(async () => {
      const sendPromise = result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "超时也要发送",
        [],
        {
          skipPromptExpansion: true,
          memoryReferenceEnabled: true,
        },
      );
      await vi.advanceTimersByTimeAsync(1600);
      await sendPromise;
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg).toBe("超时也要发送");
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          text: expect.stringContaining("threads.memoryReferenceTimeout"),
        }),
      }),
    );
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "memory/scout-skipped",
        payload: expect.objectContaining({
          reason: "scout_timeout",
        }),
      }),
    );
    vi.useRealTimers();
  });

  it.each([
    ["claude", "claude:session-1"],
    ["gemini", "gemini:session-1"],
  ] as const)("uses the same memory-scout block on %s path", async (engine, threadId) => {
    vi.mocked(engineSendMessage).mockResolvedValue({
      result: { turn: { id: `turn-${engine}` } },
    } as never);
    vi.mocked(projectMemoryFacade.listSummary).mockResolvedValue({
      items: [
        {
          id: `m-${engine}`,
          workspaceId: "ws-1",
          recordKind: "conversation_turn",
          kind: "conversation",
          title: "数据库 timeout",
          summary: "数据库 timeout 复盘",
          detail: null,
          cleanText: "数据库 timeout 复盘",
          tags: ["数据库", "timeout"],
          importance: "high",
          source: "conversation_turn",
          fingerprint: "fp",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      total: 1,
    } as never);
    const { result } = buildHook(engine);

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        threadId,
        "数据库 timeout",
        [],
        {
          skipPromptExpansion: true,
          memoryReferenceEnabled: true,
        },
      );
    });

    const payload = vi.mocked(engineSendMessage).mock.calls[0]?.[1] as any;
    expect(payload.text).toContain('<project-memory-pack source="memory-scout"');
    expect(payload.text).toContain(`memoryId=m-${engine}`);
    expect(payload.text).toContain("</project-memory-pack>\n\n数据库 timeout");
  });

  it("inserts a separate note-card context summary item and keeps note images in the injected context", async () => {
    const dispatch = vi.fn();
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-note-1" } },
    } as never);
    vi.mocked(noteCardsFacade.get).mockResolvedValue({
      id: "note-1",
      workspaceId: "ws-1",
      workspaceName: "ws",
      workspacePath: "/tmp/ws",
      projectName: "ws",
      title: "发布清单",
      bodyMarkdown: "先构建，再发布",
      plainTextExcerpt: "先构建，再发布",
      attachments: [
        {
          id: "attachment-1",
          fileName: "deploy.png",
          contentType: "image/png",
          relativePath: "deploy.png",
          absolutePath: "/tmp/ws/.ccgui/note_card/ws/assets/note-1/deploy.png",
          sizeBytes: 4,
        },
      ],
      createdAt: 1,
      updatedAt: 2,
      archivedAt: null,
    } as never);

    const { result } = buildHook("codex", dispatch);

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "请按这个执行",
        [],
        {
          skipPromptExpansion: true,
          selectedNoteCardIds: ["note-1"],
        },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    const optionsArg = vi.mocked(sendUserMessage).mock.calls[0]?.[3] as
      | { images?: string[] }
      | undefined;
    expect(textArg).toContain("<note-card-context>");
    expect(textArg).toContain('title="发布清单"');
    expect(optionsArg?.images).toEqual([
      "/tmp/ws/.ccgui/note_card/ws/assets/note-1/deploy.png",
    ]);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsertItem",
        item: expect.objectContaining({
          kind: "message",
          role: "assistant",
          text: expect.stringContaining("【便签上下文】"),
        }),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsertItem",
        item: expect.objectContaining({
          kind: "message",
          role: "user",
          text: expect.stringContaining("<note-card-context>"),
          images: ["/tmp/ws/.ccgui/note_card/ws/assets/note-1/deploy.png"],
        }),
      }),
    );
  });
});
