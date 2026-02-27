import type {
  ConversationState,
  NormalizedHistorySnapshot,
  NormalizedThreadEvent,
} from "./conversationCurtainContracts";
import type { ConversationItem } from "../../../types";
import { normalizeItem } from "../../../utils/threadItems";

export const CONVERSATION_STATE_DIFF_WHITELIST = [
  "meta.heartbeatPulse",
  "meta.historyRestoredAtMs",
] as const;

function upsertItem(items: ConversationItem[], next: ConversationItem): ConversationItem[] {
  const normalizedNext = normalizeItem(next);
  const index = items.findIndex((item) => item.id === next.id);
  if (index < 0) {
    return [...items, normalizedNext];
  }
  const copy = [...items];
  copy[index] = normalizedNext;
  return copy;
}

function compactComparableAssistantText(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[！!]/g, "!")
    .replace(/[？?]/g, "?")
    .replace(/[，,]/g, ",")
    .replace(/[。．.]/g, ".");
}

function mergeAssistantDeltaText(existing: string, delta: string): string {
  if (!delta) {
    return existing;
  }
  if (!existing) {
    return delta;
  }
  if (delta === existing) {
    return existing;
  }
  if (delta.startsWith(existing) && delta.length >= existing.length) {
    return delta;
  }
  if (existing.startsWith(delta) && existing.length >= delta.length) {
    return existing;
  }
  const comparableExisting = compactComparableAssistantText(existing);
  const comparableDelta = compactComparableAssistantText(delta);
  if (!comparableExisting || !comparableDelta) {
    return `${existing}${delta}`;
  }
  if (comparableDelta === comparableExisting) {
    return existing.length >= delta.length ? existing : delta;
  }
  if (comparableDelta.startsWith(comparableExisting)) {
    return delta;
  }
  if (comparableExisting.startsWith(comparableDelta)) {
    return existing;
  }
  return `${existing}${delta}`;
}

function mergeAssistantCompletedText(existing: string, completed: string): string {
  if (!completed) {
    return existing;
  }
  if (!existing) {
    return completed;
  }
  if (completed === existing) {
    return existing;
  }
  const comparableExisting = compactComparableAssistantText(existing);
  const comparableCompleted = compactComparableAssistantText(completed);
  if (!comparableExisting || !comparableCompleted) {
    return completed;
  }
  if (comparableCompleted === comparableExisting) {
    return completed.length >= existing.length ? completed : existing;
  }
  if (comparableCompleted.startsWith(comparableExisting)) {
    return completed;
  }
  if (comparableExisting.startsWith(comparableCompleted)) {
    return existing;
  }
  return completed;
}

function appendMessageDelta(
  items: ConversationItem[],
  event: NormalizedThreadEvent,
): ConversationItem[] {
  const delta = event.delta ?? (event.item.kind === "message" ? event.item.text : "");
  if (!delta) {
    return items;
  }
  const existing = items.find((item) => item.id === event.item.id);
  if (!existing || existing.kind !== "message") {
    return upsertItem(items, {
      id: event.item.id,
      kind: "message",
      role: "assistant",
      text: delta,
    });
  }
  return upsertItem(items, {
    ...existing,
    text: mergeAssistantDeltaText(existing.text, delta),
  });
}

function appendReasoningSummaryDelta(
  items: ConversationItem[],
  event: NormalizedThreadEvent,
): ConversationItem[] {
  const delta = event.delta ?? "";
  if (!delta) {
    return items;
  }
  const existing = items.find((item) => item.id === event.item.id);
  if (!existing || existing.kind !== "reasoning") {
    return upsertItem(items, {
      id: event.item.id,
      kind: "reasoning",
      summary: delta,
      content: "",
    });
  }
  return upsertItem(items, {
    ...existing,
    summary: `${existing.summary}${delta}`,
  });
}

function appendReasoningContentDelta(
  items: ConversationItem[],
  event: NormalizedThreadEvent,
): ConversationItem[] {
  const delta = event.delta ?? "";
  if (!delta) {
    return items;
  }
  const existing = items.find((item) => item.id === event.item.id);
  if (!existing || existing.kind !== "reasoning") {
    return upsertItem(items, {
      id: event.item.id,
      kind: "reasoning",
      summary: "",
      content: delta,
    });
  }
  return upsertItem(items, {
    ...existing,
    content: `${existing.content}${delta}`,
  });
}

