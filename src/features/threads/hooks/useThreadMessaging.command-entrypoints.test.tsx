// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem, WorkspaceInfo } from "../../../types";
import { useThreadMessaging } from "./useThreadMessaging";
import {
  engineSendMessage,
  getGitLog,
  getOpenCodeLspDocumentSymbols,
  getOpenCodeLspSymbols,
  getOpenCodeMcpStatus,
  getWorkspaceFiles,
  importOpenCodeSession,
  listGitBranches,
  listMcpServerStatus,
  startReview as startReviewService,
} from "../../../services/tauri";
import { getClientStoreSync } from "../../../services/clientStorage";

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  compactThreadContext: vi.fn(),
  sendUserMessage: vi.fn(),
  projectMemoryCaptureAuto: vi.fn(async () => null),
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
  getWorkspaceFiles: vi.fn(),
  shareOpenCodeSession: vi.fn(),
  listExternalSpecTree: vi.fn(),
  listGitBranches: vi.fn(),
  getGitLog: vi.fn(),
  listGeminiSessions: vi.fn(),
  engineSendMessage: vi.fn(),
  engineInterruptTurn: vi.fn(),
  engineInterrupt: vi.fn(),
}));

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

vi.mock("../../shared-session/runtime/sendSharedSessionTurn", () => ({
  sendSharedSessionTurn: vi.fn(),
}));

