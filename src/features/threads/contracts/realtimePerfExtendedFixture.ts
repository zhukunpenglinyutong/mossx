import type { RealtimeReplayEvent } from "./realtimeReplayTypes";

const WORKSPACE_ID = "ws-realtime-perf-extended";

export function buildStreamJsonFirstTokenSlowPathEvents(): RealtimeReplayEvent[] {
  const threadId = "claude:stream-json-first-token";
  const assistantId = `${threadId}:assistant:slow-first-token`;
  const reasoningId = `${threadId}:reasoning:slow-first-token`;
  return [
    {
      id: "ft:reasoning-summary",
      kind: "reasoningSummaryDelta",
      workspaceId: WORKSPACE_ID,
      threadId,
      itemId: reasoningId,
      delta: "Waiting for stream-json first token",
      atMs: 0,
    },
    {
      id: "ft:agent-delta-1",
      kind: "agentDelta",
      workspaceId: WORKSPACE_ID,
      threadId,
      itemId: assistantId,
      delta: "First visible token ",
      atMs: 5_000,
    },
    {
      id: "ft:agent-delta-2",
      kind: "agentDelta",
      workspaceId: WORKSPACE_ID,
      threadId,
      itemId: assistantId,
      delta: "after slow path.",
      atMs: 5_080,
    },
    {
      id: "ft:agent-complete",
      kind: "agentCompleted",
      workspaceId: WORKSPACE_ID,
      threadId,
      itemId: assistantId,
      text: "First visible token after slow path.",
      atMs: 5_120,
    },
  ];
}

export function buildPromptEnhancerDedupPathEvents(): RealtimeReplayEvent[] {
  const threadId = "claude:prompt-enhancer-dedup";
  const assistantId = `${threadId}:assistant:dedup`;
  return [
    {
      id: "pe:agent-delta-1",
      kind: "agentDelta",
      workspaceId: WORKSPACE_ID,
      threadId,
      itemId: assistantId,
      delta: "Enhanced prompt accepted.",
      atMs: 0,
    },
    {
      id: "pe:agent-delta-duplicate",
      kind: "agentDelta",
      workspaceId: WORKSPACE_ID,
      threadId,
      itemId: assistantId,
      delta: "",
      atMs: 4,
    },
    {
      id: "pe:agent-complete",
      kind: "agentCompleted",
      workspaceId: WORKSPACE_ID,
      threadId,
      itemId: assistantId,
      text: "Enhanced prompt accepted.",
      atMs: 12,
    },
  ];
}

export function buildRealtimePerfExtendedEvents() {
  return [
    ...buildStreamJsonFirstTokenSlowPathEvents(),
    ...buildPromptEnhancerDedupPathEvents().map((event) => ({
      ...event,
      atMs: event.atMs + 6_000,
    })),
  ];
}
