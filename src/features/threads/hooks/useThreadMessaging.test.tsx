// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem, WorkspaceInfo } from "../../../types";
import { useThreadMessaging } from "./useThreadMessaging";
import {
  engineInterrupt,
  engineSendMessage,
  getOpenCodeLspDocumentSymbols,
  getOpenCodeLspSymbols,
  getOpenCodeMcpStatus,
  getWorkspaceFiles,
  importOpenCodeSession,
  interruptTurn,
  listExternalSpecTree,
  listMcpServerStatus,
  sendUserMessage,
} from "../../../services/tauri";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

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
  getWorkspaceFiles: vi.fn(),
  shareOpenCodeSession: vi.fn(),
  listExternalSpecTree: vi.fn(),
  engineSendMessage: vi.fn(),
  engineInterrupt: vi.fn(),
}));

vi.mock("../../../services/clientStorage", () => ({
  getClientStoreSync: vi.fn(),
  writeClientStoreValue: vi.fn(),
}));

describe("useThreadMessaging", () => {
  const workspace: WorkspaceInfo = {
    id: "ws-1",
    name: "MossX",
    path: "/tmp/mossx",
    connected: true,
    settings: { sidebarCollapsed: false },
  };
  const windowsWorkspace: WorkspaceInfo = {
    id: "ws-win",
    name: "MossX-Win",
    path: "C:\\repo\\mossx",
    connected: true,
    settings: { sidebarCollapsed: false },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClientStoreSync).mockReturnValue(undefined);
    vi.mocked(engineSendMessage).mockResolvedValue({
      result: { turn: { id: "turn-1" } },
    });
    vi.mocked(sendUserMessage).mockResolvedValue({
      result: { turn: { id: "turn-2" } },
    });
    vi.mocked(getOpenCodeMcpStatus).mockResolvedValue({ text: "No MCP servers configured" });
    vi.mocked(getWorkspaceFiles).mockResolvedValue({
      files: ["openspec/changes/add-spec-hub/proposal.md", "openspec/changes/add-spec-hub/tasks.md"],
      directories: ["openspec", "openspec/changes", "openspec/specs"],
      gitignored_files: [],
      gitignored_directories: [],
    });
    vi.mocked(listExternalSpecTree).mockResolvedValue({
      files: ["openspec/changes/add-spec-hub/proposal.md", "openspec/changes/add-spec-hub/tasks.md"],
      directories: ["openspec", "openspec/changes", "openspec/specs"],
      gitignored_files: [],
      gitignored_directories: [],
    });
    vi.mocked(listMcpServerStatus).mockResolvedValue({ result: { data: [] } });
    vi.mocked(getOpenCodeLspSymbols).mockResolvedValue({ query: "Thread", result: [] });
    vi.mocked(importOpenCodeSession).mockResolvedValue({
      sessionId: "ses_test",
      source: "/tmp/session.json",
      output: "Imported session: ses_test",
    });
    vi.mocked(engineInterrupt).mockResolvedValue();
    vi.mocked(interruptTurn).mockResolvedValue({});
    vi.mocked(writeClientStoreValue).mockImplementation(() => undefined);
  });

  function makeHook(
    activeEngine: "claude" | "codex" | "gemini" | "opencode",
    overrides: {
      workspace?: WorkspaceInfo;
      activeThreadId?: string;
      ensuredThreadId?: string;
      activeTurnIdByThread?: Record<string, string | null>;
      threadEngineById?: Record<string, "claude" | "codex" | "opencode" | undefined>;
      itemsByThread?: Record<string, ConversationItem[]>;
      autoNameThread?: ReturnType<typeof vi.fn>;
      startThreadForWorkspace?: ReturnType<typeof vi.fn>;
      dispatch?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const activeThreadId = overrides.activeThreadId ?? "thread-1";
    const ensuredThreadId = overrides.ensuredThreadId ?? activeThreadId;

    const startThreadForWorkspace =
      overrides.startThreadForWorkspace ??
      vi.fn(async () => ensuredThreadId);

    return renderHook(() =>
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
        activeTurnIdByThread: overrides.activeTurnIdByThread ?? {},
        rateLimitsByWorkspace: {},
        pendingInterruptsRef: { current: new Set<string>() },
        interruptedThreadsRef: { current: new Set<string>() },
        dispatch: overrides.dispatch ?? vi.fn(),
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

  it("passes custom spec root through cli engine send when configured", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });
    const { result } = makeHook("opencode");

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "opencode-pending-abc", "hello");
    });

    expect(engineSendMessage).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        customSpecRoot: "/tmp/external-openspec",
      }),
    );
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
        itemsByThread: {},
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

  it("passes custom spec root through codex send when configured", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });

    const { result } = makeHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "hello codex");
    });

    const calls = vi.mocked(sendUserMessage).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const latestCall = calls[calls.length - 1];
    expect(latestCall?.[0]).toBe("ws-1");
    expect(latestCall?.[1]).toBe("thread-1");
    expect(latestCall?.[2]).toContain("[Spec Root Priority]");
    expect(latestCall?.[2]).toContain("/tmp/external-openspec");
    expect(latestCall?.[2]).toContain("[User Input] hello codex");
    expect(latestCall?.[3]).toEqual(
      expect.objectContaining({
        customSpecRoot: "/tmp/external-openspec",
      }),
    );
  });

  it("normalizes file URI custom spec root before codex send", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "file:///tmp/external-openspec";
      }
      return undefined;
    });

    const { result } = makeHook("codex");

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "hello codex");
    });

    const calls = vi.mocked(sendUserMessage).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const latestCall = calls[calls.length - 1];
    expect(latestCall?.[3]).toEqual(
      expect.objectContaining({
        customSpecRoot: "/tmp/external-openspec",
      }),
    );
  });

  it("injects a collapsible external spec card on first codex turn", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });
    const dispatch = vi.fn();
    const { result } = makeHook("codex", { dispatch, itemsByThread: {} });

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "hello codex");
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsertItem",
        threadId: "thread-1",
        item: expect.objectContaining({
          id: "spec-root-context-thread-1",
          kind: "explore",
          collapsible: true,
          mergeKey: "spec-root-context",
        }),
      }),
    );
  });

  it("does not inject external spec card when thread already has items", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });
    const dispatch = vi.fn();
    const { result } = makeHook("codex", {
      dispatch,
      itemsByThread: {
        "thread-1": [{ id: "existing-user", kind: "message", role: "user", text: "existing" }],
      },
    });

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "hello codex");
    });

    expect(
      dispatch.mock.calls.some(
        ([action]) =>
          action &&
          typeof action === "object" &&
          "item" in action &&
          (action as { item?: { id?: string } }).item?.id === "spec-root-context-thread-1",
      ),
    ).toBe(false);
  });

  it("records visible probe status without repair actions in spec context card", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });
    vi.mocked(listExternalSpecTree).mockResolvedValue({
      files: ["openspec/changes/add-spec-hub/proposal.md", "openspec/changes/add-spec-hub/tasks.md"],
      directories: ["openspec", "openspec/changes", "openspec/specs"],
      gitignored_files: [],
      gitignored_directories: [],
    });
    const dispatch = vi.fn();
    const { result } = makeHook("codex", { dispatch, itemsByThread: {} });

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "hello codex");
    });

    const upsertCall = dispatch.mock.calls.find(
      ([action]) =>
        action &&
        typeof action === "object" &&
        "type" in action &&
        (action as { type?: string }).type === "upsertItem" &&
        "item" in action &&
        (action as { item?: { id?: string } }).item?.id === "spec-root-context-thread-1",
    );
    expect(upsertCall).toBeDefined();

    const action = upsertCall?.[0] as {
      item?: { entries?: Array<{ label?: string; detail?: string }> };
    };
    const entries = action.item?.entries ?? [];
    expect(entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Probe status", detail: "visible" })]),
    );
    expect(entries.some((entry) => entry.label === "/spec-root rebind")).toBe(false);
    expect(entries.some((entry) => entry.label === "/spec-root default")).toBe(false);
  });

  it("records malformed probe status and repair actions in spec context card", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });
    vi.mocked(listExternalSpecTree).mockResolvedValue({
      files: ["openspec/changes/add-spec-hub/proposal.md"],
      directories: ["openspec", "openspec/changes"],
      gitignored_files: [],
      gitignored_directories: [],
    });
    const dispatch = vi.fn();
    const { result } = makeHook("codex", { dispatch, itemsByThread: {} });

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "hello codex");
    });

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsertItem",
        threadId: "thread-1",
        item: expect.objectContaining({
          id: "spec-root-context-thread-1",
          kind: "explore",
          entries: expect.arrayContaining([
            expect.objectContaining({ label: "Probe status", detail: "malformed" }),
            expect.objectContaining({ label: "/spec-root rebind" }),
            expect.objectContaining({ label: "/spec-root default" }),
          ]),
        }),
      }),
    );
  });

  it("updates spec root context to visible after /spec-root rebind succeeds", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });
    vi.mocked(listExternalSpecTree)
      .mockResolvedValueOnce({
        files: ["openspec/changes/add-spec-hub/proposal.md"],
        directories: ["openspec", "openspec/changes"],
        gitignored_files: [],
        gitignored_directories: [],
      })
      .mockResolvedValueOnce({
        files: ["openspec/changes/add-spec-hub/proposal.md", "openspec/changes/add-spec-hub/tasks.md"],
        directories: ["openspec", "openspec/changes", "openspec/specs"],
        gitignored_files: [],
        gitignored_directories: [],
      });

    const dispatch = vi.fn();
    const { result } = makeHook("codex", { dispatch, itemsByThread: {} });

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "hello codex");
    });
    await act(async () => {
      await result.current.startSpecRoot("/spec-root rebind");
    });

    const upsertCalls = dispatch.mock.calls.filter(
      ([action]) =>
        action &&
        typeof action === "object" &&
        "type" in action &&
        (action as { type?: string }).type === "upsertItem" &&
        "item" in action &&
        (action as { item?: { id?: string } }).item?.id === "spec-root-context-thread-1",
    );
    expect(upsertCalls.length).toBeGreaterThanOrEqual(2);

    const latestUpsert = upsertCalls[upsertCalls.length - 1]?.[0] as {
      item?: { entries?: Array<{ label?: string; detail?: string }> };
    };
    const latestEntries = latestUpsert.item?.entries ?? [];
    expect(latestEntries).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Probe status", detail: "visible" })]),
    );
    expect(latestEntries.some((entry) => entry.label === "/spec-root rebind")).toBe(false);
    expect(latestEntries.some((entry) => entry.label === "/spec-root default")).toBe(false);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "addAssistantMessage",
        threadId: "thread-1",
        text: expect.stringContaining("Action: rebind"),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "addAssistantMessage",
        threadId: "thread-1",
        text: expect.stringContaining("Status: visible"),
      }),
    );
  });

  it("supports /spec-root default command and writes workspace spec root back to default", async () => {
    vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
      if (key === "specHub.specRoot.ws-1") {
        return "/tmp/external-openspec";
      }
      return undefined;
    });
    const dispatch = vi.fn();
    const { result } = makeHook("codex", { dispatch });

    await act(async () => {
      await result.current.startSpecRoot("/spec-root default");
    });

    expect(writeClientStoreValue).toHaveBeenCalledWith("app", "specHub.specRoot.ws-1", null);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "addAssistantMessage",
        threadId: "thread-1",
        text: expect.stringContaining("Action: default"),
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
        itemsByThread: {},
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