function appendToolOutputDelta(
  items: ConversationItem[],
  event: NormalizedThreadEvent,
): ConversationItem[] {
  if (event.item.kind !== "tool") {
    return items;
  }
  const delta = event.delta ?? "";
  if (!delta) {
    return items;
  }
  const existing = items.find((item) => item.id === event.item.id);
  if (!existing || existing.kind !== "tool") {
    return upsertItem(items, {
      ...event.item,
      output: delta,
      status: event.item.status ?? "started",
    });
  }
  return upsertItem(items, {
    ...existing,
    output: `${existing.output ?? ""}${delta}`,
  });
}

function completeAssistantMessage(
  items: ConversationItem[],
  event: NormalizedThreadEvent,
): ConversationItem[] {
  if (event.item.kind !== "message") {
    return items;
  }
  const existing = items.find((item) => item.id === event.item.id);
  if (!existing || existing.kind !== "message") {
    return upsertItem(items, event.item);
  }
  const nextText = mergeAssistantCompletedText(existing.text, event.item.text);
  return upsertItem(items, {
    ...existing,
    text: nextText,
  });
}

export function appendEvent(
  state: ConversationState,
  event: NormalizedThreadEvent,
): ConversationState {
  let items = state.items;
  switch (event.operation) {
    case "itemStarted":
    case "itemUpdated":
    case "itemCompleted":
      items = upsertItem(items, event.item);
      break;
    case "appendAgentMessageDelta":
      items = appendMessageDelta(items, event);
      break;
    case "completeAgentMessage":
      items = completeAssistantMessage(items, event);
      break;
    case "appendReasoningSummaryDelta":
      items = appendReasoningSummaryDelta(items, event);
      break;
    case "appendReasoningSummaryBoundary":
      break;
    case "appendReasoningContentDelta":
      items = appendReasoningContentDelta(items, event);
      break;
    case "appendToolOutputDelta":
      items = appendToolOutputDelta(items, event);
      break;
    default:
      break;
  }
  return {
    ...state,
    items,
    meta: {
      ...state.meta,
      activeTurnId: event.turnId ?? state.meta.activeTurnId,
    },
  };
}

export function hydrateHistory(snapshot: NormalizedHistorySnapshot): ConversationState {
  const indexByItemId = new Map<string, number>();
  const deduped: ConversationItem[] = [];
  for (const item of snapshot.items) {
    const normalized = normalizeItem(item);
    const index = indexByItemId.get(item.id);
    if (typeof index === "number") {
      deduped[index] = normalized;
      continue;
    }
    indexByItemId.set(item.id, deduped.length);
    deduped.push(normalized);
  }
  return {
    items: deduped,
    plan: snapshot.plan,
    userInputQueue: [...snapshot.userInputQueue],
    meta: snapshot.meta,
  };
}

function flattenComparablePaths(
  prefix: string,
  value: unknown,
  output: Map<string, string>,
): void {
  if (Array.isArray(value)) {
    output.set(prefix, JSON.stringify(value));
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      output.set(prefix, "{}");
      return;
    }
    for (const [key, nested] of entries) {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenComparablePaths(path, nested, output);
    }
    return;
  }
  output.set(prefix, JSON.stringify(value));
}

export function findConversationStateDiffs(
  realtime: ConversationState,
  history: ConversationState,
): string[] {
  const realtimePaths = new Map<string, string>();
  const historyPaths = new Map<string, string>();
  flattenComparablePaths("", realtime, realtimePaths);
  flattenComparablePaths("", history, historyPaths);
  const allPaths = new Set([...realtimePaths.keys(), ...historyPaths.keys()]);
  const whitelist = new Set<string>(CONVERSATION_STATE_DIFF_WHITELIST);
  const diffs = new Set<string>();
  for (const path of allPaths) {
    const left = realtimePaths.get(path);
    const right = historyPaths.get(path);
    if (left === right) {
      continue;
    }
    if (whitelist.has(path)) {
      continue;
    }
    const semanticPath = path.includes(".") ? path.slice(0, path.indexOf(".")) : path;
    if (semanticPath && semanticPath !== "meta") {
      diffs.add(semanticPath);
    } else if (path && !whitelist.has(path)) {
      diffs.add(path);
    }
  }
  return Array.from(diffs).sort();
}
