import { describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import {
  createClaudeHistoryLoader,
  parseClaudeHistoryMessages,
} from "./claudeHistoryLoader";

type AssistantMessageItem = Extract<ConversationItem, { kind: "message" }> & {
  role: "assistant";
};

function syntheticContinuationSummaryText() {
  return [
    "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.",
    "",
    "Summary:",
    "Primary Request and Intent:",
    "The user asked to analyze the current project.",
    "",
    "Current Work:",
    "Continue the conversation from where it left off without asking the user any further questions.",
  ].join("\n");
}

describe("parseClaudeHistoryMessages", () => {
  it("filters Codex control-plane messages from Claude history", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        id: "control-init",
        role: "user",
        method: "initialize",
        params: {
          clientInfo: { name: "ccgui", title: "ccgui" },
          capabilities: { experimentalApi: true },
        },
        text: "",
      },
      {
        kind: "message",
        id: "control-instructions",
        role: "user",
        text: 'developer_instructions="follow workspace policy"',
      },
      {
        kind: "message",
        id: "real-user",
        role: "user",
        text: "Continue the real task",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "real-user",
      kind: "message",
      role: "user",
      text: "Continue the real task",
    });
  });

  it("does not filter normal user text mentioning app-server", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        id: "real-user-app-server",
        role: "user",
        text: "Please inspect why app-server appears in the logs.",
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "real-user-app-server",
      kind: "message",
      role: "user",
    });
  });

  it("filters synthetic continuation summaries without hiding normal summary discussion", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        id: "synthetic-continuation",
        role: "user",
        text: syntheticContinuationSummaryText(),
        isVisibleInTranscriptOnly: true,
        isCompactSummary: true,
        cwd: "C:\\Users\\fay\\code\\vinci",
      },
      {
        kind: "message",
        id: "legacy-raw-continuation",
        isSynthetic: true,
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: syntheticContinuationSummaryText(),
            },
          ],
        },
        cwd: "/Users/fay/code/vinci",
      },
      {
        kind: "message",
        id: "real-user-question",
        role: "user",
        text: "Why did `This session is being continued from a previous conversation` appear in my chat?",
      },
      {
        kind: "message",
        id: "real-user-pasted-summary",
        role: "user",
        text: syntheticContinuationSummaryText(),
      },
      {
        kind: "message",
        id: "real-assistant",
        role: "assistant",
        text: "It is a synthetic continuation summary leaking from runtime history.",
      },
    ]);

    expect(items).toHaveLength(3);
    expect(items).toEqual([
      expect.objectContaining({
        id: "real-user-question",
        kind: "message",
        role: "user",
      }),
      expect.objectContaining({
        id: "real-user-pasted-summary",
        kind: "message",
        role: "user",
      }),
      expect.objectContaining({
        id: "real-assistant",
        kind: "message",
        role: "assistant",
      }),
    ]);
    expect(items[1]).toEqual(
      expect.objectContaining({
        text: syntheticContinuationSummaryText(),
      }),
    );
  });

  it("formats Claude local-control messages and hides internal rows", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        id: "permission-mode",
        type: "permission-mode",
        role: "user",
        text: "default",
        cwd: "/Users/fay/code/vinci",
      },
      {
        kind: "message",
        id: "resume-command",
        role: "user",
        text: "<command-name>/resume</command-name>",
        cwd: "C:\\Users\\fay\\code\\vinci",
      },
      {
        kind: "message",
        id: "resume-failed",
        role: "user",
        text: "<local-command-stdout>Session \u001b[1m1778306483383\u001b[22m was not found.</local-command-stdout>",
        cwd: "C:\\Users\\fay\\code\\vinci",
      },
      {
        kind: "message",
        id: "model-changed",
        role: "user",
        text: "<local-command-stdout>Set model to \u001b[1mMiniMax-M2.7\u001b[22m</local-command-stdout>",
        cwd: "/Users/fay/code/vinci",
      },
      {
        kind: "message",
        id: "interrupted",
        role: "user",
        text: "[Request interrupted by user]",
      },
      {
        kind: "message",
        id: "synthetic-no-response",
        role: "assistant",
        model: "<synthetic>",
        text: "No response requested.",
      },
      {
        id: "local-command-system",
        kind: "message",
        role: "user",
        message: {
          type: "system",
          subtype: "local_command",
        },
        text: "local command metadata",
      },
      {
        kind: "message",
        id: "real-user",
        role: "user",
        text: "你好",
      },
    ]);

    expect(items).toHaveLength(4);
    const controlEvents = items.filter(
      (item): item is Extract<ConversationItem, { kind: "tool" }> =>
        item.kind === "tool" && item.toolType === "claudeControlEvent",
    );
    expect(controlEvents).toHaveLength(3);
    expect(controlEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "resume-failed",
          title: "恢复失败",
          output: "Session 1778306483383 was not found.",
          status: "failed",
        }),
        expect.objectContaining({
          id: "model-changed",
          title: "模型已切换",
          output: "Set model to MiniMax-M2.7",
          status: "completed",
        }),
        expect.objectContaining({
          id: "interrupted",
          title: "用户已中断",
          output: "[Request interrupted by user]",
        }),
      ]),
    );
    expect(JSON.stringify(items)).not.toContain("<local-command-stdout>");
    expect(JSON.stringify(items)).not.toContain("<command-name>");
    expect(JSON.stringify(items)).not.toContain("No response requested");
    expect(JSON.stringify(items)).not.toContain("local command metadata");
    expect(items[3]).toMatchObject({
      id: "real-user",
      kind: "message",
      role: "user",
      text: "你好",
    });
  });

  it("preserves backend-formatted Claude control events as tool items", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "backend-resume-event",
        role: "system",
        toolType: "claudeControlEvent",
        title: "Resume failed",
        text: "Session 1778306483383 was not found.",
        status: "failed",
        tool_input: {
          eventType: "resumeFailed",
          source: "claude-history",
        },
        tool_output: {
          detail: "Session 1778306483383 was not found.",
        },
      },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: "backend-resume-event",
        kind: "tool",
        toolType: "claudeControlEvent",
        title: "恢复失败",
        output: "Session 1778306483383 was not found.",
        status: "failed",
      }),
    ]);
  });

  it("skips malformed history rows without failing restore", () => {
    const items = parseClaudeHistoryMessages([
      null,
      "corrupt row",
      ["nested array"],
      {
        kind: "message",
        id: "valid-user",
        role: "user",
        text: "still visible",
      },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: "valid-user",
        kind: "message",
        role: "user",
        text: "still visible",
      }),
    ]);
  });

  it("preserves transcript-style bash output and command metadata", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-1",
        tool_name: "bash",
        tool_input: {
          command: "git log --oneline -10",
          description: "查看最近的 git 提交历史",
        },
      },
      {
        kind: "tool",
        id: "tool-1-result",
        toolType: "result",
        text: "",
        tool_output: {
          output: "abc123 first commit\ndef456 second commit\n",
          exit: 0,
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-1",
      kind: "tool",
      toolType: "bash",
      title: "bash",
      status: "completed",
      output: "abc123 first commit\ndef456 second commit\n",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("git log --oneline -10");
      expect(items[0].detail).toContain("查看最近的 git 提交历史");
    }
  });

  it("preserves non-command tool input payload for read tools", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-read-1",
        tool_name: "read_file",
        tool_input: {
          file_path: "/workspace/README.md",
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-read-1",
      kind: "tool",
      toolType: "read_file",
      title: "read_file",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("file_path");
      expect(items[0].detail).toContain("/workspace/README.md");
    }
  });

  it("preserves full command tool_input payload so session activity can read cwd/argv", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-bash-1",
        tool_name: "bash",
        tool_input: {
          argv: ["zsh", "-lc", "pnpm vitest"],
          cwd: "/workspace/project",
          description: "run tests",
        },
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "tool-bash-1",
      kind: "tool",
      toolType: "bash",
      title: "bash",
      status: "started",
    });
    if (items[0]?.kind === "tool") {
      expect(items[0].detail).toContain("argv");
      expect(items[0].detail).toContain("/workspace/project");
      expect(items[0].detail).toContain("run tests");
    }
  });

  it("maps AskUserQuestion user answer message into submitted history block", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-ask-1",
        tool_name: "AskUserQuestion",
        input: {
          questions: [
            {
              id: "q-0",
              header: "技术偏好",
              question: "你关注哪些方面？",
              options: [
                { label: "代码质量", description: "可维护性" },
                { label: "性能优化", description: "响应速度" },
              ],
            },
          ],
        },
      },
      {
        kind: "message",
        role: "user",
        id: "msg-user-1",
        text: "The user answered the AskUserQuestion: 代码质量, 性能优化. Please continue based on this selection.",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "tool-ask-1",
      kind: "tool",
      toolType: "AskUserQuestion",
      status: "completed",
      output: "代码质量, 性能优化",
    });
    expect(items[1]).toMatchObject({
      id: "request-user-input-submitted-tool-ask-1",
      kind: "tool",
      toolType: "requestUserInputSubmitted",
      status: "completed",
    });
    if (items[1]?.kind === "tool") {
      const parsed = JSON.parse(items[1].detail);
      expect(parsed.schema).toBe("requestUserInputSubmitted/v1");
      expect(parsed.questions[0].question).toBe("你关注哪些方面？");
      expect(parsed.questions[0].selectedOptions).toEqual([
        "代码质量",
        "性能优化",
      ]);
    }
  });

  it("keeps user image attachments for message rows even when text is empty", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "msg-user-image-1",
        text: "",
        images: ["data:image/png;base64,AAAA"],
      },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "msg-user-image-1",
      kind: "message",
      role: "user",
      images: ["data:image/png;base64,AAAA"],
    });
  });

  it("parses legacy single-question AskUserQuestion payloads and answer text variants", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "tool",
        id: "tool-ask-legacy-1",
        tool_name: "AskUserQuestion",
        tool_input: {
          header: "项目类型",
          question: "请选择一个项目类型",
          options: [
            { label: "Web应用", description: "浏览器端项目" },
            { label: "CLI工具", description: "命令行项目" },
          ],
        },
      },
      {
        kind: "message",
        role: "user",
        id: "msg-user-legacy-1",
        text: "The user answered the AskUserQuestion: Web应用 Please continue based on this selection.",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "tool-ask-legacy-1",
      kind: "tool",
      status: "completed",
      output: "Web应用",
    });
    expect(items[1]).toMatchObject({
      id: "request-user-input-submitted-tool-ask-legacy-1",
      kind: "tool",
      toolType: "requestUserInputSubmitted",
      status: "completed",
    });
    if (items[1]?.kind === "tool") {
      const parsed = JSON.parse(items[1].detail);
      expect(parsed.questions[0].question).toBe("请选择一个项目类型");
      expect(parsed.questions[0].selectedOptions).toEqual(["Web应用"]);
    }
  });

  it("marks the last assistant message of each turn as final for history restore", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-1",
        text: "Q1",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-1a",
        text: "A1-part1",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-1b",
        text: "A1-part2",
      },
      {
        kind: "message",
        role: "user",
        id: "user-2",
        text: "Q2",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-2",
        text: "A2",
      },
    ]);

    const assistantItems = items.filter(
      (item): item is AssistantMessageItem =>
        item.kind === "message" && item.role === "assistant",
    );

    expect(assistantItems).toHaveLength(3);
    expect(assistantItems[0]?.id).toBe("assistant-1a");
    expect(assistantItems[0]?.isFinal).not.toBe(true);
    expect(assistantItems[1]?.id).toBe("assistant-1b");
    expect(assistantItems[1]?.isFinal).toBe(true);
    expect(assistantItems[2]?.id).toBe("assistant-2");
    expect(assistantItems[2]?.isFinal).toBe(true);
  });

  it("respects explicit assistant final flags from Claude history rows", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-1",
        text: "Q1",
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-explicit-1",
        text: "A1",
        metadata: { is_final: true },
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-explicit-2",
        text: "A1 follow-up",
      },
    ]);

    const assistantItems = items.filter(
      (item): item is AssistantMessageItem =>
        item.kind === "message" && item.role === "assistant",
    );

    expect(assistantItems).toHaveLength(2);
    expect(assistantItems[0]?.id).toBe("assistant-explicit-1");
    expect(assistantItems[0]?.isFinal).toBe(true);
    expect(assistantItems[1]?.id).toBe("assistant-explicit-2");
    expect(assistantItems[1]?.isFinal).not.toBe(true);
  });

  it("hydrates final completion time and duration from Claude message timestamps", () => {
    const startedAt = "2026-04-01T08:00:00.000Z";
    const completedAt = "2026-04-01T08:00:07.000Z";
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-timed-1",
        text: "Q1",
        timestamp: startedAt,
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-timed-1",
        text: "A1",
        timestamp: completedAt,
      },
    ]);

    const assistant = items.find(
      (item): item is AssistantMessageItem =>
        item.kind === "message" && item.role === "assistant",
    );

    expect(assistant).toBeTruthy();
    expect(assistant?.isFinal).toBe(true);
    expect(assistant?.finalCompletedAt).toBe(Date.parse(completedAt));
    expect(assistant?.finalDurationMs).toBe(7_000);
  });

  it("reconstructs synthetic approval resume assistant text into file change history items", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "assistant",
        id: "assistant-approval-resume-1",
        text: [
          "Completed approved operations:",
          "- Approved and wrote ccc.txt",
          "- Approved and wrote bbb.txt",
          "- Approved and wrote aaa1.txt",
          "Please continue from the current workspace state and finish the original task.",
        ].join("\n"),
      },
    ]);

    expect(items).toHaveLength(3);
    expect(items).toEqual([
      expect.objectContaining({
        id: "assistant-approval-resume-1-approval-1",
        kind: "tool",
        toolType: "fileChange",
        status: "completed",
        output: "Approved and wrote ccc.txt",
        changes: [expect.objectContaining({ path: "ccc.txt", kind: "add" })],
      }),
      expect.objectContaining({
        id: "assistant-approval-resume-1-approval-2",
        kind: "tool",
        toolType: "fileChange",
        status: "completed",
        output: "Approved and wrote bbb.txt",
        changes: [expect.objectContaining({ path: "bbb.txt", kind: "add" })],
      }),
      expect.objectContaining({
        id: "assistant-approval-resume-1-approval-3",
        kind: "tool",
        toolType: "fileChange",
        status: "completed",
        output: "Approved and wrote aaa1.txt",
        changes: [expect.objectContaining({ path: "aaa1.txt", kind: "add" })],
      }),
    ]);
  });

  it("prefers structured approval resume marker over english summary parsing", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "assistant",
        id: "assistant-approval-marker-1",
        text: [
          '<ccgui-approval-resume>[{"summary":"Approved and updated ccc.txt","path":"ccc.txt","kind":"modified","status":"completed"},{"summary":"Approved and wrote aaa1.txt","path":"aaa1.txt","kind":"add","status":"completed"}]</ccgui-approval-resume>',
          "Completed approved operations:",
          "- Approved and wrote wrong.txt",
          "Please continue from the current workspace state and finish the original task.",
        ].join("\n"),
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "assistant-approval-marker-1-approval-1",
        kind: "tool",
        toolType: "fileChange",
        output: "Approved and updated ccc.txt",
        changes: [
          expect.objectContaining({ path: "ccc.txt", kind: "modified" }),
        ],
      }),
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        id: "assistant-approval-marker-1-approval-2",
        kind: "tool",
        toolType: "fileChange",
        output: "Approved and wrote aaa1.txt",
        changes: [expect.objectContaining({ path: "aaa1.txt", kind: "add" })],
      }),
    );
  });

  it("skips synthetic approval resume prompts that were injected as user messages", () => {
    const items = parseClaudeHistoryMessages([
      {
        kind: "message",
        role: "user",
        id: "user-real-1",
        text: "创建三个文件",
      },
      {
        kind: "message",
        role: "user",
        id: "user-internal-approval-resume",
        text: [
          '<ccgui-approval-resume>[{"summary":"Approved and wrote bbb.txt","path":"bbb.txt","kind":"add","status":"completed"}]</ccgui-approval-resume>',
          "Approved and wrote bbb.txt",
          "Please continue from the current workspace state and finish the original task.",
        ].join("\n"),
      },
      {
        kind: "message",
        role: "assistant",
        id: "assistant-final-1",
        text: "三个文件都创建好了。",
      },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "user-real-1",
      kind: "message",
      role: "user",
      text: "创建三个文件",
    });
    expect(items[1]).toMatchObject({
      id: "assistant-final-1",
      kind: "message",
      role: "assistant",
      text: "三个文件都创建好了。",
    });
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
});

