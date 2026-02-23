import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../types";
import {
  buildConversationItem,
  buildConversationItemFromThreadItem,
  getThreadTimestamp,
  mergeThreadItems,
  normalizeItem,
  prepareThreadItems,
  upsertItem,
} from "./threadItems";

describe("threadItems", () => {
  it("truncates long message text in normalizeItem", () => {
    const text = "a".repeat(21000);
    const item: ConversationItem = {
      id: "msg-1",
      kind: "message",
      role: "user",
      text,
    };
    const normalized = normalizeItem(item);
    expect(normalized.kind).toBe("message");
    if (normalized.kind === "message") {
      expect(normalized.text).not.toBe(text);
      expect(normalized.text.endsWith("...")).toBe(true);
      expect(normalized.text.length).toBeLessThan(text.length);
    }
  });

  it("normalizes fragmented and repeated assistant message text", () => {
    const fragmented =
      "你\n\n好\n\n!\n\n有什\n\n么\n\n可以\n\n帮\n\n你的\n\n吗\n\n？";
    const clean = "你好！有什么可以帮你的吗？";
    const item: ConversationItem = {
      id: "msg-assistant-normalize-1",
      kind: "message",
      role: "assistant",
      text: `${fragmented}\n\n${clean}\n\n${clean}`,
    };
    const normalized = normalizeItem(item);
    expect(normalized.kind).toBe("message");
    if (normalized.kind === "message") {
      const comparable = (value: string) =>
        value.replace(/[！!]/g, "!").replace(/[？?]/g, "?");
      expect(comparable(normalized.text)).toBe(comparable(clean));
    }
  });

  it("keeps normal markdown assistant output unchanged", () => {
    const markdown = [
      "## 项目定位",
      "",
      "| 技术 | 版本/用途 |",
      "| --- | --- |",
      "| Node.js | >= 18.0.0 |",
      "",
      "```text",
      "plan -> code -> verify -> doc",
      "```",
      "",
      "- 第一项",
      "- 第二项",
    ].join("\n");
    const item: ConversationItem = {
      id: "msg-assistant-markdown-1",
      kind: "message",
      role: "assistant",
      text: markdown,
    };
    const normalized = normalizeItem(item);
    expect(normalized.kind).toBe("message");
    if (normalized.kind === "message") {
      expect(normalized.text).toBe(markdown);
    }
  });

  it("preserves tool output for fileChange and commandExecution", () => {
    const output = "x".repeat(21000);
    const item: ConversationItem = {
      id: "tool-1",
      kind: "tool",
      toolType: "fileChange",
      title: "File changes",
      detail: "",
      output,
    };
    const normalized = normalizeItem(item);
    expect(normalized.kind).toBe("tool");
    if (normalized.kind === "tool") {
      expect(normalized.output).toBe(output);
    }
  });

  it("truncates older tool output in prepareThreadItems", () => {
    const output = "y".repeat(21000);
    const items: ConversationItem[] = Array.from({ length: 41 }, (_, index) => ({
      id: `tool-${index}`,
      kind: "tool",
      toolType: "commandExecution",
      title: "Tool",
      detail: "",
      output,
    }));
    const prepared = prepareThreadItems(items);
    const firstOutput = prepared[0].kind === "tool" ? prepared[0].output : undefined;
    const secondOutput = prepared[1].kind === "tool" ? prepared[1].output : undefined;
    expect(firstOutput).not.toBe(output);
    expect(firstOutput?.endsWith("...")).toBe(true);
    expect(secondOutput).toBe(output);
  });

  it("drops assistant review summaries that duplicate completed review items", () => {
    const items: ConversationItem[] = [
      {
        id: "review-1",
        kind: "review",
        state: "completed",
        text: "Review summary",
      },
      {
        id: "msg-1",
        kind: "message",
        role: "assistant",
        text: "Review summary",
      },
    ];
    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("review");
  });

  it("summarizes explored reads and hides raw commands", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: cat src/foo.ts",
        detail: "",
        status: "completed",
        output: "",
      },
      {
        id: "cmd-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: sed -n '1,10p' src/bar.ts",
        detail: "",
        status: "completed",
        output: "",
      },
      {
        id: "msg-1",
        kind: "message",
        role: "assistant",
        text: "Done reading",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(2);
      expect(prepared[0].entries[0].kind).toBe("read");
      expect(prepared[0].entries[0].label).toContain("foo.ts");
      expect(prepared[0].entries[1].kind).toBe("read");
      expect(prepared[0].entries[1].label).toContain("bar.ts");
    }
    expect(prepared.filter((item) => item.kind === "tool")).toHaveLength(0);
  });

  it("treats inProgress command status as exploring", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg RouterDestination src",
        detail: "",
        status: "inProgress",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].status).toBe("exploring");
      expect(prepared[0].entries[0]?.kind).toBe("search");
    }
  });

  it("deduplicates explore entries when consecutive summaries merge", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: cat src/customPrompts.ts",
        detail: "",
        status: "completed",
        output: "",
      },
      {
        id: "cmd-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: cat src/customPrompts.ts",
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(1);
      expect(prepared[0].entries[0].label).toContain("customPrompts.ts");
    }
  });

  it("coalesces duplicate message snapshots by id when preparing thread items", () => {
    const items: ConversationItem[] = [
      {
        id: "assistant-dup-1",
        kind: "message",
        role: "assistant",
        text: "你\n\n好\n\n!",
      },
      {
        id: "assistant-dup-1",
        kind: "message",
        role: "assistant",
        text: "你好！",
      },
    ];
    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("message");
    if (prepared[0].kind === "message") {
      expect(prepared[0].id).toBe("assistant-dup-1");
      expect(prepared[0].text).toBe("你好！");
    }
  });

  it("keeps reasoning item when it shares id with assistant message", () => {
    const items: ConversationItem[] = [
      {
        id: "shared-1",
        kind: "reasoning",
        summary: "思考中",
        content: "先检查上下文",
      },
      {
        id: "shared-1",
        kind: "message",
        role: "assistant",
        text: "我先检查一下上下文。",
      },
    ];
    const prepared = prepareThreadItems(items);
    const reasoning = prepared.find((entry) => entry.kind === "reasoning");
    const message = prepared.find(
      (entry) => entry.kind === "message" && entry.role === "assistant",
    );
    expect(reasoning).toBeDefined();
    expect(message).toBeDefined();
  });

  it("preserves distinct read paths that share the same basename", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: cat src/foo/index.ts",
        detail: "",
        status: "completed",
        output: "",
      },
      {
        id: "cmd-2",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: cat tests/foo/index.ts",
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(2);
      const details = prepared[0].entries.map((entry) => entry.detail ?? entry.label);
      expect(details).toContain("src/foo/index.ts");
      expect(details).toContain("tests/foo/index.ts");
    }
  });

  it("preserves multi-path read commands instead of collapsing to the last path", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: cat src/a.ts src/b.ts",
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(2);
      const details = prepared[0].entries.map((entry) => entry.detail ?? entry.label);
      expect(details).toContain("src/a.ts");
      expect(details).toContain("src/b.ts");
    }
  });

  it("keeps existing tool detail when completed payload omits arguments", () => {
    const existing: ConversationItem = {
      id: "tool-1",
      kind: "tool",
      toolType: "mcpToolCall",
      title: "Tool: claude / read",
      detail: JSON.stringify({ file_path: "src/index.js" }),
      status: "started",
      output: "",
    };
    const completed: ConversationItem = {
      id: "tool-1",
      kind: "tool",
      toolType: "mcpToolCall",
      title: "Tool: claude / read",
      detail: "",
      status: "completed",
      output: "ok",
    };

    const merged = upsertItem([existing], completed);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe("tool");
    if (merged[0].kind === "tool") {
      expect(merged[0].detail).toContain("src/index.js");
      expect(merged[0].status).toBe("completed");
      expect(merged[0].output).toBe("ok");
    }
  });

  it("ignores glob patterns when summarizing rg --files commands", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg --files -g '*.ts' src",
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(1);
      expect(prepared[0].entries[0].kind).toBe("list");
      expect(prepared[0].entries[0].label).toBe("src");
    }
  });

  it("skips rg glob flag values and keeps the actual search path", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: rg myQuery -g '*.ts' src",
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(1);
      expect(prepared[0].entries[0].kind).toBe("search");
      expect(prepared[0].entries[0].label).toBe("myQuery in src");
    }
  });

  it("strips injected project-memory block from user message text", () => {
    const converted = buildConversationItem({
      id: "user-1",
      type: "userMessage",
      content: [
        {
          type: "text",
          text: `<project-memory source="project-memory" count="1" truncated="false">
[对话记录] 测试记忆
</project-memory>

你猜我会不会 go 语言`,
        },
      ],
    });

    expect(converted).toBeTruthy();
    expect(converted?.kind).toBe("message");
    if (converted?.kind === "message") {
      expect(converted.role).toBe("user");
      expect(converted.text).toBe("你猜我会不会 go 语言");
    }
  });

  it("strips injected project-memory block when rebuilding thread history", () => {
    const converted = buildConversationItemFromThreadItem({
      id: "user-2",
      type: "userMessage",
      content: [
        {
          type: "text",
          text: `<project-memory source="project-memory" count="2" truncated="false">
[项目上下文] xxx
[对话记录] yyy
</project-memory>
go lang`,
        },
      ],
    });

    expect(converted).toBeTruthy();
    expect(converted?.kind).toBe("message");
    if (converted?.kind === "message") {
      expect(converted.text).toBe("go lang");
    }
  });

  it("strips legacy injected memory lines even if project-memory xml tags are missing", () => {
    const converted = buildConversationItem({
      id: "user-legacy-memory-1",
      type: "userMessage",
      content: [
        {
          type: "text",
          text: `[对话记录] 用户输入：我今天从辽阳开车回沈阳了。中午12点半走的。和我老婆一起。 助手输出摘要：好的！从辽阳回沈阳，路程不远...

我和谁一起回沈阳的`,
        },
      ],
    });

    expect(converted).toBeTruthy();
    expect(converted?.kind).toBe("message");
    if (converted?.kind === "message") {
      expect(converted.role).toBe("user");
      expect(converted.text).toBe("我和谁一起回沈阳的");
    }
  });

  it("unwraps unquoted /bin/zsh -lc rg commands", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: 'Command: /bin/zsh -lc rg -n "RouterDestination" src',
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(1);
      expect(prepared[0].entries[0].kind).toBe("search");
      expect(prepared[0].entries[0].label).toBe("RouterDestination in src");
    }
  });

  it("treats nl -ba as a read command", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: nl -ba src/foo.ts",
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(1);
      expect(prepared[0].entries[0].kind).toBe("read");
      expect(prepared[0].entries[0].detail ?? prepared[0].entries[0].label).toBe(
        "src/foo.ts",
      );
    }
  });

  it("summarizes piped nl commands using the left-hand read", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: nl -ba src/foo.ts | sed -n '1,10p'",
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(1);
      expect(prepared[0].entries[0].kind).toBe("read");
      expect(prepared[0].entries[0].detail ?? prepared[0].entries[0].label).toBe(
        "src/foo.ts",
      );
    }
  });

  it("does not trim pipes that appear inside quoted arguments", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: 'Command: rg "foo | bar" src',
        detail: "",
        status: "completed",
        output: "",
      },
    ];

    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("explore");
    if (prepared[0].kind === "explore") {
      expect(prepared[0].entries).toHaveLength(1);
      expect(prepared[0].entries[0].kind).toBe("search");
      expect(prepared[0].entries[0].label).toBe("foo | bar in src");
    }
  });

  it("keeps raw commands when they are not recognized", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: git status",
        detail: "",
        status: "completed",
        output: "",
      },
    ];
    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("tool");
  });

  it("keeps raw commands when they fail", () => {
    const items: ConversationItem[] = [
      {
        id: "cmd-1",
        kind: "tool",
        toolType: "commandExecution",
        title: "Command: cat src/foo.ts",
        detail: "",
        status: "failed",
        output: "No such file",
      },
    ];
    const prepared = prepareThreadItems(items);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].kind).toBe("tool");
  });

  it("builds file change items with summary details", () => {
    const item = buildConversationItem({
      type: "fileChange",
      id: "change-1",
      status: "done",
      changes: [
        {
          path: "foo.txt",
          kind: "add",
          diff: "diff --git a/foo.txt b/foo.txt",
        },
      ],
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "tool") {
      expect(item.title).toBe("File changes");
      expect(item.detail).toBe("A foo.txt");
      expect(item.output).toContain("diff --git a/foo.txt b/foo.txt");
      expect(item.changes?.[0]?.path).toBe("foo.txt");
    }
  });

  it("falls back to reasoning text when content is missing in streaming items", () => {
    const item = buildConversationItem({
      type: "reasoning",
      id: "reasoning-1",
      summary: "Planning unchecked tasks extraction",
      text: "I found the change folder and will extract unchecked tasks next.",
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "reasoning") {
      expect(item.summary).toBe("Planning unchecked tasks extraction");
      expect(item.content).toBe(
        "I found the change folder and will extract unchecked tasks next.",
      );
    }
  });

  it("falls back to reasoning text when content is missing in thread history items", () => {
    const item = buildConversationItemFromThreadItem({
      type: "reasoning",
      id: "reasoning-2",
      summary: "Checking event payload mapping",
      text: "I will verify item.completed payload fields before patching.",
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "reasoning") {
      expect(item.summary).toBe("Checking event payload mapping");
      expect(item.content).toBe(
        "I will verify item.completed payload fields before patching.",
      );
    }
  });

  it("extracts reasoning text from structured content objects", () => {
    const item = buildConversationItem({
      type: "reasoning",
      id: "reasoning-structured-1",
      summary: [{ text: "Inspecting risk points" }],
      content: [
        { type: "reasoning_text", text: "First, I will scan high-risk modules." },
        { value: "Then I will validate edge cases and error paths." },
      ],
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "reasoning") {
      expect(item.summary).toContain("Inspecting risk points");
      expect(item.content).toContain("First, I will scan high-risk modules.");
      expect(item.content).toContain("Then I will validate edge cases and error paths.");
    }
  });

  it("joins tokenized reasoning fragments without forced newlines", () => {
    const item = buildConversationItem({
      type: "reasoning",
      id: "reasoning-tokenized-1",
      summary: [{ text: "回忆记忆模块" }],
      content: ["好", "的，我来帮你回", "忆一下记", "忆模块的分", "析。"],
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "reasoning") {
      expect(item.content).toBe("好的，我来帮你回忆一下记忆模块的分析。");
      expect(item.content).not.toContain("\n");
    }
  });

  it("merges thread items preferring richer local tool output", () => {
    const remote: ConversationItem = {
      id: "tool-2",
      kind: "tool",
      toolType: "webSearch",
      title: "Web search",
      detail: "query",
      status: "ok",
      output: "short",
    };
    const local: ConversationItem = {
      id: "tool-2",
      kind: "tool",
      toolType: "webSearch",
      title: "Web search",
      detail: "query",
      output: "much longer output",
    };
    const merged = mergeThreadItems([remote], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe("tool");
    if (merged[0].kind === "tool") {
      expect(merged[0].output).toBe("much longer output");
      expect(merged[0].status).toBe("ok");
    }
  });

  it("prefers readable assistant message when remote snapshot is longer but duplicated", () => {
    const clean = "你好！我是你的 AI 联合架构师。有什么可以帮你的吗？";
    const remote: ConversationItem = {
      id: "assistant-merge-readable-1",
      kind: "message",
      role: "assistant",
      text: `${clean}\n\n${clean}\n\n${clean}`,
    };
    const local: ConversationItem = {
      id: "assistant-merge-readable-1",
      kind: "message",
      role: "assistant",
      text: clean,
    };

    const merged = mergeThreadItems([remote], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe("message");
    if (merged[0].kind === "message") {
      expect(merged[0].text).toBe(clean);
    }
  });

  it("builds user message text from mixed inputs", () => {
    const item = buildConversationItemFromThreadItem({
      type: "userMessage",
      id: "msg-1",
      content: [
        { type: "text", text: "Please" },
        { type: "skill", name: "Review" },
        { type: "image", url: "https://example.com/image.png" },
      ],
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "message") {
      expect(item.role).toBe("user");
      expect(item.text).toBe("Please $Review");
      expect(item.images).toEqual(["https://example.com/image.png"]);
    }
  });

  it("keeps image-only user messages without placeholder text", () => {
    const item = buildConversationItemFromThreadItem({
      type: "userMessage",
      id: "msg-2",
      content: [{ type: "image", url: "https://example.com/only.png" }],
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "message") {
      expect(item.role).toBe("user");
      expect(item.text).toBe("");
      expect(item.images).toEqual(["https://example.com/only.png"]);
    }
  });

  it("formats collab tool calls with receivers and agent states", () => {
    const item = buildConversationItem({
      type: "collabToolCall",
      id: "collab-1",
      tool: "handoff",
      status: "ok",
      senderThreadId: "thread-a",
      receiverThreadIds: ["thread-b"],
      newThreadId: "thread-c",
      prompt: "Coordinate work",
      agentStatus: { "agent-1": { status: "running" } },
    });
    expect(item).not.toBeNull();
    if (item && item.kind === "tool") {
      expect(item.title).toBe("Collab: handoff");
      expect(item.detail).toContain("From thread-a");
      expect(item.detail).toContain("thread-b, thread-c");
      expect(item.output).toBe("Coordinate work\n\nagent-1: running");
    }
  });

  it("parses ISO timestamps for thread updates", () => {
    const timestamp = getThreadTimestamp({ updated_at: "2025-01-01T00:00:00Z" });
    expect(timestamp).toBe(Date.parse("2025-01-01T00:00:00Z"));
  });

  it("returns 0 for invalid thread timestamps", () => {
    const timestamp = getThreadTimestamp({ updated_at: "not-a-date" });
    expect(timestamp).toBe(0);
  });

});