describe("useThreadMessaging command entrypoints", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "ccgui",
    path: "/tmp/mossx",
    connected: true,
    settings: { sidebarCollapsed: false },
  };
  const windowsWorkspace: WorkspaceInfo = {
    id: "ws-win",
    name: "ccgui-Win",
    path: "C:\\repo\\mossx",
    connected: true,
    settings: { sidebarCollapsed: false },
  };
  const noPathWorkspace: WorkspaceInfo = {
    id: "ws-nopath",
    name: "ccgui-NoPath",
    path: "",
    connected: true,
    settings: { sidebarCollapsed: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientStoreSync).mockReturnValue(undefined);
    vi.mocked(getWorkspaceFiles).mockResolvedValue({
      files: ["openspec/changes/add-spec-hub/proposal.md", "openspec/changes/add-spec-hub/tasks.md"],
      directories: ["openspec", "openspec/changes", "openspec/specs"],
      gitignored_files: [],
      gitignored_directories: [],
    });
    vi.mocked(listGitBranches).mockResolvedValue({
      branches: [
        { name: "main", lastCommit: 2000 },
        { name: "release/1.0", lastCommit: 1500 },
      ],
    });
    vi.mocked(getGitLog).mockResolvedValue({
      total: 2,
      ahead: 0,
      behind: 0,
      aheadEntries: [],
      behindEntries: [],
      upstream: "origin/main",
      entries: [
        { sha: "abc1234", summary: "fix dropdown", author: "chen", timestamp: 2000 },
        { sha: "def5678", summary: "refactor review", author: "chen", timestamp: 1500 },
      ],
    });
    vi.mocked(listMcpServerStatus).mockResolvedValue({ result: { data: [] } });
    vi.mocked(getOpenCodeMcpStatus).mockResolvedValue({ text: "No MCP servers configured" });
    vi.mocked(getOpenCodeLspSymbols).mockResolvedValue({ query: "Thread", result: [] });
    vi.mocked(importOpenCodeSession).mockResolvedValue({
      sessionId: "ses_test",
      source: "/tmp/session.json",
      output: "Imported session: ses_test",
    });
  });

  function makeHook(
    activeEngine: "claude" | "codex" | "gemini" | "opencode",
    overrides: {
      workspace?: WorkspaceInfo;
      activeThreadId?: string | null;
      ensuredThreadId?: string | null;
      itemsByThread?: Record<string, ConversationItem[]>;
      dispatch?: ReturnType<typeof vi.fn>;
      forkThreadForWorkspace?: ReturnType<typeof vi.fn>;
      resolveComposerSelection?: () => {
        id?: string | null;
        model: string | null;
        source?: string | null;
        effort: string | null;
        collaborationMode: Record<string, unknown> | null;
      };
      startThreadForWorkspace?: ReturnType<typeof vi.fn>;
      refreshThread?: ReturnType<typeof vi.fn>;
      threadEngineById?: Record<string, "claude" | "codex" | "gemini" | "opencode" | undefined>;
    } = {},
  ) {
    const activeThreadId =
      "activeThreadId" in overrides ? overrides.activeThreadId ?? null : "thread-1";
    const ensuredThreadId =
      "ensuredThreadId" in overrides ? overrides.ensuredThreadId ?? null : activeThreadId;
    const dispatch = overrides.dispatch ?? vi.fn();
    const startThreadForWorkspace =
      overrides.startThreadForWorkspace ?? vi.fn(async () => ensuredThreadId);
    const refreshThread = overrides.refreshThread ?? vi.fn(async () => null);

    const hook = renderHook(() =>
      useThreadMessaging({
        activeWorkspace: overrides.workspace ?? workspace,
        activeThreadId,
        accessMode: "current",
        model: null,
        effort: null,
        collaborationMode: null,
        steerEnabled: false,
        customPrompts: [],
        activeEngine,
        threadStatusById: {},
        itemsByThread: overrides.itemsByThread ?? {},
        activeTurnIdByThread: {},
        codexAcceptedTurnByThread: {},
        tokenUsageByThread: {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        interruptedThreadsRef: { current: new Set<string>() },
        dispatch,
        getCustomName: () => undefined,
        getThreadEngine: (_workspaceId, threadId) =>
          overrides.threadEngineById?.[threadId] ?? undefined,
        getThreadKind: (_workspaceId, threadId) =>
          threadId.startsWith("shared:") ? "shared" : "native",
        markProcessing: vi.fn(),
        markReviewing: vi.fn(),
        setActiveTurnId: vi.fn(),
        recordThreadActivity: vi.fn(),
        safeMessageActivity: vi.fn(),
        pushThreadErrorMessage: vi.fn(),
        ensureThreadForActiveWorkspace: async () => ensuredThreadId,
        ensureThreadForWorkspace: async () => ensuredThreadId,
        refreshThread,
        forkThreadForWorkspace: overrides.forkThreadForWorkspace ?? vi.fn(async () => null),
        updateThreadParent: vi.fn(),
        startThreadForWorkspace,
        resolveComposerSelection: overrides.resolveComposerSelection,
        onDebug: vi.fn(),
      }),
    );

    return { ...hook, dispatch, refreshThread, startThreadForWorkspace };
  }

  it("uses opencode MCP command path when engine is opencode", async () => {
    const { result } = makeHook("opencode");
    await act(async () => {
      await result.current.startMcp("/mcp");
    });
    expect(getOpenCodeMcpStatus).toHaveBeenCalledWith("ws-1");
  });

  it("opens review preset and supports base-branch/commit third-level steps", async () => {
    const { result } = makeHook("codex");

    await act(async () => {
      await result.current.startReview("/review");
    });

    await waitFor(() => {
      expect(result.current.reviewPrompt?.step).toBe("preset");
      expect(result.current.reviewPrompt?.isLoadingBranches).toBe(false);
      expect(result.current.reviewPrompt?.isLoadingCommits).toBe(false);
    });

    expect(result.current.reviewPrompt?.branches.length).toBeGreaterThan(0);
    expect(result.current.reviewPrompt?.commits.length).toBeGreaterThan(0);

    await act(async () => {
      result.current.choosePreset("baseBranch");
    });
    expect(result.current.reviewPrompt?.step).toBe("baseBranch");

    await act(async () => {
      result.current.showPresetStep();
      result.current.choosePreset("commit");
    });
    expect(result.current.reviewPrompt?.step).toBe("commit");
  });

  it("runs uncommitted preset directly without entering third-level list", async () => {
    const { result } = makeHook("codex");

    await act(async () => {
      await result.current.startReview("/review");
    });

    await waitFor(() => {
      expect(result.current.reviewPrompt?.step).toBe("preset");
    });

    await act(async () => {
      result.current.choosePreset("uncommitted");
    });

    await waitFor(() => {
      expect(startReviewService).toHaveBeenCalledWith(
        "ws-1",
        "thread-1",
        { type: "uncommittedChanges" },
        "inline",
      );
      expect(result.current.reviewPrompt).toBeNull();
    });
  });

  it("runs /review in claude thread via command passthrough instead of codex RPC", async () => {
    const { result } = makeHook("claude", {
      activeThreadId: "claude:session-1",
      ensuredThreadId: "claude:session-1",
      threadEngineById: {
        "claude:session-1": "claude",
      },
    });

    await act(async () => {
      await result.current.startReview("/review");
    });

    await waitFor(() => {
      expect(result.current.reviewPrompt?.step).toBe("preset");
    });

    await act(async () => {
      result.current.choosePreset("uncommitted");
    });

    await waitFor(() => {
      expect(engineSendMessage).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          engine: "claude",
          threadId: "claude:session-1",
          text: "/review",
        }),
      );
      expect(startReviewService).not.toHaveBeenCalled();
      expect(result.current.reviewPrompt).toBeNull();
    });
  });

  it("starts a Claude native fork with inherited composer model and effort", async () => {
    vi.mocked(engineSendMessage).mockResolvedValue({
      sessionId: "child-session-1",
      result: { turn: { id: "turn-1" }, sessionId: "child-session-1" },
    });
    const forkThreadForWorkspace = vi.fn(async () => "claude-fork:parent-session:local-1");
    const { result } = makeHook("claude", {
      activeThreadId: "claude:parent-session",
      ensuredThreadId: "claude:parent-session",
      threadEngineById: {
        "claude:parent-session": "claude",
        "claude-fork:parent-session:local-1": "claude",
      },
      forkThreadForWorkspace,
      resolveComposerSelection: () => ({
        id: "claude-opus-4-1",
        model: "claude-opus-4-1",
        source: "runtime",
        effort: "high",
        collaborationMode: null,
      }),
    });

    await act(async () => {
      await result.current.startFork("/fork 看到上下文没", {
        model: "claude-opus-4-1",
        effort: "high",
      });
    });

    expect(forkThreadForWorkspace).toHaveBeenCalledWith("ws-1", "claude:parent-session");
    expect(engineSendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        engine: "claude",
        threadId: "claude-fork:parent-session:local-1",
        text: "看到上下文没",
        model: "claude-opus-4-1",
        effort: "high",
        continueSession: false,
        sessionId: null,
        forkSessionId: "parent-session",
      }),
    );
  });

  it("ignores /review-like custom commands in review entrypoint", async () => {
    const { result } = makeHook("codex");

    await act(async () => {
      await result.current.startReview("/review-code run full check");
      await result.current.startReview("/review:custom run");
      await result.current.startReview("/review_custom run");
      await result.current.startReview("/review.custom run");
    });

    expect(result.current.reviewPrompt).toBeNull();
    expect(listGitBranches).not.toHaveBeenCalled();
    expect(getGitLog).not.toHaveBeenCalled();
    expect(startReviewService).not.toHaveBeenCalled();
    expect(engineSendMessage).not.toHaveBeenCalled();
  });

  it("rebinds /review to a codex thread when the active thread is claude", async () => {
    const startThreadForWorkspace = vi.fn(async () => "thread-review-1");
    const { result } = makeHook("codex", {
      activeThreadId: "claude:session-1",
      ensuredThreadId: "claude:session-1",
      threadEngineById: {
        "claude:session-1": "claude",
      },
      startThreadForWorkspace,
    });

    await act(async () => {
      await result.current.startReview("/review");
    });

    await waitFor(() => {
      expect(result.current.reviewPrompt?.step).toBe("preset");
    });

    await act(async () => {
      result.current.choosePreset("uncommitted");
    });

    await waitFor(() => {
      expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
        activate: true,
        engine: "codex",
      });
      expect(startReviewService).toHaveBeenCalledWith(
        "ws-1",
        "thread-review-1",
        { type: "uncommittedChanges" },
        "inline",
      );
      expect(result.current.reviewPrompt).toBeNull();
    });
  });

  it("retries /review on a new codex thread when backend rejects legacy thread id", async () => {
    vi.mocked(startReviewService)
      .mockResolvedValueOnce({
        error: {
          message:
            "invalid thread id: invalid character: expected an optional prefix of `urn:uuid:` followed by [0-9a-fA-F-], found `l` at 2",
        },
      } as never)
      .mockResolvedValueOnce({ result: { ok: true } } as never);
    const startThreadForWorkspace = vi.fn(async () => "thread-review-rebound");
    const { result } = makeHook("codex", {
      activeThreadId: "legacy-thread-id",
      ensuredThreadId: "legacy-thread-id",
      startThreadForWorkspace,
    });

    await act(async () => {
      await result.current.startReview("/review");
    });

    await waitFor(() => {
      expect(result.current.reviewPrompt?.step).toBe("preset");
    });

    await act(async () => {
      result.current.choosePreset("uncommitted");
    });

    await waitFor(() => {
      expect(startThreadForWorkspace).toHaveBeenCalledWith("ws-1", {
        activate: true,
        engine: "codex",
      });
      expect(startReviewService).toHaveBeenNthCalledWith(
        1,
        "ws-1",
        "legacy-thread-id",
        { type: "uncommittedChanges" },
        "inline",
      );
      expect(startReviewService).toHaveBeenNthCalledWith(
        2,
        "ws-1",
        "thread-review-rebound",
        { type: "uncommittedChanges" },
        "inline",
      );
      expect(result.current.reviewPrompt).toBeNull();
    });
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

  it("supports /lsp document-symbols with Windows absolute path", async () => {
    vi.mocked(getOpenCodeLspDocumentSymbols).mockResolvedValue({
      fileUri: "file:///C:/repo/mossx/src/main.ts",
      result: [],
    });
    const { result } = makeHook("opencode", {
      workspace: windowsWorkspace,
      activeThreadId: "opencode:ses-win",
      ensuredThreadId: "opencode:ses-win",
    });

    await act(async () => {
      await result.current.startLsp("/lsp document-symbols C:\\repo\\mossx\\src\\main.ts");
    });

    expect(getOpenCodeLspDocumentSymbols).toHaveBeenCalledWith(
      "ws-win",
      "file:///C:/repo/mossx/src/main.ts",
    );
  });

  it("supports /lsp document-symbols with Windows extended absolute path", async () => {
    vi.mocked(getOpenCodeLspDocumentSymbols).mockResolvedValue({
      fileUri: "file:///C:/repo/mossx/src/main.ts",
      result: [],
    });
    const { result } = makeHook("opencode", {
      workspace: windowsWorkspace,
      activeThreadId: "opencode:ses-win",
      ensuredThreadId: "opencode:ses-win",
    });

    await act(async () => {
      await result.current.startLsp("/lsp document-symbols \\\\?\\C:\\repo\\mossx\\src\\main.ts");
    });

    expect(getOpenCodeLspDocumentSymbols).toHaveBeenCalledWith(
      "ws-win",
      "file:///C:/repo/mossx/src/main.ts",
    );
  });

  it("supports /lsp document-symbols with Windows relative path", async () => {
    vi.mocked(getOpenCodeLspDocumentSymbols).mockResolvedValue({
      fileUri: "file:///C:/repo/mossx/src/main.ts",
      result: [],
    });
    const { result } = makeHook("opencode", {
      workspace: windowsWorkspace,
      activeThreadId: "opencode:ses-win",
      ensuredThreadId: "opencode:ses-win",
    });

    await act(async () => {
      await result.current.startLsp("/lsp document-symbols src/main.ts");
    });

    expect(getOpenCodeLspDocumentSymbols).toHaveBeenCalledWith(
      "ws-win",
      "file:///C:/repo/mossx/src/main.ts",
    );
  });

  it("keeps relative LSP document path when workspace path is empty", async () => {
    vi.mocked(getOpenCodeLspDocumentSymbols).mockResolvedValue({
      fileUri: "src/main.ts",
      result: [],
    });
    const { result } = makeHook("opencode", {
      workspace: noPathWorkspace,
      activeThreadId: "opencode:ses-no-path",
      ensuredThreadId: "opencode:ses-no-path",
    });

    await act(async () => {
      await result.current.startLsp("/lsp document-symbols src/main.ts");
    });

    expect(getOpenCodeLspDocumentSymbols).toHaveBeenCalledWith("ws-nopath", "src/main.ts");
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

  it("resumes explicit opencode session from /resume command", async () => {
    const dispatch = vi.fn();
    const refreshThread = vi.fn(async () => null);
    const { result } = makeHook("opencode", {
      dispatch,
      refreshThread,
      activeThreadId: "thread-1",
      ensuredThreadId: "thread-1",
      threadEngineById: {
        "thread-1": "opencode",
      },
    });

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
});
