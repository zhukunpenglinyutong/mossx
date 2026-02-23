// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { Messages } from "./Messages";

describe("Messages", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
  });

  it("renders image grid above message text and opens lightbox", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-1",
        kind: "message",
        role: "user",
        text: "Hello",
        images: ["data:image/png;base64,AAA"],
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

    const bubble = container.querySelector(".message-bubble");
    const grid = container.querySelector(".message-image-grid");
    const markdown = container.querySelector(".markdown");
    expect(bubble).toBeTruthy();
    expect(grid).toBeTruthy();
    expect(markdown).toBeTruthy();
    if (grid && markdown) {
      expect(bubble?.firstChild).toBe(grid);
    }
    const openButton = screen.getByRole("button", { name: "Open image 1" });
    fireEvent.click(openButton);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("preserves newlines when images are attached", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-2",
        kind: "message",
        role: "user",
        text: "Line 1\n\n- item 1\n- item 2",
        images: ["data:image/png;base64,AAA"],
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

    const markdown = container.querySelector(".markdown");
    expect(markdown).toBeTruthy();
    expect(markdown?.textContent ?? "").toContain("Line 1");
    expect(markdown?.textContent ?? "").toContain("item 1");
    expect(markdown?.textContent ?? "").toContain("item 2");
  });

  it("keeps literal [image] text when images are attached", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-3",
        kind: "message",
        role: "user",
        text: "Literal [image] token",
        images: ["data:image/png;base64,AAA"],
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

    const markdown = container.querySelector(".markdown");
    expect(markdown?.textContent ?? "").toContain("Literal [image] token");
  });

  it("shows only user input for assembled prompt payload in user bubble", () => {
    const items: ConversationItem[] = [
      {
        id: "msg-assembled-1",
        kind: "message",
        role: "user",
        text:
          "[System] 你是 MossX 内的 Claude Code Agent。 [Skill Prompt] # Skill: tr-zh-en-jp 技能说明... [Commons Prompt] 规范... [User Input] 你好啊",
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

    const markdown = container.querySelector(".markdown");
    expect(markdown?.textContent ?? "").toBe("你好啊");
  });

  it("enhances lead keywords only on codex assistant markdown", () => {
    const items: ConversationItem[] = [
      {
        id: "assistant-lead-1",
        kind: "message",
        role: "assistant",
        text: "PLAN\n\n执行内容",
      },
    ];

    const { container, rerender } = render(
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

    expect(container.querySelector(".markdown-lead-paragraph")).toBeTruthy();
    expect(container.querySelector(".markdown-codex-canvas")).toBeTruthy();

    rerender(
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

    expect(container.querySelector(".markdown-lead-paragraph")).toBeNull();
  });

  it("matches extended lead keywords with semantic icons", () => {
    const items: ConversationItem[] = [
      {
        id: "assistant-lead-next-1",
        kind: "message",
        role: "assistant",
        text: "下一步建议\n\n继续补齐验收。",
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

    expect(container.querySelector(".markdown-lead-next")).toBeTruthy();
    expect(container.querySelector(".markdown-lead-icon")?.textContent ?? "").toContain("🚀");
  });

  it("collapses pathological fragmented paragraphs in assistant markdown", () => {
    const fragmented = [
      "湘宁大兄弟",
      "你好！",
      "这段记录",
      "说",
      "的是：",
      "记",
      "录内容分",
      "析",
      "这是一个**",
      "对",
      "话开场片",
      "段**",
    ].join("\n\n");
    const items: ConversationItem[] = [
      {
        id: "assistant-fragmented-1",
        kind: "message",
        role: "assistant",
        text: `这段记录看起来是：\n\n${fragmented}\n\n总结完毕。`,
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

    const paragraphs = container.querySelectorAll(".markdown p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    expect(paragraphs.length).toBeLessThanOrEqual(3);
    const markdownText = container.querySelector(".markdown")?.textContent ?? "";
    expect(markdownText).toContain("湘宁大兄弟你好！");
    expect(markdownText).toContain("这段记录说的是：");
    expect(markdownText).toContain("这是一个对话开场片段");
  });

  it("collapses pathological fragmented blockquote paragraphs in assistant markdown", () => {
    const fragmentedQuote = [
      "湘宁大兄弟",
      "你好！",
      "这段记录",
      "说",
      "的是：",
      "记",
      "录内容分",
      "析",
      "这是一个**",
      "对",
      "话开场片",
      "段**",
    ]
      .map((line) => `> ${line}`)
      .join("\n\n");

    const items: ConversationItem[] = [
      {
        id: "assistant-fragmented-quote-1",
        kind: "message",
        role: "assistant",
        text: `这段记录看起来是：\n\n${fragmentedQuote}\n\n总结完毕。`,
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

    const quoteParagraphs = container.querySelectorAll(".markdown blockquote p");
    expect(quoteParagraphs.length).toBeGreaterThanOrEqual(1);
    expect(quoteParagraphs.length).toBeLessThanOrEqual(3);
    const markdownText = container.querySelector(".markdown")?.textContent ?? "";
    expect(markdownText).toContain("湘宁大兄弟你好！");
    expect(markdownText).toContain("这段记录说的是：");
    expect(markdownText).toContain("这是一个对话开场片段");
  });

  it("collapses fragmented paragraphs when blank lines contain spaces", () => {
    const fragmented = [
      "你好",
      "！",
      "有什么",
      "我可以",
      "帮",
      "你的",
      "吗",
      "？",
    ].join("\n \n");
    const items: ConversationItem[] = [
      {
        id: "assistant-fragmented-spaces-1",
        kind: "message",
        role: "assistant",
        text: `先回应：\n \n${fragmented}`,
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

    const markdownText = container.querySelector(".markdown")?.textContent ?? "";
    expect(markdownText).toContain("你好！有什么我可以帮你的吗？");
  });

  it("collapses single-line fragmented cjk runs in assistant markdown", () => {
    const fragmented = [
      "你",
      "好",
      "！",
      "我",
      "是",
      "你",
      "的",
      "AI",
      "联",
      "合",
      "架",
      "构",
      "师",
      "。",
    ].join("\n");
    const items: ConversationItem[] = [
      {
        id: "assistant-single-line-fragmented-1",
        kind: "message",
        role: "assistant",
        text: fragmented,
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

    const markdownText = container.querySelector(".markdown")?.textContent ?? "";
    expect(markdownText).toContain("你好！我是你的AI联合架构师。");
  });

  it("renders memory context summary as a separate collapsible card", async () => {
    const items: ConversationItem[] = [
      {
        id: "memory-summary-1",
        kind: "message",
        role: "assistant",
        text: "【记忆上下文摘要】\n[对话记录] 第一条；[项目上下文] 第二条",
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

    expect(container.querySelector(".memory-context-summary-card")).toBeTruthy();
    expect(container.querySelector(".markdown")).toBeNull();
    const toggle = container.querySelector(".memory-context-summary-toggle");
    expect(toggle).toBeTruthy();
    if (!toggle) {
      return;
    }
    fireEvent.click(toggle);
    await waitFor(() => {
      const content = container.querySelector(".memory-context-summary-content");
      expect(content?.textContent ?? "").toContain("第一条");
      expect(content?.textContent ?? "").toContain("第二条");
    });
  });

  it("renders legacy user-injected memory prefix as summary card and keeps user input text", async () => {
    const items: ConversationItem[] = [
      {
        id: "legacy-user-memory-1",
        kind: "message",
        role: "user",
        text:
          "[对话记录] 用户输入：你知道苹果手机吗。 我刚买了一个16pro 助手输出摘要：知道的！ iPhone 16 Pro 是苹果 2024 年发布的旗舰机型。 助手输出：知道的！\n\n我的手机是什么牌子的",
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

    expect(container.querySelector(".memory-context-summary-card")).toBeTruthy();
    const markdown = container.querySelector(".markdown");
    expect(markdown?.textContent ?? "").toBe("我的手机是什么牌子的");
    expect(markdown?.textContent ?? "").not.toContain("用户输入：你知道苹果手机吗");
    const toggle = container.querySelector(".memory-context-summary-toggle");
    expect(toggle).toBeTruthy();
    if (!toggle) {
      return;
    }
    fireEvent.click(toggle);
    await waitFor(() => {
      const content = container.querySelector(".memory-context-summary-content");
      expect(content?.textContent ?? "").toContain("[对话记录]");
      expect(content?.textContent ?? "").toContain("助手输出摘要");
    });
  });

  it("renders user-only anchors and scrolls on click", () => {
    const scrollToMock = vi.fn();
    HTMLElement.prototype.scrollTo = scrollToMock;

    const items: ConversationItem[] = [
      {
        id: "anchor-u1",
        kind: "message",
        role: "user",
        text: "first",
      },
      {
        id: "anchor-a1",
        kind: "message",
        role: "assistant",
        text: "second",
      },
      {
        id: "anchor-u2",
        kind: "message",
        role: "user",
        text: "third",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const rail = screen.getByRole("navigation", { name: "Message anchors" });
    expect(rail).toBeTruthy();
    const anchorButtons = screen.getAllByRole("button", { name: /Go to user message \d+/ });
    expect(anchorButtons.length).toBe(2);
    fireEvent.click(anchorButtons[0]);
    expect(scrollToMock).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
  });

  it("uses reasoning title for the working indicator and keeps title-only reasoning rows visible", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-1",
        kind: "reasoning",
        summary: "Scanning repository",
        content: "",
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
    expect(workingText?.textContent ?? "").toContain("Scanning repository");
    expect(container.querySelector(".reasoning-inline")).toBeTruthy();
    expect(container.querySelector(".reasoning-inline-detail")).toBeNull();
  });

  it("shows title-only reasoning rows in codex canvas for real-time visibility", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-codex-live-1",
        kind: "reasoning",
        summary: "Scanning repository",
        content: "",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".reasoning-inline")).toBeTruthy();
    expect(container.querySelector(".reasoning-inline-codex")).toBeTruthy();
    expect(container.querySelector(".reasoning-inline.is-live")).toBeTruthy();
    expect(container.querySelector(".reasoning-inline-live-dot.is-live")).toBeTruthy();
    expect(container.querySelector(".tool-inline-value")?.textContent ?? "").toContain(
      "Scanning repository",
    );
  });

  it("updates codex reasoning row when streamed body arrives", () => {
    const initialItems: ConversationItem[] = [
      {
        id: "reasoning-codex-stream-1",
        kind: "reasoning",
        summary: "Preparing plan",
        content: "",
      },
    ];

    const { container, rerender } = render(
      <Messages
        items={initialItems}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".reasoning-inline")).toBeTruthy();
    expect(container.querySelector(".reasoning-inline-detail")).toBeNull();

    const streamedItems: ConversationItem[] = [
      {
        id: "reasoning-codex-stream-1",
        kind: "reasoning",
        summary: "Preparing plan\nStep 1 complete",
        content: "",
      },
    ];

    rerender(
      <Messages
        items={streamedItems}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".reasoning-inline-detail")?.textContent ?? "").toContain(
      "Step 1 complete",
    );
  });

  it("keeps a single codex reasoning row stable under rapid stream updates", async () => {
    const { container, rerender } = render(
      <Messages
        items={[
          {
            id: "reasoning-codex-rapid-1",
            kind: "reasoning",
            summary: "Drafting response",
            content: "",
          },
        ]}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_000}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    for (let index = 1; index <= 8; index += 1) {
      rerender(
        <Messages
          items={[
            {
              id: "reasoning-codex-rapid-1",
              kind: "reasoning",
              summary: `Drafting response\nchunk ${index}`,
              content: "",
            },
          ]}
          threadId="thread-1"
          workspaceId="ws-1"
          isThinking
          processingStartedAt={Date.now() - 1_000}
          activeEngine="codex"
          openTargets={[]}
          selectedOpenAppId=""
        />,
      );
    }

    expect(container.querySelectorAll(".reasoning-inline").length).toBe(1);
    await waitFor(() => {
      expect(container.querySelector(".reasoning-inline-detail")?.textContent ?? "").toContain(
        "chunk 8",
      );
    });
  });

  it("renders reasoning rows when there is reasoning body content", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-2",
        kind: "reasoning",
        summary: "Scanning repository\nLooking for entry points",
        content: "",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 2_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".reasoning-inline")).toBeTruthy();
    expect(container.querySelector(".reasoning-inline-codex")).toBeNull();
    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(reasoningDetail?.textContent ?? "").toContain("Looking for entry points");
    const workingText = container.querySelector(".working-text");
    expect(workingText?.textContent ?? "").toContain("Scanning repository");
  });

  it("collapses fragmented blockquote text in reasoning detail", () => {
    const fragmentedQuote = [
      "好",
      "的，让",
      "我",
      "帮你",
      "回",
      "顾一下当前项",
      "目的状态和",
      "最",
      "近的",
      "Git 操",
      "作。",
    ]
      .map((line) => `> ${line}`)
      .join("\n\n");

    const items: ConversationItem[] = [
      {
        id: "reasoning-fragmented-quote",
        kind: "reasoning",
        summary: "检查项目记忆",
        content: `从项目记忆里可以看到：\n\n${fragmentedQuote}`,
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 2_000}
        activeEngine="claude"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(reasoningDetail).toBeTruthy();
    const quoteParagraphs = container.querySelectorAll(
      ".reasoning-inline-detail blockquote p",
    );
    expect(quoteParagraphs.length).toBeGreaterThanOrEqual(1);
    expect(quoteParagraphs.length).toBeLessThanOrEqual(3);
    const text = reasoningDetail?.textContent ?? "";
    expect(text).toContain("好的，让我帮你回顾一下当前项目的状态和最近的Git 操作。");
  });

  it("dedupes overlapping reasoning summary and content text", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-overlap-1",
        kind: "reasoning",
        summary: "你好！有什么我可以帮你的吗？",
        content: "你好！有什么我可以帮你的吗？ 你好！有什么我可以帮你的吗？",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 2_000}
        activeEngine="claude"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(reasoningDetail).toBeTruthy();
    const text = (reasoningDetail?.textContent ?? "").replace(/\s+/g, "");
    const matches = text.match(/你好！有什么我可以帮你的吗？/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("strips duplicated reasoning title prefix from content body", () => {
    const title =
      "用户只是说“你好”，这是一个简单的问候。根据我的指导原则：1. 这是一个简单的交互，不需要使用工具。";
    const items: ConversationItem[] = [
      {
        id: "reasoning-title-prefix-1",
        kind: "reasoning",
        summary: title,
        content: `${title} 2. 我应该简洁友好地回应，并询问如何帮助。`,
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 2_000}
        activeEngine="claude"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(reasoningDetail).toBeTruthy();
    const detailText = reasoningDetail?.textContent ?? "";
    const titleMatches = detailText.match(/用户只是说“你好”/g) ?? [];
    expect(titleMatches.length).toBe(0);
    expect(detailText).toContain("我应该简洁友好地回应，并询问如何帮助。");
  });

  it("dedupes adjacent duplicate reasoning blocks in history view", () => {
    const repeated =
      "用户问“你好你是 codex 吗”，这是一个简单的身份确认问题。根据系统提示，我需要：首先确认已读取规则。";
    const items: ConversationItem[] = [
      {
        id: "reasoning-history-1",
        kind: "reasoning",
        summary: repeated,
        content: repeated,
      },
      {
        id: "reasoning-history-2",
        kind: "reasoning",
        summary: repeated,
        content: repeated,
      },
      {
        id: "assistant-history-1",
        kind: "message",
        role: "assistant",
        text: "你好！",
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

    expect(container.querySelectorAll(".reasoning-inline").length).toBe(1);
  });

  it("uses content for the reasoning title when summary is empty", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-content-title",
        kind: "reasoning",
        summary: "",
        content: "Plan from content\nMore detail here",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 1_500}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const workingText = container.querySelector(".working-text");
    expect(workingText?.textContent ?? "").toContain("Plan from content");
    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(reasoningDetail?.textContent ?? "").toContain("More detail here");
    expect(reasoningDetail?.textContent ?? "").not.toContain("Plan from content");
  });

  it("does not show a stale reasoning label from a previous turn", () => {
    const items: ConversationItem[] = [
      {
        id: "reasoning-old",
        kind: "reasoning",
        summary: "Old reasoning title",
        content: "",
      },
      {
        id: "assistant-msg",
        kind: "message",
        role: "assistant",
        text: "Previous assistant response",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 800}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const workingText = container.querySelector(".working-text");
    const label = workingText?.textContent ?? "";
    expect(label).toBeTruthy();
    expect(label).not.toContain("Old reasoning title");
    expect(label).toMatch(/Working|Generating response|messages\.generatingResponse/);
  });

  it("uses merged codex command summary for live activity and hides cwd-only detail", () => {
    const items: ConversationItem[] = [
      {
        id: "user-codex-command",
        kind: "message",
        role: "user",
        text: "检查状态",
      },
      {
        id: "tool-codex-command",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git status --short",
        detail: "/Users/chenxiangning/code/AI/reach/ai-reach",
        status: "in_progress",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 800}
        activeEngine="codex"
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const activity = container.querySelector(".working-activity");
    expect(activity?.textContent ?? "").toContain("git status --short");
    expect(activity?.textContent ?? "").not.toContain("/Users/chenxiangning/code/AI/reach/ai-reach");
  });

  it("shows non-streaming hint for opencode when waiting long for first chunk", () => {
    vi.useFakeTimers();
    try {
      const items: ConversationItem[] = [
        {
          id: "user-latest",
          kind: "message",
          role: "user",
          text: "请解释一下",
        },
      ];

      const { container } = render(
        <Messages
          items={items}
          threadId="thread-1"
          workspaceId="ws-1"
          isThinking
          processingStartedAt={Date.now() - 13_000}
          heartbeatPulse={1}
          activeEngine="opencode"
          openTargets={[]}
          selectedOpenAppId=""
        />,
      );

      const hint = container.querySelector(".working-hint");
      expect(hint).toBeTruthy();
      const hintText = (hint?.textContent ?? "").trim();
      expect(hintText.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates opencode waiting hint only when heartbeat pulse changes", () => {
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.05)
      .mockReturnValueOnce(0.85);
    try {
      const items: ConversationItem[] = [
        {
          id: "user-heartbeat",
          kind: "message",
          role: "user",
          text: "继续",
        },
      ];
      const { container, rerender } = render(
        <Messages
          items={items}
          threadId="thread-1"
          workspaceId="ws-1"
          isThinking
          processingStartedAt={Date.now() - 13_000}
          heartbeatPulse={1}
          activeEngine="opencode"
          openTargets={[]}
          selectedOpenAppId=""
        />,
      );

      const hint1 = container.querySelector(".working-hint")?.textContent ?? "";
      expect(hint1).toMatch(/(心跳|Heartbeat)\s*1/);

      rerender(
        <Messages
          items={items}
          threadId="thread-1"
          workspaceId="ws-1"
          isThinking
          processingStartedAt={Date.now() - 13_000}
          heartbeatPulse={1}
          activeEngine="opencode"
          openTargets={[]}
          selectedOpenAppId=""
        />,
      );
      const hintStable = container.querySelector(".working-hint")?.textContent ?? "";
      expect(hintStable).toBe(hint1);

      rerender(
        <Messages
          items={items}
          threadId="thread-1"
          workspaceId="ws-1"
          isThinking
          processingStartedAt={Date.now() - 13_000}
          heartbeatPulse={2}
          activeEngine="opencode"
          openTargets={[]}
          selectedOpenAppId=""
        />,
      );
      const hint2 = container.querySelector(".working-hint")?.textContent ?? "";
      expect(hint2).toMatch(/(心跳|Heartbeat)\s*2/);
      expect(hint2).not.toBe(hint1);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("shows latest backend activity while thinking", () => {
    const items: ConversationItem[] = [
      {
        id: "user-latest-activity",
        kind: "message",
        role: "user",
        text: "帮我检查项目",
      },
      {
        id: "tool-running-activity",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg -n TODO src",
        detail: "/repo",
        status: "running",
        output: "",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 3_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    const activity = container.querySelector(".working-activity");
    expect(activity?.textContent ?? "").toContain("Command: rg -n TODO src @ /repo");
  });

  it("does not show stale backend activity from previous turns", () => {
    const items: ConversationItem[] = [
      {
        id: "user-old",
        kind: "message",
        role: "user",
        text: "上一轮",
      },
      {
        id: "tool-old",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: ls -la",
        detail: "/old",
        status: "completed",
        output: "",
      },
      {
        id: "assistant-old",
        kind: "message",
        role: "assistant",
        text: "上一轮结果",
      },
      {
        id: "user-new",
        kind: "message",
        role: "user",
        text: "新一轮问题",
      },
    ];

    const { container } = render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking
        processingStartedAt={Date.now() - 2_000}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    expect(container.querySelector(".working-activity")).toBeNull();
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
    const reasoningRows = container.querySelectorAll(".reasoning-inline");
    expect(reasoningRows.length).toBe(1);
    expect(container.querySelector(".tool-inline-value")?.textContent ?? "").toContain(
      "Indexing workspace",
    );
  });

  it("merges consecutive explore items under a single explored block", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-1",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "Find routes" }],
      },
      {
        id: "explore-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "routes.ts" }],
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

    await waitFor(() => {
      expect(container.querySelector(".explore-inline")).toBeTruthy();
    });
    expect(screen.queryByText(/tool calls/i)).toBeNull();
    const exploreItems = container.querySelectorAll(".explore-inline-item");
    expect(exploreItems.length).toBe(2);
    expect(container.querySelector(".explore-inline-title")?.textContent ?? "").toContain(
      "Explored",
    );
  });

  it("uses the latest explore status when merging a consecutive run", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-started",
        kind: "explore",
        status: "exploring",
        entries: [{ kind: "search", label: "starting" }],
      },
      {
        id: "explore-finished",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "finished" }],
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

    await waitFor(() => {
      expect(container.querySelectorAll(".explore-inline").length).toBe(1);
    });
    const exploreTitle = container.querySelector(".explore-inline-title");
    expect(exploreTitle?.textContent ?? "").toContain("Explored");
  });

  it("does not merge explore items across interleaved tools", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-a",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "Find reducers" }],
      },
      {
        id: "tool-a",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg reducers",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "explore-b",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "useThreadsReducer.ts" }],
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

    await waitFor(() => {
      const exploreBlocks = container.querySelectorAll(".explore-inline");
      expect(exploreBlocks.length).toBe(2);
    });
    const exploreItems = container.querySelectorAll(".explore-inline-item");
    expect(exploreItems.length).toBe(2);
    expect(screen.getByText(/rg reducers/i)).toBeTruthy();
  });

  it("preserves chronology when reasoning with body appears between explore items", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-1",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "first explore" }],
      },
      {
        id: "reasoning-body",
        kind: "reasoning",
        summary: "Reasoning title\nReasoning body",
        content: "",
      },
      {
        id: "explore-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "second explore" }],
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

    await waitFor(() => {
      expect(container.querySelectorAll(".explore-inline").length).toBe(2);
    });
    const exploreBlocks = Array.from(container.querySelectorAll(".explore-inline"));
    const reasoningDetail = container.querySelector(".reasoning-inline-detail");
    expect(exploreBlocks.length).toBe(2);
    expect(reasoningDetail).toBeTruthy();
    const [firstExploreBlock, secondExploreBlock] = exploreBlocks;
    const firstBeforeReasoning =
      firstExploreBlock.compareDocumentPosition(reasoningDetail as Node) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    const reasoningBeforeSecond =
      (reasoningDetail as Node).compareDocumentPosition(secondExploreBlock) &
      Node.DOCUMENT_POSITION_FOLLOWING;
    expect(firstBeforeReasoning).toBeTruthy();
    expect(reasoningBeforeSecond).toBeTruthy();
  });

  it("does not merge across message boundaries and does not drop messages", async () => {
    const items: ConversationItem[] = [
      {
        id: "explore-before",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "search", label: "before message" }],
      },
      {
        id: "assistant-msg",
        kind: "message",
        role: "assistant",
        text: "A message between explore blocks",
      },
      {
        id: "explore-after",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "after message" }],
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

    await waitFor(() => {
      const exploreBlocks = container.querySelectorAll(".explore-inline");
      expect(exploreBlocks.length).toBe(2);
    });
    expect(screen.getByText("A message between explore blocks")).toBeTruthy();
  });

  it("keeps explore entry steps separate from tool-group summary", async () => {
    const items: ConversationItem[] = [
      {
        id: "tool-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git status --porcelain=v1",
        detail: "/repo",
        status: "completed",
        output: "",
      },
      {
        id: "explore-steps-1",
        kind: "explore",
        status: "explored",
        entries: [
          { kind: "read", label: "Messages.tsx" },
          { kind: "search", label: "toolCount" },
        ],
      },
      {
        id: "explore-steps-2",
        kind: "explore",
        status: "explored",
        entries: [{ kind: "read", label: "types.ts" }],
      },
      {
        id: "tool-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git diff -- src/features/messages/components/Messages.tsx",
        detail: "/repo",
        status: "completed",
        output: "",
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

    await waitFor(() => {
      const exploreRows = container.querySelectorAll(".explore-inline-item");
      expect(exploreRows.length).toBe(3);
    });
    expect(screen.queryByText("5 tool calls")).toBeNull();
  });
});
