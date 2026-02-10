// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useThreadMessaging } from "./useThreadMessaging";
import {
  engineSendMessage,
  sendUserMessage,
  projectMemoryCaptureAuto,
} from "../../../services/tauri";
import { projectMemoryFacade } from "../../project-memory/services/projectMemoryFacade";

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
  engineInterrupt: vi.fn(),
  projectMemoryCaptureAuto: vi.fn(),
}));

vi.mock("../../project-memory/services/projectMemoryFacade", () => ({
  projectMemoryFacade: {
    list: vi.fn(),
  },
}));

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "ws",
  path: "/tmp/ws",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function buildHook(engine: "claude" | "codex") {
  return renderHook(() =>
    useThreadMessaging({
      activeWorkspace: workspace,
      activeThreadId: engine === "claude" ? "claude:session-1" : "thread-1",
      steerEnabled: false,
      customPrompts: [],
      activeEngine: engine,
      threadStatusById: {},
      activeTurnIdByThread: {},
      rateLimitsByWorkspace: {},
      pendingInterruptsRef: { current: new Set<string>() },
      dispatch: vi.fn(),
      getCustomName: vi.fn(),
      getThreadEngine: vi.fn(),
      markProcessing: vi.fn(),
      markReviewing: vi.fn(),
      setActiveTurnId: vi.fn(),
      recordThreadActivity: vi.fn(),
      safeMessageActivity: vi.fn(),
      onDebug: vi.fn(),
      pushThreadErrorMessage: vi.fn(),
      ensureThreadForActiveWorkspace: vi.fn(),
      ensureThreadForWorkspace: vi.fn(),
      refreshThread: vi.fn(),
      forkThreadForWorkspace: vi.fn(),
      updateThreadParent: vi.fn(),
      startThreadForWorkspace: vi.fn(),
      autoNameThread: vi.fn(),
      onInputMemoryCaptured: vi.fn(),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(projectMemoryCaptureAuto).mockResolvedValue(null);
  vi.mocked(projectMemoryFacade.list).mockResolvedValue({
    items: [
      {
        id: "m-1",
        workspaceId: "ws-1",
        kind: "known_issue",
        title: "数据库连接池超时",
        summary: "数据库连接池超时",
        cleanText: "",
        tags: ["数据库"],
        importance: "high",
        source: "auto",
        fingerprint: "fp",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    total: 1,
  });
});

describe("useThreadMessaging context injection", () => {
  it("injects memory block on claude path", async () => {
    vi.mocked(engineSendMessage).mockResolvedValue({
      result: { turn: { id: "turn-1" } },
    } as any);

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
    expect(payload.text.startsWith("<project-memory")).toBe(true);
    expect(payload.text).toContain("数据库查询优化");
  });

  it("injects memory block on codex path", async () => {
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-2" } },
    } as any);

    const { result } = buildHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "数据库查询优化",
        [],
        { skipPromptExpansion: true },
      );
    });

    const textArg = vi.mocked(sendUserMessage).mock.calls[0]?.[2] as string;
    expect(textArg.startsWith("<project-memory")).toBe(true);
    expect(textArg).toContain("数据库查询优化");
  });

  it("respects local switch_off", async () => {
    window.localStorage.setItem("projectMemory.contextInjectionEnabled", "false");
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-3" } },
    } as any);

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
});
