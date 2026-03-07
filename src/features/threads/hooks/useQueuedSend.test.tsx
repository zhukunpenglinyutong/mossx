// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "../../../types";
import { useQueuedSend } from "./useQueuedSend";

const workspace: WorkspaceInfo = {
  id: "workspace-1",
  name: "MossX",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

const makeOptions = (
  overrides: Partial<Parameters<typeof useQueuedSend>[0]> = {},
) => ({
  activeThreadId: "thread-1",
  isProcessing: false,
  isReviewing: false,
  steerEnabled: false,
  activeWorkspace: workspace,
  connectWorkspace: vi.fn().mockResolvedValue(undefined),
  startThreadForWorkspace: vi.fn().mockResolvedValue("thread-1"),
  sendUserMessage: vi.fn().mockResolvedValue(undefined),
  sendUserMessageToThread: vi.fn().mockResolvedValue(undefined),
  startFork: vi.fn().mockResolvedValue(undefined),
  startReview: vi.fn().mockResolvedValue(undefined),
  startResume: vi.fn().mockResolvedValue(undefined),
  startMcp: vi.fn().mockResolvedValue(undefined),
  startSpecRoot: vi.fn().mockResolvedValue(undefined),
  startStatus: vi.fn().mockResolvedValue(undefined),
  startExport: vi.fn().mockResolvedValue(undefined),
  startImport: vi.fn().mockResolvedValue(undefined),
  startLsp: vi.fn().mockResolvedValue(undefined),
  startShare: vi.fn().mockResolvedValue(undefined),
  startFast: vi.fn().mockResolvedValue(undefined),
  startMode: vi.fn().mockResolvedValue(undefined),
  setCodexCollaborationMode: vi.fn(),
  clearActiveImages: vi.fn(),
  ...overrides,
});

describe("useQueuedSend", () => {
  it("sends queued messages one at a time after processing completes", async () => {
    const options = makeOptions();
    const { result, rerender } = renderHook(
      (props) => useQueuedSend(props),
      { initialProps: options },
    );

    await act(async () => {
      await result.current.queueMessage("First");
      await result.current.queueMessage("Second");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("First", []);

    await act(async () => {
      rerender({ ...options, isProcessing: true });
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      rerender({ ...options, isProcessing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(options.sendUserMessage).toHaveBeenLastCalledWith("Second", []);
  });

  it("waits for processing to start before sending the next queued message", async () => {
    const options = makeOptions();
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Alpha");
      await result.current.queueMessage("Beta");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Alpha", []);
  });

  it("queues send while processing when steer is disabled", async () => {
    const options = makeOptions({ isProcessing: true, steerEnabled: false });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Queued");
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(1);
    expect(result.current.activeQueue[0]?.text).toBe("Queued");
  });

  it("sends immediately while processing when steer is enabled", async () => {
    const options = makeOptions({ isProcessing: true, steerEnabled: true });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Steer");
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Steer", []);
    expect(result.current.activeQueue).toHaveLength(0);
  });

  it("retries queued send after failure", async () => {
    const options = makeOptions({
      sendUserMessage: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(undefined),
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Retry");
    });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(options.sendUserMessage).toHaveBeenLastCalledWith("Retry", []);
  });

  it("queues messages per thread and only flushes the active thread", async () => {
    const options = makeOptions({ isProcessing: true });
    const { result, rerender } = renderHook(
      (props) => useQueuedSend(props),
      { initialProps: options },
    );

    await act(async () => {
      await result.current.queueMessage("Thread-1");
    });

    await act(async () => {
      rerender({ ...options, activeThreadId: "thread-2", isProcessing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...options, activeThreadId: "thread-1", isProcessing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Thread-1", []);
  });

  it("connects workspace before sending when disconnected", async () => {
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({
      activeWorkspace: { ...workspace, connected: false },
      connectWorkspace,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Connect");
    });

    expect(connectWorkspace).toHaveBeenCalledWith({
      ...workspace,
      connected: false,
    });
    expect(options.sendUserMessage).toHaveBeenCalledWith("Connect", []);
  });

  it("ignores images for queued review messages and blocks while reviewing", async () => {
    const options = makeOptions();
    const { result, rerender } = renderHook(
      (props) => useQueuedSend(props),
      { initialProps: options },
    );

    await act(async () => {
      await result.current.queueMessage("/review check this", ["img-1"]);
      await result.current.queueMessage("After review");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.startReview).toHaveBeenCalledTimes(1);
    expect(options.startReview).toHaveBeenCalledWith("/review check this");
    expect(options.sendUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...options, isReviewing: true });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ ...options, isReviewing: false });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("After review", []);
  });

  it("starts a new thread for /new and sends the remaining text there", async () => {
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-2");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startThreadForWorkspace, sendUserMessageToThread });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/new hello there", ["img-1"]);
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("workspace-1", {
      engine: "claude",
    });
    expect(sendUserMessageToThread).toHaveBeenCalledWith(
      workspace,
      "thread-2",
      "hello there",
      [],
    );
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("starts a new thread for bare /new without sending a message", async () => {
    const startThreadForWorkspace = vi.fn().mockResolvedValue("thread-3");
    const sendUserMessageToThread = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startThreadForWorkspace, sendUserMessageToThread });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/new");
    });

    expect(startThreadForWorkspace).toHaveBeenCalledWith("workspace-1", {
      engine: "claude",
    });
    expect(sendUserMessageToThread).not.toHaveBeenCalled();
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /status to the local status handler", async () => {
    const startStatus = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startStatus });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/status now", ["img-1"]);
    });

    expect(startStatus).toHaveBeenCalledWith("/status now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("switches to plan mode and sends remaining text for codex /plan", async () => {
    const setCodexCollaborationMode = vi.fn();
    const options = makeOptions({
      activeEngine: "codex",
      setCodexCollaborationMode,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/plan 请先分析");
    });

    expect(setCodexCollaborationMode).toHaveBeenCalledWith("plan");
    expect(options.sendUserMessage).toHaveBeenCalledWith(
      "请先分析",
      [],
      expect.objectContaining({
        collaborationMode: expect.objectContaining({
          mode: "plan",
        }),
      }),
    );
  });

  it("switches to default mode for codex /default and /code alias", async () => {
    const setCodexCollaborationMode = vi.fn();
    const options = makeOptions({
      activeEngine: "codex",
      setCodexCollaborationMode,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/default");
      await result.current.handleSend("/code");
    });

    expect(setCodexCollaborationMode).toHaveBeenNthCalledWith(1, "code");
    expect(setCodexCollaborationMode).toHaveBeenNthCalledWith(2, "code");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /mode to local mode handler in codex", async () => {
    const startMode = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({
      activeEngine: "codex",
      startMode,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/mode");
    });

    expect(startMode).toHaveBeenCalledWith("/mode");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /fast as codex command and strips images", async () => {
    const startFast = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({
      activeEngine: "codex",
      startFast,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/fast on", ["img-1"]);
    });

    expect(startFast).toHaveBeenCalledWith("/fast on");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes implicit current-mode question to local mode handler in codex", async () => {
    const startMode = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({
      activeEngine: "codex",
      startMode,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("现在是什么模式 是计划模式吗");
    });

    expect(startMode).toHaveBeenCalledWith("现在是什么模式 是计划模式吗");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not treat mode-difference question as implicit mode query", async () => {
    const startMode = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({
      activeEngine: "codex",
      startMode,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("计划模式和default模式区别多大");
    });

    expect(startMode).not.toHaveBeenCalled();
    expect(options.sendUserMessage).toHaveBeenCalledWith(
      "计划模式和default模式区别多大",
      [],
    );
  });

  it("treats codex-only slash commands as plain text on non-codex engines", async () => {
    const startMode = vi.fn().mockResolvedValue(undefined);
    const setCodexCollaborationMode = vi.fn();
    const options = makeOptions({
      activeEngine: "claude",
      startMode,
      setCodexCollaborationMode,
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/plan keep text", ["img-1"]);
      await result.current.handleSend("/mode", ["img-2"]);
      await result.current.handleSend("/fast on", ["img-3"]);
    });

    expect(options.sendUserMessage).toHaveBeenNthCalledWith(
      1,
      "/plan keep text",
      ["img-1"],
    );
    expect(options.sendUserMessage).toHaveBeenNthCalledWith(
      2,
      "/mode",
      ["img-2"],
    );
    expect(options.sendUserMessage).toHaveBeenNthCalledWith(
      3,
      "/fast on",
      ["img-3"],
    );
    expect(startMode).not.toHaveBeenCalled();
    expect(setCodexCollaborationMode).not.toHaveBeenCalled();
  });

  it("routes /spec-root to the spec root handler", async () => {
    const startSpecRoot = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startSpecRoot });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/spec-root rebind", ["img-1"]);
    });

    expect(startSpecRoot).toHaveBeenCalledWith("/spec-root rebind");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /mcp to the MCP handler", async () => {
    const startMcp = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startMcp });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/mcp now", ["img-1"]);
    });

    expect(startMcp).toHaveBeenCalledWith("/mcp now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("routes /export to the export handler", async () => {
    const startExport = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startExport });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/export now", ["img-1"]);
    });

    expect(startExport).toHaveBeenCalledWith("/export now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /share to the share handler", async () => {
    const startShare = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startShare });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/share now", ["img-1"]);
    });

    expect(startShare).toHaveBeenCalledWith("/share now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /import to the import handler", async () => {
    const startImport = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startImport });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/import ~/Downloads/a.json", ["img-1"]);
    });

    expect(startImport).toHaveBeenCalledWith("/import ~/Downloads/a.json");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /lsp to the lsp handler", async () => {
    const startLsp = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startLsp });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/lsp symbols useThread", ["img-1"]);
    });

    expect(startLsp).toHaveBeenCalledWith("/lsp symbols useThread");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes /resume to the resume handler", async () => {
    const startResume = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startResume });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/resume now", ["img-1"]);
    });

    expect(startResume).toHaveBeenCalledWith("/resume now");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("routes /fork to the fork handler", async () => {
    const startFork = vi.fn().mockResolvedValue(undefined);
    const options = makeOptions({ startFork });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("/fork branch here", ["img-1"]);
    });

    expect(startFork).toHaveBeenCalledWith("/fork branch here");
    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(options.startReview).not.toHaveBeenCalled();
  });

  it("does not send when reviewing even if steer is enabled", async () => {
    const options = makeOptions({ isReviewing: true, steerEnabled: true });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.handleSend("Blocked");
    });

    expect(options.sendUserMessage).not.toHaveBeenCalled();
    expect(result.current.activeQueue).toHaveLength(0);
  });

  it("preserves images for queued messages", async () => {
    const options = makeOptions();
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Images", ["img-1", "img-2"]);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(options.sendUserMessage).toHaveBeenCalledWith("Images", [
      "img-1",
      "img-2",
    ]);
  });

  it("releases stalled in-flight queue item for opencode only", async () => {
    vi.useFakeTimers();
    const options = makeOptions({
      activeEngine: "opencode",
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
    });
    const { result } = renderHook((props) => useQueuedSend(props), {
      initialProps: options,
    });

    await act(async () => {
      await result.current.queueMessage("Hello");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(options.sendUserMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(18_500);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(options.sendUserMessage).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