describe("createClaudeHistoryLoader", () => {
  it("loads claude jsonl messages and merges tool result into tool call", async () => {
    const loader = createClaudeHistoryLoader({
      workspaceId: "ws-2",
      workspacePath: "/tmp/ws-2",
      loadClaudeSession: vi.fn().mockResolvedValue({
        messages: [
          {
            kind: "message",
            id: "user-1",
            role: "user",
            text: "run test",
            images: ["/tmp/claude-shot.png"],
          },
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
    expect(snapshot.items[0]).toEqual(
      expect.objectContaining({
        kind: "message",
        role: "user",
        images: ["/tmp/claude-shot.png"],
      }),
    );
    const tool = snapshot.items[1];
    expect(tool?.kind).toBe("tool");
    if (tool?.kind === "tool") {
      expect(tool.status).toBe("completed");
      expect(tool.output).toBe("ok");
    }
  });

  it("hydrates claude pending askuserquestion into snapshot userInputQueue", async () => {
    const loader = createClaudeHistoryLoader({
      workspaceId: "ws-claude-ask",
      workspacePath: "/tmp/ws-claude-ask",
      loadClaudeSession: vi.fn().mockResolvedValue({
        messages: [
          {
            kind: "tool",
            id: "tool-ask-pending-1",
            tool_name: "AskUserQuestion",
            tool_input: {
              questions: [
                {
                  id: "project-type",
                  header: "项目类型",
                  question: "请选择项目类型",
                  multiSelect: false,
                  options: [
                    { label: "Web应用", description: "前端应用" },
                    { label: "服务端", description: "后端服务" },
                  ],
                },
              ],
            },
          },
        ],
      }),
    });

    const snapshot = await loader.load("claude:session-ask-pending");
    expect(snapshot.engine).toBe("claude");
    expect(snapshot.userInputQueue).toEqual([
      {
        workspace_id: "ws-claude-ask",
        request_id: "tool-ask-pending-1",
        params: {
          thread_id: "claude:session-ask-pending",
          turn_id: "",
          item_id: "tool-ask-pending-1",
          questions: [
            {
              id: "project-type",
              header: "项目类型",
              question: "请选择项目类型",
              isOther: true,
              isSecret: false,
              options: [
                { label: "Web应用", description: "前端应用" },
                { label: "服务端", description: "后端服务" },
              ],
            },
          ],
        },
      },
    ]);
  });

  it("emits fallback warnings when workspace path is unavailable", async () => {
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

  it("preserves transcript-heavy claude history when assistant text is sparse", async () => {
    const loader = createClaudeHistoryLoader({
      workspaceId: "ws-claude-transcript",
      workspacePath: "/tmp/ws-claude-transcript",
      loadClaudeSession: vi.fn().mockResolvedValue({
        messages: [
          {
            kind: "reasoning",
            id: "reason-1",
            text: "先理解模块结构",
          },
          {
            kind: "tool",
            id: "tool-1",
            tool_name: "Bash",
            tool_input: {
              command: "ls -la",
            },
          },
          {
            kind: "tool",
            id: "tool-1-result",
            toolType: "result",
            text: "",
            tool_output: {
              output: "README.md\nsrc\n",
            },
          },
          {
            kind: "tool",
            id: "tool-2",
            tool_name: "Bash",
            tool_input: {
              command: "find src -maxdepth 2",
            },
          },
          {
            kind: "tool",
            id: "tool-2-result",
            toolType: "result",
            text: "",
            tool_output: {
              output: "src/index.ts\nsrc/app.tsx\n",
            },
          },
        ],
      }),
    });

    const snapshot = await loader.load("claude:session-transcript-heavy");
    expect(snapshot.items.some((item) => item.kind === "reasoning")).toBe(true);
    expect(snapshot.items.filter((item) => item.kind === "tool")).toHaveLength(
      2,
    );
  });
});
