// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { Messages } from "./Messages";

describe("Messages live behavior", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.setItem("mossx.claude.hideReasoningModule", "0");
    window.localStorage.removeItem("mossx.messages.live.autoFollow");
    window.localStorage.removeItem("mossx.messages.live.collapseMiddleSteps");
  });

  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  it("keeps only the latest title-only reasoning row for non-codex engines", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-title-only-old",
        kind: "reasoning",
        summary: "Planning old step",
        content: "",
      },
      {
        id: "reasoning-title-only",
        kind: "reasoning",
        summary: "Indexing workspace",
        content: "",
      },
      {
        id: "tool-after-reasoning",
        kind: "tool",
        title: "Command: rg --files",
        detail: "/tmp",
        toolType: "commandExecution",
        output: "",
        status: "running",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const workingText = container.querySelector(".working-text");
    expect(workingText?.textContent ?? "").toContain("Indexing workspace");
    const reasoningRows = container.querySelectorAll(".thinking-block");
    expect(reasoningRows.length).toBe(1);
    expect(container.querySelector(".thinking-title")).toBeTruthy();
  });

  it("hides command cards in codex canvas while keeping non-command tool cards", () => {
    const items: ConversationItem[] = [
      {
        id: "tool-codex-command-1",
        kind: "tool",
        title: "Command: pwd && ls -la",
        detail: "/tmp",
        toolType: "commandExecution",
        output: "done",
        status: "completed",
      },
      {
        id: "tool-codex-command-2",
        kind: "tool",
        title: "Command: echo done",
        detail: "/tmp",
        toolType: "commandExecution",
        output: "done",
        status: "completed",
      },
      {
        id: "tool-codex-edit-1",
        kind: "tool",
        title: "Tool: edit",
        detail: JSON.stringify({
          file_path: "src/keep.ts",
          old_string: "before",
          new_string: "after",
        }),
        toolType: "edit",
        status: "completed",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".bash-group-container")).toBeNull();
    expect(container.textContent ?? "").not.toContain("pwd && ls -la");
    expect(container.textContent ?? "").not.toContain("echo done");
    expect(container.textContent ?? "").toContain("keep.ts");
  });

  it("hides command cards in claude canvas", () => {
    const items: ConversationItem[] = [
      {
        id: "tool-claude-command-1",
        kind: "tool",
        title: "Command: pwd && ls -la",
        detail: "/tmp",
        toolType: "commandExecution",
        output: "done",
        status: "completed",
      },
      {
        id: "tool-claude-command-2",
        kind: "tool",
        title: "Command: echo done",
        detail: "/tmp",
        toolType: "commandExecution",
        output: "done",
        status: "completed",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        activeEngine="claude"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".bash-group-container")).toBeNull();
    expect(container.textContent ?? "").not.toContain("pwd && ls -la");
    expect(container.textContent ?? "").not.toContain("echo done");
  });

  it.each(["codex", "claude", "gemini"] as const)(
    "switches %s working spinner between waiting and ingress phases",
    (activeEngine) => {
      vi.useFakeTimers();
      try {
        const baseItems: ConversationItem[] = [
          {
            id: "user-stream-phase",
            kind: "message",
            role: "user",
            text: "继续输出",
          },
          {
            id: "assistant-stream-phase",
            kind: "message",
            role: "assistant",
            text: "",
          },
        ];

        const { container, rerender } = render(
          <Messages
            items={baseItems}
            threadId="thread-1"
            workspaceId="ws-1"
            isThinking
            processingStartedAt={Date.now() - 1_000}
            activeEngine={activeEngine}
            openTargets={[]}
            selectedOpenAppId=""
          />,
        );

        const waitingNode = container.querySelector(".working");
        expect(waitingNode?.className ?? "").toContain("is-waiting");

        rerender(
          <Messages
            items={[
              baseItems[0]!,
              {
                id: "assistant-stream-phase",
                kind: "message",
                role: "assistant",
                text: "增量片段",
              },
            ]}
            threadId="thread-1"
            workspaceId="ws-1"
            isThinking
            processingStartedAt={Date.now() - 1_000}
            activeEngine={activeEngine}
            openTargets={[]}
            selectedOpenAppId=""
          />,
        );

        const ingressNode = container.querySelector(".working");
        expect(ingressNode?.className ?? "").toContain("is-ingress");

        act(() => {
          vi.advanceTimersByTime(1_200);
        });

        const backToWaitingNode = container.querySelector(".working");
        expect(backToWaitingNode?.className ?? "").toContain("is-waiting");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each(["codex", "claude", "gemini"] as const)(
    "detects ingress for %s even when chunk length is unchanged",
    (activeEngine) => {
      vi.useFakeTimers();
      try {
        const { container, rerender } = render(
          <Messages
            items={[
              {
                id: "user-stream-same-length",
                kind: "message",
                role: "user",
                text: "继续输出",
              },
              {
                id: "assistant-stream-same-length",
                kind: "message",
                role: "assistant",
                text: "aaaa",
              },
            ]}
            threadId="thread-1"
            workspaceId="ws-1"
            isThinking
            processingStartedAt={Date.now() - 1_000}
            activeEngine={activeEngine}
            openTargets={[]}
            selectedOpenAppId=""
          />,
        );

        const baselineNode = container.querySelector(".working");
        expect(baselineNode?.className ?? "").toContain("is-waiting");

        rerender(
          <Messages
            items={[
              {
                id: "user-stream-same-length",
                kind: "message",
                role: "user",
                text: "继续输出",
              },
              {
                id: "assistant-stream-same-length",
                kind: "message",
                role: "assistant",
                text: "bbbb",
              },
            ]}
            threadId="thread-1"
            workspaceId="ws-1"
            isThinking
            processingStartedAt={Date.now() - 1_000}
            activeEngine={activeEngine}
            openTargets={[]}
            selectedOpenAppId=""
          />,
        );

        const ingressNode = container.querySelector(".working");
        expect(ingressNode?.className ?? "").toContain("is-ingress");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("disables auto-follow scrolling when live auto-follow toggle is off", () => {
    window.localStorage.setItem("mossx.messages.live.autoFollow", "0");
    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const { rerender } = render(
      <Messages
        items={[
          {
            id: "assistant-live-scroll-1",
            kind: "message",
            role: "assistant",
            text: "first chunk",
          },
        ]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    rerender(
      <Messages
        items={[
          {
            id: "assistant-live-scroll-1",
            kind: "message",
            role: "assistant",
            text: "first chunk",
          },
          {
            id: "assistant-live-scroll-2",
            kind: "message",
            role: "assistant",
            text: "second chunk",
          },
        ]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it("keeps auto-follow working after manual scroll when enabled", async () => {
    window.localStorage.setItem("mossx.messages.live.autoFollow", "1");
    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => {});
    const { container, rerender } = render(
      <Messages
        items={[
          {
            id: "assistant-live-follow-1",
            kind: "message",
            role: "assistant",
            text: "first chunk",
          },
        ]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const scroller = container.querySelector(".messages") as HTMLDivElement | null;
    expect(scroller).toBeTruthy();
    if (!scroller) {
      throw new Error("expected messages scroller");
    }
    Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
    Object.defineProperty(scroller, "scrollTop", { value: 400, writable: true, configurable: true });
    fireEvent.scroll(scroller);

    const baselineCalls = scrollSpy.mock.calls.length;

    rerender(
      <Messages
        items={[
          {
            id: "assistant-live-follow-1",
            kind: "message",
            role: "assistant",
            text: "first chunk",
          },
          {
            id: "assistant-live-follow-2",
            kind: "message",
            role: "assistant",
            text: "second chunk",
          },
        ]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    await waitFor(() => {
      expect(scrollSpy.mock.calls.length).toBeGreaterThan(baselineCalls);
    });
    scrollSpy.mockRestore();
  });

  it("collapses live middle steps when enabled", () => {
    window.localStorage.setItem("mossx.messages.live.collapseMiddleSteps", "1");
    const items: ConversationItem[] = [
      {
        id: "user-live-collapse",
        kind: "message",
        role: "user",
        text: "请继续",
      },
      {
        id: "reasoning-live-collapse",
        kind: "reasoning",
        summary: "分析中",
        content: "",
      },
      {
        id: "tool-live-collapse",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg --files",
        detail: "/tmp",
        status: "running",
        output: "",
      },
      {
        id: "assistant-live-collapse",
        kind: "message",
        role: "assistant",
        text: "最终输出",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".messages-live-middle-collapsed-indicator")).toBeTruthy();
    expect(container.querySelector(".thinking-block")).toBeNull();
    expect(container.textContent ?? "").toContain("最终输出");
    expect(container.textContent ?? "").not.toContain("Command: rg --files");
  });

  it("collapses middle steps in history mode when enabled", () => {
    window.localStorage.setItem("mossx.messages.live.collapseMiddleSteps", "1");
    const items: ConversationItem[] = [
      {
        id: "user-history-collapse",
        kind: "message",
        role: "user",
        text: "请继续",
      },
      {
        id: "reasoning-history-collapse",
        kind: "reasoning",
        summary: "分析中",
        content: "",
      },
      {
        id: "tool-history-collapse",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg --files",
        detail: "/tmp",
        status: "completed",
        output: "",
      },
      {
        id: "assistant-history-collapse",
        kind: "message",
        role: "assistant",
        text: "历史最终输出",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".thinking-block")).toBeNull();
    expect(container.textContent ?? "").toContain("历史最终输出");
    expect(container.textContent ?? "").not.toContain("Command: rg --files");
  });

  it("collapses middle steps for all previous turns in history mode", () => {
    window.localStorage.setItem("mossx.messages.live.collapseMiddleSteps", "1");
    const items: ConversationItem[] = [
      {
        id: "user-history-turn-1",
        kind: "message",
        role: "user",
        text: "第一个问题",
      },
      {
        id: "reasoning-history-turn-1",
        kind: "reasoning",
        summary: "第一轮分析",
        content: "",
      },
      {
        id: "tool-history-turn-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: ls",
        detail: "/tmp",
        status: "completed",
        output: "",
      },
      {
        id: "assistant-history-turn-1",
        kind: "message",
        role: "assistant",
        text: "第一轮答案",
      },
      {
        id: "user-history-turn-2",
        kind: "message",
        role: "user",
        text: "第二个问题",
      },
      {
        id: "reasoning-history-turn-2",
        kind: "reasoning",
        summary: "第二轮分析",
        content: "",
      },
      {
        id: "tool-history-turn-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg --files",
        detail: "/tmp",
        status: "completed",
        output: "",
      },
      {
        id: "assistant-history-turn-2",
        kind: "message",
        role: "assistant",
        text: "第二轮答案",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.textContent ?? "").toContain("第一轮答案");
    expect(container.textContent ?? "").toContain("第二轮答案");
    expect(container.textContent ?? "").not.toContain("Command: ls");
    expect(container.textContent ?? "").not.toContain("Command: rg --files");
    expect(container.querySelector(".thinking-block")).toBeNull();
  });
});
