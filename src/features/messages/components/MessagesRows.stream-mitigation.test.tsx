// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageRow, ReasoningRow } from "./MessagesRows";
import { parseReasoning } from "./messagesReasoning";

const markdownCalls = vi.hoisted(() => ({
  calls: [] as Array<{
    liveRenderMode?: "full" | "lightweight";
    progressiveReveal?: boolean;
    streamingThrottleMs?: number;
    value: string;
  }>,
}));

vi.mock("./Markdown", () => ({
  Markdown: ({
    liveRenderMode,
    progressiveReveal,
    streamingThrottleMs,
    value,
    onRenderedValueChange,
  }: {
    liveRenderMode?: "full" | "lightweight";
    progressiveReveal?: boolean;
    streamingThrottleMs?: number;
    value: string;
    onRenderedValueChange?: (value: string) => void;
  }) => {
    markdownCalls.calls.push({
      liveRenderMode,
      progressiveReveal,
      streamingThrottleMs,
      value,
    });
    onRenderedValueChange?.(value);
    return (
      <div
        data-testid="markdown"
        data-live-render-mode={liveRenderMode ?? "full"}
        data-progressive-reveal={progressiveReveal ? "true" : "false"}
        data-throttle={streamingThrottleMs ?? -1}
      >
        {value}
      </div>
    );
  },
}));

