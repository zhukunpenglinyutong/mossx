import type { AppServerEvent } from "../../../types";
import type {
  ConversationEngine,
  NormalizedThreadEvent,
} from "./conversationCurtainContracts";

export type RealtimeContractSemantic =
  | "turnStarted"
  | "assistantTextDelta"
  | "assistantItemCompleted"
  | "turnCompleted"
  | "reasoningDelta"
  | "toolOutputDelta"
  | "processingHeartbeat"
  | "usageUpdate"
  | "turnError";

export type RealtimeContractRoute =
  | "normalizedThreadEvent"
  | "appServerHandler";

export type RealtimeContractMatrixEntry = {
  semantic: RealtimeContractSemantic;
  engineEventType: string;
  appServerMethod: string;
  route: RealtimeContractRoute;
  normalizedOperation?: NormalizedThreadEvent["operation"];
  legacyAliases: readonly string[];
};

export const REALTIME_CONTRACT_MATRIX: readonly RealtimeContractMatrixEntry[] = [
  {
    semantic: "turnStarted",
    engineEventType: "turn:started",
    appServerMethod: "turn/started",
    route: "appServerHandler",
    legacyAliases: [],
  },
  {
    semantic: "assistantTextDelta",
    engineEventType: "text:delta",
    appServerMethod: "item/agentMessage/delta",
    route: "normalizedThreadEvent",
    normalizedOperation: "appendAgentMessageDelta",
    legacyAliases: ["text:delta", "text/delta", "item/agentMessage/textDelta"],
  },
  {
    semantic: "assistantItemCompleted",
    engineEventType: "item:completed",
    appServerMethod: "item/completed",
    route: "normalizedThreadEvent",
    normalizedOperation: "completeAgentMessage",
    legacyAliases: [],
  },
  {
    semantic: "turnCompleted",
    engineEventType: "turn:completed",
    appServerMethod: "turn/completed",
    route: "appServerHandler",
    legacyAliases: [],
  },
  {
    semantic: "reasoningDelta",
    engineEventType: "reasoning:delta",
    appServerMethod: "item/reasoning/textDelta",
    route: "normalizedThreadEvent",
    normalizedOperation: "appendReasoningContentDelta",
    legacyAliases: [
      "item/reasoning/delta",
      "response.reasoning_text.delta",
      "response.reasoning_text.done",
    ],
  },
  {
    semantic: "toolOutputDelta",
    engineEventType: "tool:outputDelta",
    appServerMethod: "item/commandExecution/outputDelta",
    route: "normalizedThreadEvent",
    normalizedOperation: "appendToolOutputDelta",
    legacyAliases: ["item/fileChange/outputDelta"],
  },
  {
    semantic: "processingHeartbeat",
    engineEventType: "processing:heartbeat",
    appServerMethod: "processing/heartbeat",
    route: "appServerHandler",
    legacyAliases: [],
  },
  {
    semantic: "usageUpdate",
    engineEventType: "usage:update",
    appServerMethod: "thread/tokenUsage/updated",
    route: "appServerHandler",
    legacyAliases: ["token_count"],
  },
  {
    semantic: "turnError",
    engineEventType: "turn:error",
    appServerMethod: "turn/error",
    route: "appServerHandler",
    legacyAliases: [],
  },
] as const;

type CanonicalRealtimeFixture = {
  semantic: RealtimeContractSemantic;
  engine: ConversationEngine;
  event: AppServerEvent;
};

const WORKSPACE_ID = "ws-realtime-contract";
const CODEX_THREAD_ID = "codex:contract-thread";
const CODEX_TURN_ID = "turn-contract-1";

export const CANONICAL_REALTIME_FIXTURES: readonly CanonicalRealtimeFixture[] = [
  {
    semantic: "turnStarted",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "turn/started",
        params: {
          threadId: CODEX_THREAD_ID,
          turnId: CODEX_TURN_ID,
        },
      },
    },
  },
  {
    semantic: "assistantTextDelta",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "item/agentMessage/delta",
        params: {
          threadId: CODEX_THREAD_ID,
          itemId: "assistant-contract-1",
          turnId: CODEX_TURN_ID,
          delta: "canonical assistant delta",
        },
      },
    },
  },
  {
    semantic: "assistantItemCompleted",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "item/completed",
        params: {
          threadId: CODEX_THREAD_ID,
          turnId: CODEX_TURN_ID,
          item: {
            id: "assistant-contract-1",
            type: "agentMessage",
            text: "canonical assistant final",
          },
        },
      },
    },
  },
  {
    semantic: "turnCompleted",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "turn/completed",
        params: {
          threadId: CODEX_THREAD_ID,
          turnId: CODEX_TURN_ID,
          result: null,
        },
      },
    },
  },
  {
    semantic: "reasoningDelta",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "item/reasoning/textDelta",
        params: {
          threadId: CODEX_THREAD_ID,
          itemId: "reasoning-contract-1",
          turnId: CODEX_TURN_ID,
          delta: "canonical reasoning delta",
        },
      },
    },
  },
  {
    semantic: "toolOutputDelta",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "item/commandExecution/outputDelta",
        params: {
          threadId: CODEX_THREAD_ID,
          itemId: "tool-contract-1",
          turnId: CODEX_TURN_ID,
          delta: "canonical tool output\n",
        },
      },
    },
  },
  {
    semantic: "processingHeartbeat",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "processing/heartbeat",
        params: {
          threadId: CODEX_THREAD_ID,
          pulse: 7,
        },
      },
    },
  },
  {
    semantic: "usageUpdate",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "thread/tokenUsage/updated",
        params: {
          threadId: CODEX_THREAD_ID,
          tokenUsage: {
            total: {
              inputTokens: 13,
              outputTokens: 8,
              cachedInputTokens: 5,
              totalTokens: 21,
            },
            last: {
              inputTokens: 13,
              outputTokens: 8,
              cachedInputTokens: 5,
              totalTokens: 21,
            },
            modelContextWindow: 200000,
          },
        },
      },
    },
  },
  {
    semantic: "turnError",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "turn/error",
        params: {
          threadId: CODEX_THREAD_ID,
          turnId: CODEX_TURN_ID,
          error: "canonical turn error",
          willRetry: false,
        },
      },
    },
  },
] as const;

export const LEGACY_REALTIME_ALIAS_FIXTURES: readonly CanonicalRealtimeFixture[] = [
  {
    semantic: "assistantTextDelta",
    engine: "claude",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "text:delta",
        params: {
          threadId: "claude:contract-thread",
          turnId: CODEX_TURN_ID,
          text: "legacy text alias delta",
        },
      },
    },
  },
  {
    semantic: "reasoningDelta",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "response.reasoning_text.delta",
        params: {
          threadId: CODEX_THREAD_ID,
          item_id: "reasoning-contract-legacy",
          turn_id: CODEX_TURN_ID,
          text: "legacy reasoning alias delta",
        },
      },
    },
  },
  {
    semantic: "usageUpdate",
    engine: "codex",
    event: {
      workspace_id: WORKSPACE_ID,
      message: {
        method: "token_count",
        params: {
          threadId: CODEX_THREAD_ID,
          info: {
            total_token_usage: {
              input_tokens: 2,
              output_tokens: 3,
              cached_input_tokens: 1,
            },
          },
        },
      },
    },
  },
] as const;
