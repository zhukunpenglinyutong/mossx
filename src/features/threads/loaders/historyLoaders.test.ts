import { describe, expect, it, vi } from "vitest";
import {
  createClaudeHistoryLoader,
  parseClaudeHistoryMessages,
} from "./claudeHistoryLoader";
import { createCodexHistoryLoader } from "./codexHistoryLoader";
import { createOpenCodeHistoryLoader } from "./opencodeHistoryLoader";

describe("history loaders", () => {
  it("loads codex history into normalized snapshot", async () => {
    const loader = createCodexHistoryLoader({
      workspaceId: "ws-1",
      resumeThread: vi.fn().mockResolvedValue({
        result: {
          thread: {
            user_input_queue: [
              {
                request_id: "req-1",
                params: {
                  turn_id: "turn-1",
                  item_id: "ask-1",
                  questions: [
                    {
                      id: "confirm",
                      header: "Confirm",
                      question: "Proceed?",
                      options: [{ label: "Yes", description: "Continue" }],
                    },
                  ],
                },
              },
            ],
            turns: [
              {
                id: "turn-1",
                explanation: "Plan first",
                plan: [{ step: "Inspect files", status: "in_progress" }],
                items: [
                  {
                    id: "msg-user-1",
                    type: "userMessage",
                    content: [{ type: "text", text: "hello" }],
                  },
                  {
                    id: "msg-assistant-1",
                    type: "agentMessage",
                    text: "hi there",
                  },
                ],
              },
            ],
          },
        },
      }),
    });

    const snapshot = await loader.load("thread-1");
    expect(snapshot.engine).toBe("codex");
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0]?.kind).toBe("message");
    expect(snapshot.plan?.steps).toEqual([
      { step: "Inspect files", status: "pending" },
    ]);
    expect(snapshot.userInputQueue).toEqual([
      {
        workspace_id: "ws-1",
        request_id: "req-1",
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "ask-1",
          questions: [
            {
              id: "confirm",
              header: "Confirm",
              question: "Proceed?",
              isOther: false,
              isSecret: false,
              options: [{ label: "Yes", description: "Continue" }],
            },
          ],
        },
      },
    ]);
  });

  it("loads claude jsonl messages and merges tool result into tool call", async () => {
    const loader = createClaudeHistoryLoader({
      workspaceId: "ws-2",
      workspacePath: "/tmp/ws-2",
      loadClaudeSession: vi.fn().mockResolvedValue({
        messages: [
          { kind: "message", id: "user-1", role: "user", text: "run test" },
          {
            kind: "tool",
            id: "tool-1",
            toolType: "commandExecution",
            title: "Command",
            text: "npm run test",
          },
          {
            kind: "tool",
            id: "tool-1-result",
            toolType: "result",
            title: "Command",
            text: "ok",
          },
        ],
      }),
    });

    const snapshot = await loader.load("claude:session-1");
    expect(snapshot.engine).toBe("claude");
    expect(snapshot.items).toHaveLength(2);
    const tool = snapshot.items[1];
    expect(tool?.kind).toBe("tool");
    if (tool?.kind === "tool") {
      expect(tool.status).toBe("completed");
      expect(tool.output).toBe("ok");
    }
  });

  it("merges Claude tool result by tool_use_id and avoids duplicate tool rows", () => {
    const items = parseClaudeHistoryMessages([
      {
        id: "toolu_123",
        kind: "tool",
        tool_name: "read",
        text: '{"file_path":"README.md"}',
      },
      {
        id: "result_456",
        kind: "tool",
        toolType: "result",
        tool_use_id: "toolu_123",
        text: "ok",
      },
    ]);

    const toolItems = items.filter(
      (item): item is Extract<(typeof items)[number], { kind: "tool" }> =>
        item.kind === "tool",
    );
    expect(toolItems).toHaveLength(1);
    expect(toolItems[0]).toEqual(
      expect.objectContaining({
        id: "toolu_123",
        status: "completed",
        output: "ok",
      }),
    );
  });

  it("reconstructs Claude Write/Edit history entries as file changes", () => {
    const items = parseClaudeHistoryMessages([
      {
        id: "write-1",
        kind: "tool",
        tool_name: "Write",
        toolInput: {
          file_path: "src/NewFile.ts",
          content: "export const value = 1;",
        },
      },
      {
        id: "write-1-result",
        kind: "tool",
        toolType: "result",
        tool_use_id: "write-1",
        text: "File created successfully",
        toolOutput: {
          type: "create",
          filePath: "src/NewFile.ts",
          content: "export const value = 1;",
        },
      },
      {
        id: "edit-1",
        kind: "tool",
        tool_name: "Edit",
        toolInput: {
          file_path: "src/App.tsx",
          old_string: "const before = true;",
          new_string: "const after = true;",
        },
      },
      {
        id: "edit-1-result",
        kind: "tool",
        toolType: "result",
        tool_use_id: "edit-1",
        text: "The file has been updated successfully.",
        toolOutput: {
          filePath: "src/App.tsx",
          oldString: "const before = true;",
          newString: "const after = true;",
        },
      },
    ]);

    const toolItems = items.filter(
      (item): item is Extract<(typeof items)[number], { kind: "tool" }> =>
        item.kind === "tool",
    );
    expect(toolItems).toHaveLength(2);
    expect(toolItems[0]).toEqual(
      expect.objectContaining({
        id: "write-1",
        toolType: "fileChange",
        status: "completed",
        changes: [
          expect.objectContaining({
            path: "src/NewFile.ts",
            kind: "add",
          }),
        ],
      }),
    );
    expect(toolItems[0]?.changes?.[0]?.diff).toContain("+export const value = 1;");
    expect(toolItems[1]).toEqual(
      expect.objectContaining({
        id: "edit-1",
        toolType: "fileChange",
        status: "completed",
        changes: [
          expect.objectContaining({
            path: "src/App.tsx",
            kind: "modified",
          }),
        ],
      }),
    );
    expect(toolItems[1]?.changes?.[0]?.diff).toContain("-const before = true;");
    expect(toolItems[1]?.changes?.[0]?.diff).toContain("+const after = true;");
  });

  it("collapses repeated claude reasoning snapshots with different ids", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "reasoning",
        id: "reason-1",
        text: "先检查项目目录结构和入口模块，再确认核心路由",
      },
      {
        kind: "reasoning",
        id: "reason-2",
        text: "先检查项目目录结构和入口模块，再确认核心路由并定位状态来源",
      },
      {
        kind: "reasoning",
        id: "reason-3",
        text: "先检查项目目录结构和入口模块，再确认核心路由并定位状态来源",
      },
    ]);

    const reasoning = items.filter(
      (item): item is Extract<(typeof items)[number], { kind: "reasoning" }> =>
        item.kind === "reasoning",
    );
    expect(reasoning).toHaveLength(1);
    expect(reasoning[0]?.content).toBe(
      "先检查项目目录结构和入口模块，再确认核心路由并定位状态来源",
    );
  });

  it("emits fallback warnings for claude loader when workspace path is unavailable", async () => {
    const loader = createClaudeHistoryLoader({
      workspaceId: "ws-3",
      workspacePath: null,
      loadClaudeSession: vi.fn(),
    });

    const snapshot = await loader.load("claude:session-missing");
    expect(snapshot.items).toEqual([]);
    expect(snapshot.fallbackWarnings.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "missing_items",
        "missing_plan",
        "missing_user_input_queue",
      ]),
    );
  });

  it("emits fallback warnings for opencode loader when thread payload is missing", async () => {
    const loader = createOpenCodeHistoryLoader({
      workspaceId: "ws-4",
      resumeThread: vi.fn().mockResolvedValue(null),
    });

    const snapshot = await loader.load("opencode:ses_missing");
    expect(snapshot.items).toEqual([]);
    expect(snapshot.fallbackWarnings.map((entry) => entry.code)).toContain(
      "missing_items",
    );
  });
});