describe("MessagesRows stream mitigation", () => {
  beforeEach(() => {
    markdownCalls.calls = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("raises assistant markdown throttle only when mitigation is active", () => {
    const messageItem = {
      id: "assistant-1",
      kind: "message" as const,
      role: "assistant" as const,
      text: "streaming output",
    };

    const { rerender } = render(
      <MessageRow
        item={messageItem}
        isStreaming
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("48");

    rerender(
      <MessageRow
        item={messageItem}
        isStreaming
        isCopied={false}
        onCopy={vi.fn()}
        streamMitigationProfile={{
          id: "claude-qwen-windows-render-safe",
          messageStreamingThrottleMs: 120,
          reasoningStreamingThrottleMs: 260,
        }}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("120");
  });

  it("uses a plain text live surface for Claude Windows visible-stream mitigation", () => {
    const messageItem = {
      id: "assistant-plain",
      kind: "message" as const,
      role: "assistant" as const,
      text: "line one\nline two",
    };
    const onAssistantVisibleTextRender = vi.fn();

    const { container } = render(
      <MessageRow
        item={messageItem}
        isStreaming
        isCopied={false}
        onCopy={vi.fn()}
        streamMitigationProfile={{
          id: "claude-windows-visible-stream",
          messageStreamingThrottleMs: 120,
          reasoningStreamingThrottleMs: 260,
          renderPlainTextWhileStreaming: true,
        }}
        onAssistantVisibleTextRender={onAssistantVisibleTextRender}
      />,
    );

    expect(screen.queryByTestId("markdown")).toBeNull();
    const plainTextSurface = container.querySelector(".markdown-live-plain-text");
    expect(plainTextSurface?.textContent).toBe("line one\nline two");
    expect(onAssistantVisibleTextRender).toHaveBeenCalledWith({
      itemId: "assistant-plain",
      visibleText: "line one\nline two",
    });
  });

  it("uses a plain text live surface for engine-level Claude markdown stream recovery", () => {
    const messageItem = {
      id: "assistant-engine-recovery",
      kind: "message" as const,
      role: "assistant" as const,
      text: "## heading\n\n- one\n- two",
    };
    const onAssistantVisibleTextRender = vi.fn();

    const { container } = render(
      <MessageRow
        item={messageItem}
        isStreaming
        isCopied={false}
        onCopy={vi.fn()}
        streamMitigationProfile={{
          id: "claude-markdown-stream-recovery",
          messageStreamingThrottleMs: 120,
          reasoningStreamingThrottleMs: 260,
          renderPlainTextWhileStreaming: true,
        }}
        onAssistantVisibleTextRender={onAssistantVisibleTextRender}
      />,
    );

    expect(screen.queryByTestId("markdown")).toBeNull();
    const plainTextSurface = container.querySelector(".markdown-live-plain-text");
    expect(plainTextSurface?.textContent).toBe("## heading\n\n- one\n- two");
    expect(onAssistantVisibleTextRender).toHaveBeenCalledWith({
      itemId: "assistant-engine-recovery",
      visibleText: "## heading\n\n- one\n- two",
    });
  });

  it("keeps Codex markdown stream recovery on lightweight Markdown after visible stall evidence", () => {
    const messageItem = {
      id: "assistant-codex-recovery",
      kind: "message" as const,
      role: "assistant" as const,
      text: "## 审计结论\n\n- 第一条\n- 第二条\n- 第三条\n- 第四条\n- 第五条\n- 第六条",
    };
    const onAssistantVisibleTextRender = vi.fn();

    render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
        streamMitigationProfile={{
          id: "codex-markdown-stream-recovery",
          messageStreamingThrottleMs: 120,
          reasoningStreamingThrottleMs: 220,
          renderPlainTextWhileStreaming: true,
        }}
        onAssistantVisibleTextRender={onAssistantVisibleTextRender}
      />,
    );

    expect(screen.queryByText("## 审计结论")).toBeNull();
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "lightweight",
    );
    expect(screen.getByTestId("markdown").getAttribute("data-progressive-reveal")).toBe(
      "true",
    );
    expect(screen.getByTestId("markdown").textContent).toContain("审计结论");
    expect(onAssistantVisibleTextRender).toHaveBeenCalled();
  });

  it("uses a staged markdown throttle for large Codex streaming output without an explicit mitigation profile", () => {
    const messageItem = {
      id: "assistant-codex-large",
      kind: "message" as const,
      role: "assistant" as const,
      text: Array.from({ length: 14 }, (_, index) => `- 第 ${index + 1} 条结论：这是长段 streaming 内容`).join("\n"),
    };

    render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("160");
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "lightweight",
    );
    expect(screen.getByTestId("markdown").getAttribute("data-progressive-reveal")).toBe(
      "true",
    );
  });

  it("keeps markdown live rendering for short Codex streaming output", () => {
    const messageItem = {
      id: "assistant-codex-short",
      kind: "message" as const,
      role: "assistant" as const,
      text: "短一点的实时输出",
    };

    render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("48");
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "full",
    );
    expect(screen.getByTestId("markdown").getAttribute("data-progressive-reveal")).toBe(
      "false",
    );
  });

  it("keeps large Codex streaming on Markdown and stays on Markdown after completion", () => {
    const messageItem = {
      id: "assistant-codex-final",
      kind: "message" as const,
      role: "assistant" as const,
      text: Array.from({ length: 14 }, (_, index) => `- 第 ${index + 1} 条结论：这是长段 streaming 内容`).join("\n"),
    };

    const { container, rerender } = render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(container.querySelector(".markdown-live-plain-text")).toBeNull();
    expect(screen.getByTestId("markdown").textContent).toBe(messageItem.text);
    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("160");
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "lightweight",
    );

    rerender(
      <MessageRow
        item={messageItem}
        isStreaming={false}
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(container.querySelector(".markdown-live-plain-text")).toBeNull();
    expect(screen.getByTestId("markdown").textContent).toBe(messageItem.text);
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "full",
    );
    expect(screen.getByTestId("markdown").getAttribute("data-progressive-reveal")).toBe(
      "false",
    );
  });

  it("renders completed large Codex history directly as Markdown", () => {
    const messageItem = {
      id: "assistant-codex-history",
      kind: "message" as const,
      role: "assistant" as const,
      text: Array.from({ length: 14 }, (_, index) => `- 第 ${index + 1} 条历史结论：这是长段完成内容`).join("\n"),
    };

    const { container } = render(
      <MessageRow
        item={messageItem}
        isStreaming={false}
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(container.querySelector(".markdown-live-plain-text")).toBeNull();
    expect(screen.getByTestId("markdown").textContent).toBe(messageItem.text);
  });

  it("uses the Gemini baseline profile for assistant streaming without Codex staged throttle", () => {
    const messageItem = {
      id: "assistant-gemini-large",
      kind: "message" as const,
      role: "assistant" as const,
      text: Array.from({ length: 14 }, (_, index) => `- 第 ${index + 1} 条 Gemini streaming 内容`).join("\n"),
    };

    render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="gemini"
        isCopied={false}
        onCopy={vi.fn()}
        presentationProfile={{
          engine: "gemini",
          preferCommandSummary: false,
          codexCanvasMarkdown: false,
          showReasoningLiveDot: false,
          heartbeatWaitingHint: false,
          assistantMarkdownStreamingThrottleMs: 80,
          reasoningStreamingThrottleMs: 180,
          useCodexStagedMarkdownThrottle: false,
        }}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("80");
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "full",
    );
  });

  it("uses a medium markdown throttle for medium Codex streaming output", () => {
    const messageItem = {
      id: "assistant-codex-medium",
      kind: "message" as const,
      role: "assistant" as const,
      text: Array.from({ length: 7 }, (_, index) => `- 第 ${index + 1} 条结论`).join("\n"),
    };

    render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("80");
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "lightweight",
    );
    expect(screen.getByTestId("markdown").getAttribute("data-progressive-reveal")).toBe(
      "true",
    );
  });

  it("switches structured Codex streaming output to lightweight Markdown before it becomes huge", () => {
    const messageItem = {
      id: "assistant-codex-structured",
      kind: "message" as const,
      role: "assistant" as const,
      text: [
        "### 1. 总览",
        "这里是一段说明。",
        "",
        "### 2. 指标",
        "- 第一条",
        "- 第二条",
        "- 第三条",
        "",
        "```ts",
        "const sum = (a: number, b: number) => a + b;",
        "console.log(sum(1, 2));",
        "```",
      ].join("\n"),
    };

    render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("160");
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "lightweight",
    );
    expect(screen.getByTestId("markdown").getAttribute("data-progressive-reveal")).toBe(
      "true",
    );
  });

  it("raises throttle further for huge structured Codex streaming output", () => {
    const messageItem = {
      id: "assistant-codex-huge-structured",
      kind: "message" as const,
      role: "assistant" as const,
      text: Array.from({ length: 12 }, (_, index) => [
        `### 第 ${index + 1} 节`,
        "- 第一条说明",
        "- 第二条说明",
        "```ts",
        `const value${index} = ${index};`,
        `console.log(value${index});`,
        "```",
        "这里是额外的说明文字，用来把 streaming 文本推到更重的结构化 Markdown 区间。",
        "",
      ].join("\n")).join("\n"),
    };

    render(
      <MessageRow
        item={messageItem}
        isStreaming
        activeEngine="codex"
        isCopied={false}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("220");
    expect(screen.getByTestId("markdown").getAttribute("data-live-render-mode")).toBe(
      "lightweight",
    );
  });

  it("raises reasoning markdown throttle only when mitigation is active", () => {
    const reasoningItem = {
      id: "reasoning-1",
      kind: "reasoning" as const,
      summary: "Planning",
      content: "Reasoning body",
    };

    const { rerender } = render(
      <ReasoningRow
        item={reasoningItem}
        parsed={parseReasoning(reasoningItem)}
        isExpanded
        isLive
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("180");

    rerender(
      <ReasoningRow
        item={reasoningItem}
        parsed={parseReasoning(reasoningItem)}
        isExpanded
        isLive
        onToggle={vi.fn()}
        streamMitigationProfile={{
          id: "claude-qwen-windows-render-safe",
          messageStreamingThrottleMs: 120,
          reasoningStreamingThrottleMs: 260,
        }}
      />,
    );

    expect(screen.getByTestId("markdown").getAttribute("data-throttle")).toBe("260");
  });
});
