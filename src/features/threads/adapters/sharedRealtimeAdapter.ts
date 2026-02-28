import { buildConversationItem } from "../../../utils/threadItems";
import type { ConversationItem } from "../../../types";
import type {
  ConversationEngine,
  NormalizedThreadEvent,
  RealtimeAdapter,
} from "../contracts/conversationCurtainContracts";

type RawRealtimeAdapterInput = {
  workspaceId: string;
  message: Record<string, unknown>;
};

type CommonMapOptions = {
  allowTextDeltaAlias?: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function resolveThreadId(params: Record<string, unknown>): string {
  const turn = asRecord(params.turn);
  return asString(
    params.threadId ??
      params.thread_id ??
      turn.threadId ??
      turn.thread_id ??
      "",
  );
}

function resolveTimestamp(params: Record<string, unknown>): number {
  const raw = params.timestampMs ?? params.timestamp_ms ?? params.timestamp ?? params.ts;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function createEvent({
  engine,
  workspaceId,
  threadId,
  eventId,
  item,
  operation,
  sourceMethod,
  delta = null,
  rawItem = null,
  rawUsage = null,
  turnId = null,
  timestampMs,
}: {
  engine: ConversationEngine;
  workspaceId: string;
  threadId: string;
  eventId: string;
  item: ConversationItem;
  operation: NormalizedThreadEvent["operation"];
  sourceMethod: string;
  delta?: string | null;
  rawItem?: Record<string, unknown> | null;
  rawUsage?: Record<string, unknown> | null;
  turnId?: string | null;
  timestampMs: number;
}): NormalizedThreadEvent {
  return {
    engine,
    workspaceId,
    threadId,
    eventId,
    itemKind: item.kind,
    timestampMs,
    item,
    operation,
    sourceMethod,
    delta,
    rawItem,
    rawUsage,
    turnId,
  };
}

export function inferEngineFromThreadId(
  threadId: string,
): ConversationEngine {
  if (threadId.startsWith("claude:") || threadId.startsWith("claude-pending-")) {
    return "claude";
  }
  if (threadId.startsWith("opencode:") || threadId.startsWith("opencode-pending-")) {
    return "opencode";
  }
  return "codex";
}

export function mapCommonRealtimeEvent(
  engine: ConversationEngine,
  input: unknown,
  options: CommonMapOptions = {},
): NormalizedThreadEvent | null {
  const payload = asRecord(input);
  const workspaceId = asString(payload.workspaceId ?? "");
  const message = asRecord(payload.message);
  const method = asString(message.method ?? "");
  if (!workspaceId || !method) {
    return null;
  }
  const params = asRecord(message.params);
  const threadId = resolveThreadId(params);
  const turn = asRecord(params.turn);
  const turnId = asString(params.turnId ?? params.turn_id ?? turn.id ?? "");
  const timestampMs = resolveTimestamp(params);
  if (!threadId) {
    return null;
  }

  if (method === "processing/heartbeat") {
    // OpenCode heartbeat is presentation-only and MUST NOT become a conversation item.
    return null;
  }

  if (method === "item/agentMessage/delta") {
    const itemId = asString(params.itemId ?? params.item_id ?? "");
    const delta = asString(params.delta ?? "");
    if (!itemId || !delta) {
      return null;
    }
    return createEvent({
      engine,
      workspaceId,
      threadId,
      eventId: `${itemId}:delta`,
      item: {
        id: itemId,
        kind: "message",
        role: "assistant",
        text: delta,
      },
      operation: "appendAgentMessageDelta",
      sourceMethod: method,
      delta,
      turnId,
      timestampMs,
    });
  }

  if (options.allowTextDeltaAlias && (method === "text:delta" || method === "text/delta")) {
    const delta = asString(params.delta ?? params.text ?? "");
    if (!delta) {
      return null;
    }
    const itemId = asString(params.itemId ?? params.item_id ?? params.turnId ?? params.turn_id ?? "");
    const resolvedItemId = itemId || `${threadId}:text-delta`;
    return createEvent({
      engine,
      workspaceId,
      threadId,
      eventId: `${resolvedItemId}:delta`,
      item: {
        id: resolvedItemId,
        kind: "message",
        role: "assistant",
        text: delta,
      },
      operation: "appendAgentMessageDelta",
      sourceMethod: method,
      delta,
      turnId,
      timestampMs,
    });
  }

  if (
    method === "item/reasoning/summaryTextDelta" ||
    method === "item/reasoning/summaryPartAdded" ||
    method === "item/reasoning/textDelta" ||
    method === "item/reasoning/delta"
  ) {
    const itemId = asString(params.itemId ?? params.item_id ?? "");
    if (!itemId) {
      return null;
    }
    if (method === "item/reasoning/summaryPartAdded") {
      return createEvent({
        engine,
        workspaceId,
        threadId,
        eventId: `${itemId}:summary-boundary`,
        item: {
          id: itemId,
          kind: "reasoning",
          summary: "",
          content: "",
        },
        operation: "appendReasoningSummaryBoundary",
        sourceMethod: method,
        turnId,
        timestampMs,
      });
    }
    const delta = asString(params.delta ?? "");
    if (!delta) {
      return null;
    }
    const isSummary = method === "item/reasoning/summaryTextDelta";
    return createEvent({
      engine,
      workspaceId,
      threadId,
      eventId: `${itemId}:${isSummary ? "summary" : "content"}:delta`,
      item: {
        id: itemId,
        kind: "reasoning",
        summary: isSummary ? delta : "",
        content: isSummary ? "" : delta,
      },
      operation: isSummary
        ? "appendReasoningSummaryDelta"
        : "appendReasoningContentDelta",
      sourceMethod: method,
      delta,
      turnId,
      timestampMs,
    });
  }

  if (
    method === "item/commandExecution/outputDelta" ||
    method === "item/fileChange/outputDelta"
  ) {
    const itemId = asString(params.itemId ?? params.item_id ?? "");
    const delta = asString(params.delta ?? "");
    if (!itemId || !delta) {
      return null;
    }
    const toolType = method.includes("fileChange") ? "fileChange" : "commandExecution";
    return createEvent({
      engine,
      workspaceId,
      threadId,
      eventId: `${itemId}:output:delta`,
      item: {
        id: itemId,
        kind: "tool",
        toolType,
        title: toolType === "fileChange" ? "File changes" : "Command",
        detail: "",
        output: delta,
      },
      operation: "appendToolOutputDelta",
      sourceMethod: method,
      delta,
      turnId,
      timestampMs,
    });
  }

  if (method === "item/started" || method === "item/updated" || method === "item/completed") {
    const rawItem = asRecord(params.item);
    const rawUsage = asRecord(params.usage);
    const itemType = asString(rawItem.type ?? "");
    const itemId = asString(rawItem.id ?? "");
    if (!itemType || !itemId) {
      return null;
    }
    if (method === "item/completed" && itemType === "agentMessage") {
      const text = asString(rawItem.text ?? "");
      return createEvent({
        engine,
        workspaceId,
        threadId,
        eventId: `${itemId}:completed`,
        item: {
          id: itemId,
          kind: "message",
          role: "assistant",
          text,
        },
        operation: "completeAgentMessage",
        sourceMethod: method,
        rawItem,
        rawUsage: Object.keys(rawUsage).length > 0 ? rawUsage : null,
        turnId,
        timestampMs,
      });
    }
    const converted = buildConversationItem(rawItem);
    if (!converted) {
      return null;
    }
    return createEvent({
      engine,
      workspaceId,
      threadId,
      eventId: `${converted.id}:${method.split("/")[1]}`,
      item: converted,
      operation:
        method === "item/started"
          ? "itemStarted"
          : method === "item/updated"
            ? "itemUpdated"
            : "itemCompleted",
      sourceMethod: method,
      rawItem,
      rawUsage: Object.keys(rawUsage).length > 0 ? rawUsage : null,
      turnId,
      timestampMs,
    });
  }

  return null;
}

export type EngineRealtimeAdapter = RealtimeAdapter;
export type { RawRealtimeAdapterInput };
