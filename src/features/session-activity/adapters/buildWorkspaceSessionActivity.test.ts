import { describe, expect, it } from "vitest";
import type { ConversationItem, ThreadSummary } from "../../../types";
import { buildWorkspaceSessionActivity } from "./buildWorkspaceSessionActivity";

function toolItem(
  id: string,
  overrides: Partial<Extract<ConversationItem, { kind: "tool" }>>,
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id,
    kind: "tool",
    toolType: "commandExecution",
    title: "Command: pnpm test",
    detail: "",
    ...overrides,
  };
}

describe("buildWorkspaceSessionActivity", () => {
  it("aggregates root subtree events and excludes unrelated threads", () => {
    const threads: ThreadSummary[] = [
      { id: "root", name: "Root", updatedAt: 1000 },
      { id: "child", name: "Child", updatedAt: 2000 },
      { id: "other", name: "Other", updatedAt: 3000 },
    ];
    const itemsByThread = {
      root: [
        toolItem("cmd-1", {
          toolType: "commandExecution",
          title: "Command: pnpm test",
          status: "completed",
          output: "done",
        }),
      ],
      child: [
        toolItem("task-1", {
          toolType: "taskTool",
          title: "Tool: task",
          detail: JSON.stringify({ description: "Audit current panel" }),
          status: "running",
        }),
        toolItem("file-1", {
          toolType: "fileChange",
          title: "File changes",
          detail: "M src/App.tsx",
          status: "completed",
          changes: [{ path: "src/App.tsx", diff: "@@ -1 +1 @@\n-old\n+new" }],
        }),
      ],
      other: [
        toolItem("cmd-2", {
          toolType: "commandExecution",
          title: "Command: rm -rf tmp",
          status: "completed",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "child",
      threads,
      itemsByThread,
      threadParentById: { child: "root" },
      threadStatusById: {
        root: { isProcessing: false },
        child: { isProcessing: true },
        other: { isProcessing: false },
      },
    });

    expect(result.rootThreadId).toBe("root");
    expect(result.relevantThreadIds).toEqual(["root", "child"]);
    expect(result.timeline.map((event) => event.kind)).toEqual([
      "fileChange",
      "task",
      "command",
    ]);
    expect(result.timeline[0]?.jumpTarget).toEqual({
      type: "file",
      path: "src/App.tsx",
      line: 1,
      markers: {
        added: [],
        modified: [1],
      },
    });
    expect(result.timeline.every((event) => event.threadId !== "other")).toBe(true);
    expect(result.isProcessing).toBe(true);
  });

  it("uses fallback linking when direct parent is missing and marks provenance", () => {
    const threads: ThreadSummary[] = [
      { id: "root", name: "Root", updatedAt: 1000 },
      { id: "child", name: "Child", updatedAt: 1100 },
    ];
    const itemsByThread = {
      root: [
        toolItem("link-1", {
          toolType: "collabToolCall",
          title: "Collab: task",
          detail: "From root → child",
          status: "completed",
        }),
      ],
      child: [
        toolItem("cmd-1", {
          toolType: "commandExecution",
          title: "Command: pnpm lint",
          status: "running",
          output: "checking",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "child",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: {
        child: { isProcessing: true },
      },
    });

    expect(result.rootThreadId).toBe("root");
    expect(result.relevantThreadIds).toEqual(["root", "child"]);
    expect(result.timeline[0]?.relationshipSource).toBe("fallbackLinking");
  });

  it("shows reasoning events as a dedicated timeline category", () => {
    const threads: ThreadSummary[] = [{ id: "root", name: "Root", updatedAt: 1000 }];
    const itemsByThread = {
      root: [
        { id: "reason-1", kind: "reasoning", summary: "thinking", content: "..." } satisfies ConversationItem,
        toolItem("cmd-1", {
          toolType: "commandExecution",
          title: "Command: pnpm test",
          status: "completed",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "root",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: {},
    });

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline.map((event) => event.kind)).toEqual(["command", "reasoning"]);
    expect(result.timeline[1]?.summary).toBe("Thinking · thinking");
  });

  it("splits claude realtime multiline reasoning summary into separate activity events", () => {
    const threads: ThreadSummary[] = [{ id: "claude-pending-1", name: "Claude", updatedAt: 1000 }];
    const itemsByThread = {
      "claude-pending-1": [
        {
          id: "reason-claude-1",
          kind: "reasoning" as const,
          summary: "step 1\nstep 2\nstep 3",
          content: "detailed reasoning preview",
        } satisfies ConversationItem,
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "claude-pending-1",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { "claude-pending-1": { isProcessing: true } },
    });

    expect(result.timeline).toHaveLength(3);
    expect(result.timeline.map((event) => event.summary)).toEqual([
      "Thinking · step 3",
      "Thinking · step 2",
      "Thinking · step 1",
    ]);
    expect(result.timeline.map((event) => event.status)).toEqual([
      "running",
      "completed",
      "completed",
    ]);
    expect(result.timeline[0]?.eventId).toBe("reasoning:reason-claude-1:2");
  });

  it("keeps non-claude multiline reasoning summary as a single activity event", () => {
    const threads: ThreadSummary[] = [{ id: "root", name: "Root", updatedAt: 1000 }];
    const itemsByThread = {
      root: [
        {
          id: "reason-generic-1",
          kind: "reasoning" as const,
          summary: "step 1\nstep 2\nstep 3",
          content: "detailed reasoning preview",
        } satisfies ConversationItem,
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "root",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { root: { isProcessing: true } },
    });

    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]?.eventId).toBe("reasoning:reason-generic-1");
    expect(result.timeline[0]?.status).toBe("running");
  });

  it("extracts structured command detail for inline expansion", () => {
    const threads: ThreadSummary[] = [{ id: "root", name: "Root", updatedAt: 1000 }];
    const itemsByThread = {
      root: [
        toolItem("cmd-1", {
          toolType: "commandExecution",
          title: "Command",
          detail: JSON.stringify({
            command: "ls -la",
            description: "列出当前目录内容",
            cwd: "/workspace/demo",
          }),
          status: "running",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "root",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { root: { isProcessing: true } },
    });

    expect(result.timeline[0]?.summary).toBe("ls -la");
    expect(result.timeline[0]?.commandText).toBe("ls -la");
    expect(result.timeline[0]?.commandDescription).toBe("列出当前目录内容");
    expect(result.timeline[0]?.commandWorkingDirectory).toBe("/workspace/demo");
  });

  it("settles stale running events once the thread is no longer processing", () => {
    const threads: ThreadSummary[] = [{ id: "root", name: "Root", updatedAt: 1000 }];
    const itemsByThread = {
      root: [
        toolItem("cmd-1", {
          toolType: "commandExecution",
          title: "Command: find . -maxdepth 2",
          status: "running",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "root",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { root: { isProcessing: false } },
    });

    expect(result.isProcessing).toBe(false);
    expect(result.timeline[0]?.status).toBe("completed");
    expect(result.emptyState).toBe("completed");
  });

  it("shows Claude inspection tools in realtime activity even without commandExecution items", () => {
    const threads: ThreadSummary[] = [
      { id: "claude-pending-1", name: "Claude session", updatedAt: 1000 },
    ];
    const itemsByThread = {
      "claude-pending-1": [
        toolItem("tool-read", {
          toolType: "mcpToolCall",
          title: "Tool: read",
          detail: JSON.stringify({ filePath: "/workspace/package.json" }),
          status: "started",
        }),
        toolItem("tool-glob", {
          toolType: "mcpToolCall",
          title: "Tool: glob",
          detail: JSON.stringify({ pattern: "**/*.py" }),
          status: "started",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "claude-pending-1",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { "claude-pending-1": { isProcessing: true } },
    });

    expect(result.timeline).toHaveLength(2);
    expect(result.timeline.map((event) => event.kind)).toEqual(["task", "task"]);
    expect(result.timeline[0]?.summary).toBe("Search · **/*.py");
    expect(result.timeline[1]?.summary).toBe("Read · /workspace/package.json");
    expect(result.timeline[1]?.jumpTarget).toEqual({
      type: "file",
      path: "/workspace/package.json",
    });
    expect(result.emptyState).toBe("running");
  });

  it("extracts read target from snake_case nested arguments", () => {
    const threads: ThreadSummary[] = [{ id: "claude-pending-1", name: "Claude", updatedAt: 1000 }];
    const itemsByThread = {
      "claude-pending-1": [
        toolItem("tool-read", {
          toolType: "mcpToolCall",
          title: "Tool: mcp__filesystem__read_file",
          detail: JSON.stringify({
            input: { file_path: "/workspace/README.md" },
          }),
          status: "started",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "claude-pending-1",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { "claude-pending-1": { isProcessing: true } },
    });

    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]?.kind).toBe("task");
    expect(result.timeline[0]?.summary).toBe("Read · /workspace/README.md");
    expect(result.timeline[0]?.jumpTarget).toEqual({
      type: "file",
      path: "/workspace/README.md",
    });
  });

  it("treats namespaced exec_command tool as command event", () => {
    const threads: ThreadSummary[] = [{ id: "claude-pending-1", name: "Claude", updatedAt: 1000 }];
    const itemsByThread = {
      "claude-pending-1": [
        toolItem("tool-cmd", {
          toolType: "mcpToolCall",
          title: "Tool: mcp__codex__exec_command",
          detail: JSON.stringify({
            cmd: "ls -la",
            cwd: "/workspace",
          }),
          status: "running",
          output: "README.md\nsrc\n",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "claude-pending-1",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { "claude-pending-1": { isProcessing: true } },
    });

    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]?.kind).toBe("command");
    expect(result.timeline[0]?.summary).toBe("ls -la");
    expect(result.timeline[0]?.commandWorkingDirectory).toBe("/workspace");
  });

  it("expands explore snapshots into session activity events", () => {
    const threads: ThreadSummary[] = [{ id: "root", name: "Root", updatedAt: 1000 }];
    const itemsByThread = {
      root: [
        {
          id: "explore-1",
          kind: "explore" as const,
          status: "explored" as const,
          entries: [
            { kind: "list" as const, label: "/workspace" },
            { kind: "search" as const, label: "*.md" },
            { kind: "read" as const, label: "/workspace/README.md" },
            { kind: "run" as const, label: "wc -l README.md", detail: "统计代码行数" },
          ],
        } satisfies ConversationItem,
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "root",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { root: { isProcessing: true } },
    });

    expect(result.timeline).toHaveLength(4);
    expect(result.timeline.map((event) => event.kind)).toEqual([
      "explore",
      "explore",
      "explore",
      "explore",
    ]);
    expect(result.timeline[0]?.summary).toBe("wc -l README.md");
    expect(result.timeline[1]?.summary).toBe("Read · /workspace/README.md");
    expect(result.timeline[1]?.jumpTarget).toEqual({
      type: "file",
      path: "/workspace/README.md",
    });
    expect(result.timeline[2]?.summary).toBe("Search · *.md");
    expect(result.timeline[3]?.summary).toBe("List · /workspace");
  });

  it("splits activity events by user conversation turns", () => {
    const threads: ThreadSummary[] = [{ id: "root", name: "Root", updatedAt: 1000 }];
    const itemsByThread = {
      root: [
        {
          id: "user-1",
          kind: "message" as const,
          role: "user" as const,
          text: "先看看项目结构",
        } satisfies ConversationItem,
        toolItem("task-1", {
          toolType: "mcpToolCall",
          title: "Tool: glob",
          detail: JSON.stringify({ pattern: "**/*.md" }),
          status: "completed",
        }),
        toolItem("task-2", {
          toolType: "mcpToolCall",
          title: "Tool: read",
          detail: JSON.stringify({ filePath: "/workspace/README.md" }),
          status: "completed",
        }),
        {
          id: "user-2",
          kind: "message" as const,
          role: "user" as const,
          text: "再检查 Python 文件",
        } satisfies ConversationItem,
        toolItem("task-3", {
          toolType: "mcpToolCall",
          title: "Tool: glob",
          detail: JSON.stringify({ pattern: "**/*.py" }),
          status: "running",
        }),
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "root",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { root: { isProcessing: true } },
    });

    expect(result.timeline).toHaveLength(3);
    expect(result.timeline.map((event) => event.turnIndex)).toEqual([2, 1, 1]);
    expect(new Set(result.timeline.map((event) => event.turnId)).size).toBe(2);
  });

  it("marks only latest-turn reasoning as running while older turn reasoning is completed", () => {
    const threads: ThreadSummary[] = [{ id: "root", name: "Root", updatedAt: 1000 }];
    const itemsByThread = {
      root: [
        {
          id: "user-1",
          kind: "message" as const,
          role: "user" as const,
          text: "你好",
        } satisfies ConversationItem,
        {
          id: "reason-1",
          kind: "reasoning" as const,
          summary: "old turn thinking",
          content: "old turn detail",
        } satisfies ConversationItem,
        {
          id: "user-2",
          kind: "message" as const,
          role: "user" as const,
          text: "继续",
        } satisfies ConversationItem,
        {
          id: "reason-2",
          kind: "reasoning" as const,
          summary: "latest turn thinking",
          content: "latest turn detail",
        } satisfies ConversationItem,
      ],
    };

    const result = buildWorkspaceSessionActivity({
      activeThreadId: "root",
      threads,
      itemsByThread,
      threadParentById: {},
      threadStatusById: { root: { isProcessing: true } },
    });

    const latestReasoning = result.timeline.find((event) => event.eventId === "reasoning:reason-2");
    const olderReasoning = result.timeline.find((event) => event.eventId === "reasoning:reason-1");
    expect(latestReasoning?.status).toBe("running");
    expect(olderReasoning?.status).toBe("completed");
  });
});
