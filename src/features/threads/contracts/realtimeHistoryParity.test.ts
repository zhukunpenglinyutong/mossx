import { describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { claudeRealtimeAdapter } from "../adapters/claudeRealtimeAdapter";
import { codexRealtimeAdapter } from "../adapters/codexRealtimeAdapter";
import { opencodeRealtimeAdapter } from "../adapters/opencodeRealtimeAdapter";
import { createClaudeHistoryLoader } from "../loaders/claudeHistoryLoader";
import { createCodexHistoryLoader } from "../loaders/codexHistoryLoader";
import { createOpenCodeHistoryLoader } from "../loaders/opencodeHistoryLoader";
import { appendEvent, findConversationStateDiffs, hydrateHistory } from "./conversationAssembler";
import {
  createConversationState,
  type ConversationEngine,
  type ConversationState,
} from "./conversationCurtainContracts";

type AdapterMethod = {
  method: string;
  params: Record<string, unknown>;
};

function createRealtimeState(
  engine: ConversationEngine,
  workspaceId: string,
  threadId: string,
  methods: AdapterMethod[],
): ConversationState {
  const adapter =
    engine === "claude"
      ? claudeRealtimeAdapter
      : engine === "opencode"
        ? opencodeRealtimeAdapter
        : codexRealtimeAdapter;
  let state = createConversationState({
    workspaceId,
    threadId,
    engine,
    activeTurnId: null,
    isThinking: false,
    heartbeatPulse: null,
    historyRestoredAtMs: null,
  });

  methods.forEach((entry) => {
    const mapped = adapter.mapEvent({
      workspaceId,
      message: {
        method: entry.method,
        params: entry.params,
      },
    });
    if (mapped) {
      state = appendEvent(state, mapped);
    }
  });
  return {
    ...state,
    meta: {
      ...state.meta,
      activeTurnId:
        state.meta.activeTurnId && state.meta.activeTurnId.trim()
          ? state.meta.activeTurnId
          : null,
    },
  };
}

function pickById<T extends ConversationItem>(
  items: ConversationItem[],
  id: string,
  kind: T["kind"],
): T | null {
  const matched = items.find((item) => item.id === id && item.kind === kind);
  return matched ? (matched as T) : null;
}

function projectSemanticItem(item: ConversationItem) {
  if (item.kind === "message") {
    return {
      id: item.id,
      kind: item.kind,
      role: item.role,
      text: item.text,
    };
  }
  if (item.kind === "reasoning") {
    return {
      id: item.id,
      kind: item.kind,
      summary: item.summary,
      content: item.content,
    };
  }
  if (item.kind === "tool") {
    return {
      id: item.id,
      kind: item.kind,
      toolType: item.toolType,
      title: item.title,
      detail: item.detail,
      status: item.status ?? "",
      output: item.output ?? "",
    };
  }
  return item;
}

describe("realtime/history parity", () => {
  it("keeps codex realtime and history semantics aligned for tool/plan/userInput/reasoning", async () => {
    const workspaceId = "ws-codex";
    const threadId = "thread-codex-parity";
    const loader = createCodexHistoryLoader({
      workspaceId,
      resumeThread: vi.fn().mockResolvedValue({
        result: {
          thread: {
            user_input_queue: [
              {
                request_id: "req-1",
                params: {
                  turn_id: "turn-1",
                  item_id: "ask-1",
                  questions: [{ id: "confirm", header: "Confirm", question: "Proceed?" }],
                },
              },
            ],
            turns: [
              {
                id: "turn-1",
                explanation: "Plan summary",
                plan: [{ step: "Inspect", status: "in_progress" }],
                items: [
                  {
                    id: "msg-1",
                    type: "userMessage",
                    content: [{ type: "text", text: "Run checks" }],
                  },
                  {
                    id: "reason-1",
                    type: "reasoning",
                    summary: "Inspect workspace",
                    content: "Inspect workspace\nChecking ts errors",
                  },
                  {
                    id: "tool-1",
                    type: "commandExecution",
                    command: ["pnpm", "vitest"],
                    cwd: "/repo",
                    status: "completed",
                    aggregatedOutput: "running...\nok",
                  },
                ],
              },
            ],
          },
        },
      }),
    });
    const historySnapshot = await loader.load(threadId);
    const historyState = hydrateHistory(historySnapshot);

    const realtimeState = createRealtimeState("codex", workspaceId, threadId, [
      {
        method: "item/started",
        params: {
          threadId,
          item: {
            id: "msg-1",
            type: "userMessage",
            content: [{ type: "text", text: "Run checks" }],
          },
        },
      },
      {
        method: "item/reasoning/summaryTextDelta",
        params: { threadId, itemId: "reason-1", delta: "Inspect workspace" },
      },
      {
        method: "item/reasoning/textDelta",
        params: {
          threadId,
          itemId: "reason-1",
          delta: "Inspect workspace\nChecking ts errors",
        },
      },
      {
        method: "item/started",
        params: {
          threadId,
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: ["pnpm", "vitest"],
            cwd: "/repo",
            status: "started",
          },
        },
      },
      {
        method: "item/commandExecution/outputDelta",
        params: { threadId, itemId: "tool-1", delta: "running...\n" },
      },
      {
        method: "item/completed",
        params: {
          threadId,
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: ["pnpm", "vitest"],
            cwd: "/repo",
            status: "completed",
            aggregatedOutput: "running...\nok",
          },
        },
      },
    ]);

    const alignedRealtime: ConversationState = {
      ...realtimeState,
      plan: historySnapshot.plan,
      userInputQueue: historySnapshot.userInputQueue,
    };
    expect(findConversationStateDiffs(alignedRealtime, historyState)).toEqual([]);

    const realtimeTool = pickById<Extract<ConversationItem, { kind: "tool" }>>(
      alignedRealtime.items,
      "tool-1",
      "tool",
    );
    const historyTool = pickById<Extract<ConversationItem, { kind: "tool" }>>(
      historyState.items,
      "tool-1",
      "tool",
    );
    const realtimeReasoning = pickById<Extract<ConversationItem, { kind: "reasoning" }>>(
      alignedRealtime.items,
      "reason-1",
      "reasoning",
    );
    const historyReasoning = pickById<Extract<ConversationItem, { kind: "reasoning" }>>(
      historyState.items,
      "reason-1",
      "reasoning",
    );

    expect(realtimeTool).toEqual(historyTool);
    expect(realtimeReasoning).toEqual(historyReasoning);
    expect(historyState.plan?.steps).toEqual([
      { step: "Inspect", status: "inProgress" },
    ]);
    expect(historyState.userInputQueue).toHaveLength(1);
  });

  it("keeps claude realtime and history semantics aligned for tool and reasoning", async () => {
    const workspaceId = "ws-claude";
    const threadId = "claude:session-parity";
    const loader = createClaudeHistoryLoader({
      workspaceId,
      workspacePath: "/tmp/ws-claude",
      loadClaudeSession: vi.fn().mockResolvedValue({
        messages: [
          { kind: "message", id: "msg-1", role: "user", text: "Run checks" },
          {
            kind: "reasoning",
            id: "reason-1",
            text: "Inspect workspace\nChecking ts errors",
          },
          {
            kind: "tool",
            id: "tool-1",
            toolType: "commandExecution",
            title: "Command: npm run test",
            text: "",
          },
          {
            kind: "tool",
            id: "tool-1-result",
            toolType: "result",
            title: "Result",
            text: "ok",
          },
        ],
      }),
    });
    const historySnapshot = await loader.load(threadId);
    const historyState = hydrateHistory(historySnapshot);
    const reasoningText = "Inspect workspace\nChecking ts errors";

    const realtimeState = createRealtimeState("claude", workspaceId, threadId, [
      {
        method: "item/started",
        params: {
          threadId,
          item: {
            id: "msg-1",
            type: "userMessage",
            content: [{ type: "text", text: "Run checks" }],
          },
        },
      },
      {
        method: "item/reasoning/summaryTextDelta",
        params: { threadId, itemId: "reason-1", delta: reasoningText },
      },
      {
        method: "item/reasoning/textDelta",
        params: { threadId, itemId: "reason-1", delta: reasoningText },
      },
      {
        method: "item/started",
        params: {
          threadId,
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: ["npm", "run", "test"],
            cwd: "",
            status: "started",
          },
        },
      },
      {
        method: "item/commandExecution/outputDelta",
        params: { threadId, itemId: "tool-1", delta: "ok" },
      },
      {
        method: "item/completed",
        params: {
          threadId,
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: ["npm", "run", "test"],
            cwd: "",
            status: "completed",
            aggregatedOutput: "ok",
          },
        },
      },
    ]);

    expect(
      realtimeState.items.map(projectSemanticItem),
    ).toEqual(historyState.items.map(projectSemanticItem));
  });

  it("keeps opencode realtime and history semantics aligned for tool/plan/userInput/reasoning", async () => {
    const workspaceId = "ws-opencode";
    const threadId = "opencode:session-parity";
    const loader = createOpenCodeHistoryLoader({
      workspaceId,
      resumeThread: vi.fn().mockResolvedValue({
        result: {
          thread: {
            user_input_queue: [
              {
                request_id: "req-op-1",
                params: {
                  turn_id: "turn-op-1",
                  item_id: "ask-op-1",
                  questions: [{ id: "confirm", header: "Confirm", question: "Proceed?" }],
                },
              },
            ],
            turns: [
              {
                id: "turn-op-1",
                explanation: "Plan summary",
                plan: [{ step: "Inspect", status: "in_progress" }],
                items: [
                  {
                    id: "msg-1",
                    type: "userMessage",
                    content: [{ type: "text", text: "Run checks" }],
                  },
                  {
                    id: "reason-1",
                    type: "reasoning",
                    summary: "Inspect workspace",
                    content: "Inspect workspace\nChecking ts errors",
                  },
                  {
                    id: "tool-1",
                    type: "commandExecution",
                    command: ["pnpm", "vitest"],
                    cwd: "/repo",
                    status: "completed",
                    aggregatedOutput: "running...\nok",
                  },
                ],
              },
            ],
          },
        },
      }),
    });
    const historySnapshot = await loader.load(threadId);
    const historyState = hydrateHistory(historySnapshot);

    const realtimeState = createRealtimeState("opencode", workspaceId, threadId, [
      {
        method: "item/started",
        params: {
          threadId,
          item: {
            id: "msg-1",
            type: "userMessage",
            content: [{ type: "text", text: "Run checks" }],
          },
        },
      },
      {
        method: "item/reasoning/summaryTextDelta",
        params: { threadId, itemId: "reason-1", delta: "Inspect workspace" },
      },
      {
        method: "item/reasoning/textDelta",
        params: {
          threadId,
          itemId: "reason-1",
          delta: "Inspect workspace\nChecking ts errors",
        },
      },
      {
        method: "item/started",
        params: {
          threadId,
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: ["pnpm", "vitest"],
            cwd: "/repo",
            status: "started",
          },
        },
      },
      {
        method: "item/commandExecution/outputDelta",
        params: { threadId, itemId: "tool-1", delta: "running...\n" },
      },
      {
        method: "item/completed",
        params: {
          threadId,
          item: {
            id: "tool-1",
            type: "commandExecution",
            command: ["pnpm", "vitest"],
            cwd: "/repo",
            status: "completed",
            aggregatedOutput: "running...\nok",
          },
        },
      },
    ]);
    const alignedRealtime: ConversationState = {
      ...realtimeState,
      plan: historySnapshot.plan,
      userInputQueue: historySnapshot.userInputQueue,
    };

    expect(findConversationStateDiffs(alignedRealtime, historyState)).toEqual([]);
  });

  it("reports non-whitelisted realtime/history differences", () => {
    const base = createConversationState({
      workspaceId: "ws-1",
      threadId: "thread-1",
      engine: "codex",
      activeTurnId: null,
      isThinking: false,
      heartbeatPulse: null,
      historyRestoredAtMs: null,
    });
    const realtime: ConversationState = {
      ...base,
      items: [
        {
          id: "tool-1",
          kind: "tool",
          toolType: "commandExecution",
          title: "Command",
          detail: "pnpm test",
          status: "completed",
          output: "ok",
        },
      ],
      meta: {
        ...base.meta,
        heartbeatPulse: 1,
      },
    };
    const history: ConversationState = {
      ...base,
      items: [
        {
          id: "tool-1",
          kind: "tool",
          toolType: "commandExecution",
          title: "Command",
          detail: "pnpm test",
          status: "started",
          output: "",
        },
      ],
      meta: {
        ...base.meta,
        heartbeatPulse: 3,
      },
    };

    expect(findConversationStateDiffs(realtime, history)).toEqual(["items"]);
  });
});
