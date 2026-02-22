// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useThreadMessaging } from "./useThreadMessaging";
import {
  engineInterrupt,
  engineSendMessage,
  getOpenCodeLspSymbols,
  getOpenCodeMcpStatus,
  importOpenCodeSession,
  interruptTurn,
  listMcpServerStatus,
  sendUserMessage,
} from "../../../services/tauri";

vi.mock("../../../services/tauri", () => ({
  sendUserMessage: vi.fn(),
  startReview: vi.fn(),
  interruptTurn: vi.fn(),
  listMcpServerStatus: vi.fn(),
  getOpenCodeMcpStatus: vi.fn(),
  getOpenCodeLspDiagnostics: vi.fn(),
  getOpenCodeLspSymbols: vi.fn(),
  getOpenCodeLspDocumentSymbols: vi.fn(),
  importOpenCodeSession: vi.fn(),
  exportOpenCodeSession: vi.fn(),
  getOpenCodeStats: vi.fn(),
  shareOpenCodeSession: vi.fn(),
  engineSendMessage: vi.fn(),
  engineInterrupt: vi.fn(),
}));

describe("useThreadMessaging", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "CodeMoss",
    path: "/tmp/codemoss",
    connected: true,
    settings: { sidebarCollapsed: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(engineSendMessage).mockResolvedValue({
      result: { turn: { id: "turn-1" } },
    });
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-2" } },
    });
    vi.mocked(getOpenCodeMcpStatus).mockResolvedValue({ text: "No MCP servers configured" });
    vi.mocked(listMcpServerStatus).mockResolvedValue({ result: { data: [] } });
    vi.mocked(getOpenCodeLspSymbols).mockResolvedValue({ query: "Thread", result: [] });
    vi.mocked(importOpenCodeSession).mockResolvedValue({
      sessionId: "ses_test",
      source: "/tmp/session.json",
      output: "Imported session: ses_test",
    });
    vi.mocked(engineInterrupt).mockResolvedValue();
    vi.mocked(interruptTurn).mockResolvedValue({});
  });

  function makeHook(
    activeEngine: "claude" | "codex" | "gemini" | "opencode",
    overrides: {
      activeThreadId?: string;
      ensuredThreadId?: string;
      activeTurnIdByThread?: Record<string, string | null>;
      threadEngineById?: Record<string, "claude" | "codex" | "opencode" | undefined>;
      autoNameThread?: ReturnType<typeof vi.fn>;
      startThreadForWorkspace?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const activeThreadId = overrides.activeThreadId ?? "thread-1";
    const ensuredThreadId = overrides.ensuredThreadId ?? activeThreadId;

    const startThreadForWorkspace =
      overrides.startThreadForWorkspace ??
      vi.fn(async () => ensuredThreadId);

    return renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId,
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        steerEnabled: false,
        customPrompts: [],
        activeEngine,
        threadStatusById: {},
        activeTurnIdByThread: overrides.activeTurnIdByThread ?? {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        interruptedThreadsRef: { current: new Set<string>() },
        dispatch: vi.fn(),
        getCustomName: () => undefined,
        getThreadEngine: (_workspaceId, threadId) =>
          overrides.threadEngineById?.[threadId] ?? undefined,
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: async () => ensuredThreadId,
        ensureThreadForWorkspace: async () => ensuredThreadId,
        refreshThread: async () => null,
        forkThreadForWorkspace: async () => null,
        updateThreadParent: vi.fn(),
        startThreadForWorkspace,
        autoNameThread: overrides.autoNameThread,
        onDebug: vi.fn(),
      }),
    );
  }

  it("routes opencode thread through engineSendMessage", async () => {
    const { result } = makeHook("opencode");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "opencode-pending-abc",
        "hello opencode",
      );
    });

    expect(engineSendMessage).toHaveBeenCalledTimes(1);
    expect(engineSendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ engine: "opencode" }),
    );
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("sanitizes leaked claude model for opencode", async () => {
    const { result } = makeHook("opencode");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "opencode-pending-abc",
        "hello opencode",
        [],
        { model: "claude-sonnet-4-5" },
      );
    });

    expect(engineSendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        model: "openai/gpt-5.3-codex",
      }),
    );
  });

  it("does not trigger auto title generation for opencode", async () => {
    const autoNameThread = vi.fn().mockResolvedValue(null);
    const { result } = makeHook("opencode", { autoNameThread });

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "opencode-pending-abc",
        "hello opencode",
      );
    });

    expect(engineSendMessage).toHaveBeenCalledTimes(1);
    expect(autoNameThread).not.toHaveBeenCalled();
  });

  it("routes by thread ownership when active engine mismatches", async () => {
    const { result } = makeHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "opencode-pending-abc",
        "hello opencode",
      );
    });

    expect(engineSendMessage).toHaveBeenCalledTimes(1);
    expect(engineSendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ engine: "opencode" }),
    );
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it("uses opencode MCP command path when engine is opencode", async () => {
    const { result } = makeHook("opencode");
    await act(async () => {
      await result.current.startMcp("/mcp");
    });
    expect(getOpenCodeMcpStatus).toHaveBeenCalledWith("ws-1");
  });

  it("uses thread engine for MCP command path when active engine mismatches", async () => {
    const { result } = makeHook("codex", {
      activeThreadId: "opencode:session-1",
      ensuredThreadId: "opencode:session-1",
    });

    await act(async () => {
      await result.current.startMcp("/mcp");
    });

    expect(getOpenCodeMcpStatus).toHaveBeenCalledWith("ws-1");
    expect(listMcpServerStatus).not.toHaveBeenCalled();
  });

  it("supports /lsp symbols command on opencode", async () => {
    const { result } = makeHook("opencode");
    await act(async () => {
      await result.current.startLsp("/lsp symbols Thread");
    });
    expect(getOpenCodeLspSymbols).toHaveBeenCalledWith("ws-1", "Thread");
  });

  it("supports /lsp symbols based on thread ownership when active engine mismatches", async () => {
    const { result } = makeHook("codex", {
      activeThreadId: "opencode:session-1",
      ensuredThreadId: "opencode:session-1",
    });

    await act(async () => {
      await result.current.startLsp("/lsp symbols Thread");
    });

    expect(getOpenCodeLspSymbols).toHaveBeenCalledWith("ws-1", "Thread");
  });

  it("supports /import command on opencode", async () => {
    const { result } = makeHook("opencode");
    await act(async () => {
      await result.current.startImport("/import /tmp/session.json");
    });
    expect(importOpenCodeSession).toHaveBeenCalledWith("ws-1", "/tmp/session.json");
  });

  it("interrupt routes codex thread through daemon rpc even when active engine is opencode", async () => {
    const { result } = makeHook("opencode", {
      activeThreadId: "thread-1",
      ensuredThreadId: "thread-1",
      activeTurnIdByThread: { "thread-1": "turn-1" },
      threadEngineById: { "thread-1": "codex" },
    });

    await act(async () => {
      await result.current.interruptTurn();
    });

    expect(interruptTurn).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");
    expect(engineInterrupt).toHaveBeenCalledWith("ws-1");
  });

  it("interrupt routes opencode thread through engine interrupt only", async () => {
    const { result } = makeHook("codex", {
      activeThreadId: "opencode:session-1",
      ensuredThreadId: "opencode:session-1",
      activeTurnIdByThread: { "opencode:session-1": "turn-9" },
    });

    await act(async () => {
      await result.current.interruptTurn();
    });

    expect(engineInterrupt).toHaveBeenCalledWith("ws-1");
    expect(interruptTurn).not.toHaveBeenCalled();
  });

  it("creates new opencode pending thread when active thread id is not opencode-prefixed", async () => {
    const startThreadForWorkspace = vi.fn(async () => "opencode-pending-new");
    const { result } = makeHook("opencode", {
      activeThreadId: "thread-legacy",
      ensuredThreadId: "thread-legacy",
      threadEngineById: { "thread-legacy": "opencode" },
      startThreadForWorkspace,
    });

    await act(async () => {
      await result.current.sendUserMessage("hello");
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
      activate: true,
      engine: "opencode",
    });
    expect(engineSendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        engine: "opencode",
        threadId: "opencode-pending-new",
      }),
    );
  });

  it("resumes explicit opencode session from /resume command", async () => {
    const dispatch = vi.fn();
    const refreshThread = vi.fn(async () => null);
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        steerEnabled: false,
        customPrompts: [],
        activeEngine: "opencode",
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        interruptedThreadsRef: { current: new Set<string>() },
        dispatch,
        getCustomName: () => undefined,
        getThreadEngine: () => "opencode",
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: async () => "thread-1",
        ensureThreadForWorkspace: async () => "thread-1",
        refreshThread,
        forkThreadForWorkspace: async () => null,
        updateThreadParent: vi.fn(),
        startThreadForWorkspace: vi.fn(async () => "thread-1"),
        autoNameThread: vi.fn(),
        onDebug: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startResume("/resume ses_from_panel");
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setActiveThreadId",
        threadId: "opencode:ses_from_panel",
      }),
    );
    expect(refreshThread).toHaveBeenCalledWith("ws-1", "opencode:ses_from_panel");
  });

  it("passes selected collaboration mode payload through codex send", async () => {
    const { result } = makeHook("codex");
    const collaborationMode = {
      mode: "plan",
      settings: {
        model: "openai/gpt-5.3-codex",
        reasoning_effort: "medium",
      },
    };

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-1",
        "hello codex",
        [],
        { collaborationMode },
      );
    });

    expect(sendUserMessage).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "hello codex",
      expect.objectContaining({
        collaborationMode: expect.objectContaining({
          mode: "plan",
        }),
      }),
    );
  });

  it("formats /status output with CLI-aligned labels and remaining limits", async () => {
    const dispatch = vi.fn();
    const ensureThreadForActiveWorkspace = vi.fn(async () => "thread-1");
    const { result } = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: workspace,
        activeThreadId: "thread-1",
        accessMode: "full-access",
        model: "gpt-5.3-codex",
        effort: "medium",
        collaborationMode: null,
        steerEnabled: false,
        customPrompts: [],
        activeEngine: "codex",
        threadStatusById: {},
        activeTurnIdByThread: {},
        rateLimitsByWorkspace: {
          [workspace.id]: {
            primary: { usedPercent: 15, windowDurationMins: 300, resetsAt: null },
            secondary: { usedPercent: 65, windowDurationMins: 10080, resetsAt: null },
            credits: null,
            planType: null,
          },
        },
        pendingInterruptsRef: { current: new Set<string>() },
        interruptedThreadsRef: { current: new Set<string>() },
        dispatch,
        getCustomName: () => undefined,
        getThreadEngine: () => "codex",
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace,
        ensureThreadForWorkspace: async () => "thread-1",
        refreshThread: async () => null,
        forkThreadForWorkspace: async () => null,
        updateThreadParent: vi.fn(),
        startThreadForWorkspace: vi.fn(async () => "thread-1"),
        autoNameThread: vi.fn(),
        onDebug: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.startStatus("/status");
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "addAssistantMessage",
        threadId: "thread-1",
        text: expect.stringContaining("OpenAI Codex"),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Permissions:        Full Access"),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("5h limit: 85% left"),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Weekly limit: 35% left"),
      }),
    );
  });
});
