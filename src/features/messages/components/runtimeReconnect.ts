import type { ConversationItem, QueuedMessage } from "../../../types";
import {
  resolveThreadStabilityDiagnostic,
  type RuntimeRecoveryHintReason,
} from "../../threads/utils/stabilityDiagnostics";

export type RuntimeReconnectHint = {
  reason: RuntimeRecoveryHintReason;
  rawMessage: string;
};

export type RuntimeReconnectRecoveryResult =
  | { kind: "rebound"; threadId?: string | null }
  | { kind: "fresh"; threadId: string }
  | { kind: "failed"; reason?: string | null };

export type RuntimeReconnectRecoveryCallbackResult =
  | RuntimeReconnectRecoveryResult
  | string
  | null
  | void;

export function resolveRuntimeReconnectHint(text: string): RuntimeReconnectHint | null {
  const diagnostic = resolveThreadStabilityDiagnostic(text);
  if (!diagnostic?.reconnectReason) {
    return null;
  }
  return {
    reason: diagnostic.reconnectReason,
    rawMessage: diagnostic.rawMessage,
  };
}

export function normalizeRuntimeReconnectErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function normalizeRuntimeReconnectThreadId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRuntimeReconnectFailureReason(reason: unknown): string | null {
  if (reason === null || reason === undefined) {
    return null;
  }
  return normalizeRuntimeReconnectErrorMessage(reason);
}

export function normalizeRuntimeReconnectRecoveryResult(
  result: unknown,
): RuntimeReconnectRecoveryResult {
  if (typeof result === "string") {
    const threadId = normalizeRuntimeReconnectThreadId(result);
    return threadId ? { kind: "rebound", threadId } : { kind: "failed" };
  }
  if (result === null) {
    return { kind: "failed" };
  }
  if (result === undefined) {
    return { kind: "rebound", threadId: null };
  }
  if (typeof result !== "object") {
    return { kind: "failed", reason: normalizeRuntimeReconnectErrorMessage(result) };
  }

  const recoveryResult = result as {
    kind?: unknown;
    reason?: unknown;
    threadId?: unknown;
  };
  if (recoveryResult.kind === "failed") {
    return {
      kind: "failed",
      reason: normalizeRuntimeReconnectFailureReason(recoveryResult.reason),
    };
  }
  if (recoveryResult.kind === "fresh" || recoveryResult.kind === "rebound") {
    const threadId = normalizeRuntimeReconnectThreadId(recoveryResult.threadId);
    if (!threadId) {
      return { kind: "failed", reason: "invalid recovery thread id" };
    }
    return {
      kind: recoveryResult.kind,
      threadId,
    };
  }
  return { kind: "failed", reason: "invalid recovery result" };
}

export function resolveAssistantRuntimeReconnectHint(
  item: Extract<ConversationItem, { kind: "message" }>,
  hasAgentTaskNotification: boolean,
) {
  if (hasAgentTaskNotification || item.role !== "assistant") {
    return null;
  }
  return resolveRuntimeReconnectHint(item.text);
}

export function resolveRetryMessageForReconnectItem(
  items: ConversationItem[],
  reconnectItemId: string | null,
): Pick<QueuedMessage, "text" | "images"> | null {
  if (!reconnectItemId) {
    return null;
  }
  const reconnectIndex = items.findIndex((item) => item.id === reconnectItemId);
  if (reconnectIndex <= 0) {
    return null;
  }
  for (let index = reconnectIndex - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind !== "message" || item.role !== "user") {
      continue;
    }
    return {
      text: item.text,
      images: item.images,
    };
  }
  return null;
}
