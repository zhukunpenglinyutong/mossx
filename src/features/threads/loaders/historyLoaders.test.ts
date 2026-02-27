import { describe, expect, it, vi } from "vitest";
import { createClaudeHistoryLoader } from "./claudeHistoryLoader";
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
      { step: "Inspect files", status: "inProgress" },
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
