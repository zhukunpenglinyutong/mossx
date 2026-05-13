// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConversationItem,
  RateLimitSnapshot,
  WorkspaceInfo,
} from "../../../types";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";
import {
  getWorkspaceFiles,
  listExternalSpecTree,
  sendUserMessage,
} from "../../../services/tauri";
import { useThreadMessaging } from "./useThreadMessaging";

vi.mock("../../../services/toasts", () => ({
  pushErrorToast: vi.fn(),
}));

vi.mock("../../../services/tauri", () => ({
  compactThreadContext: vi.fn(),
  sendUserMessage: vi.fn(),
  projectMemoryCaptureAuto: vi.fn(async () => null),
  projectMemoryCaptureTurnInput: vi.fn(async () => null),
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

const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "ccgui",
  path: "/tmp/mossx",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const visibleSpecTree = {
  files: [
    "openspec/changes/add-spec-hub/proposal.md",
    "openspec/changes/add-spec-hub/tasks.md",
  ],
  directories: ["openspec", "openspec/changes", "openspec/specs"],
  gitignored_files: [],
  gitignored_directories: [],
};

type HookOverrides = {
  accessMode?: "default" | "read-only" | "current" | "full-access";
  dispatch?: ReturnType<typeof vi.fn>;
  effort?: string | null;
  itemsByThread?: Record<string, ConversationItem[]>;
  model?: string | null;
  rateLimitsByWorkspace?: Record<string, RateLimitSnapshot | null>;
};

function mockWorkspaceSpecRoot(rootPath: string | null) {
  vi.mocked(getClientStoreSync).mockImplementation((_store, key) => {
    if (key === "specHub.specRoot.ws-1") {
      return rootPath;
    }
    return undefined;
  });
}

function makeCodexHook(overrides: HookOverrides = {}) {
  const dispatch = overrides.dispatch ?? vi.fn();
  const ensureThreadForActiveWorkspace = vi.fn(async () => "thread-1");

  const hook = renderHook(() =>
    useThreadMessaging({
      activeWorkspace: workspace,
      activeThreadId: "thread-1",
      accessMode: overrides.accessMode ?? "current",
      model: overrides.model ?? null,
      effort: overrides.effort ?? null,
      collaborationMode: null,
      steerEnabled: false,
      customPrompts: [],
      activeEngine: "codex",
      threadStatusById: {},
      itemsByThread: overrides.itemsByThread ?? {},
      activeTurnIdByThread: {},
      codexAcceptedTurnByThread: {},
      tokenUsageByThread: {},
      rateLimitsByWorkspace: overrides.rateLimitsByWorkspace ?? {},
      pendingInterruptsRef: { current: new Set<string>() },
      interruptedThreadsRef: { current: new Set<string>() },
      dispatch,
      getCustomName: () => undefined,
      getThreadEngine: () => "codex",
      getThreadKind: () => "native",
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
      onDebug: vi.fn(),
    }),
  );

  return { ...hook, dispatch, ensureThreadForActiveWorkspace };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClientStoreSync).mockReturnValue(undefined);
  vi.mocked(writeClientStoreValue).mockImplementation(() => undefined);
  vi.mocked(sendUserMessage).mockResolvedValue({
    result: { turn: { id: "turn-1" } },
  });
  vi.mocked(getWorkspaceFiles).mockResolvedValue(visibleSpecTree);
  vi.mocked(listExternalSpecTree).mockResolvedValue(visibleSpecTree);
});

describe("useThreadMessaging spec root", () => {
  it("passes custom spec root through codex send when configured", async () => {
    mockWorkspaceSpecRoot("/tmp/external-openspec");

    const { result } = makeCodexHook();

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

  it("does not prepend spec root hint after first codex turn when thread already has items", async () => {
    mockWorkspaceSpecRoot("/tmp/external-openspec");

    const { result } = makeCodexHook({
      itemsByThread: {
        "thread-1": [
          { id: "existing-user", kind: "message", role: "user", text: "existing" },
        ],
      },
    });

    await act(async () => {
      await result.current.sendUserMessageToThread(workspace, "thread-1", "follow up");
    });

    const calls = vi.mocked(sendUserMessage).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const latestCall = calls[calls.length - 1];
    expect(latestCall?.[2]).toBe("follow up");
    expect(latestCall?.[2]).not.toContain("[Spec Root Priority]");
    expect(latestCall?.[2]).not.toContain("[Session Spec Link]");
    expect(latestCall?.[3]).toEqual(
      expect.objectContaining({
        customSpecRoot: "/tmp/external-openspec",
      }),
    );
  });

  it("normalizes file URI custom spec root before codex send", async () => {
    mockWorkspaceSpecRoot("file:///tmp/external-openspec");

    const { result } = makeCodexHook();

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
    mockWorkspaceSpecRoot("/tmp/external-openspec");
    const dispatch = vi.fn();
    const { result } = makeCodexHook({ dispatch, itemsByThread: {} });

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
    mockWorkspaceSpecRoot("/tmp/external-openspec");
    const dispatch = vi.fn();
    const { result } = makeCodexHook({
      dispatch,
      itemsByThread: {
        "thread-1": [
          { id: "existing-user", kind: "message", role: "user", text: "existing" },
        ],
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
    mockWorkspaceSpecRoot("/tmp/external-openspec");
    vi.mocked(listExternalSpecTree).mockResolvedValue(visibleSpecTree);
    const dispatch = vi.fn();
    const { result } = makeCodexHook({ dispatch, itemsByThread: {} });

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
      expect.arrayContaining([
        expect.objectContaining({ label: "Probe status", detail: "visible" }),
      ]),
    );
    expect(entries.some((entry) => entry.label === "/spec-root rebind")).toBe(false);
    expect(entries.some((entry) => entry.label === "/spec-root default")).toBe(false);
  });

  it("records malformed probe status and repair actions in spec context card", async () => {
    mockWorkspaceSpecRoot("/tmp/external-openspec");
    vi.mocked(listExternalSpecTree).mockResolvedValue({
      files: ["openspec/changes/add-spec-hub/proposal.md"],
      directories: ["openspec", "openspec/changes"],
      gitignored_files: [],
      gitignored_directories: [],
    });
    const dispatch = vi.fn();
    const { result } = makeCodexHook({ dispatch, itemsByThread: {} });

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
    mockWorkspaceSpecRoot("/tmp/external-openspec");
    vi.mocked(listExternalSpecTree)
      .mockResolvedValueOnce({
        files: ["openspec/changes/add-spec-hub/proposal.md"],
        directories: ["openspec", "openspec/changes"],
        gitignored_files: [],
        gitignored_directories: [],
      })
      .mockResolvedValueOnce(visibleSpecTree);

    const dispatch = vi.fn();
    const { result } = makeCodexHook({ dispatch, itemsByThread: {} });

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
      expect.arrayContaining([
        expect.objectContaining({ label: "Probe status", detail: "visible" }),
      ]),
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
    mockWorkspaceSpecRoot("/tmp/external-openspec");
    const dispatch = vi.fn();
    const { result } = makeCodexHook({ dispatch });

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
});

describe("useThreadMessaging status", () => {
  it("formats /status output with CLI-aligned labels and remaining limits", async () => {
    const dispatch = vi.fn();
    const { result } = makeCodexHook({
      accessMode: "full-access",
      dispatch,
      effort: "medium",
      model: "gpt-5.3-codex",
      rateLimitsByWorkspace: {
        [workspace.id]: {
          primary: { usedPercent: 15, windowDurationMins: 300, resetsAt: null },
          secondary: { usedPercent: 65, windowDurationMins: 10080, resetsAt: null },
          credits: null,
          planType: null,
        },
      },
    });

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
