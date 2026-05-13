import type {
  ConversationState,
  NormalizedHistorySnapshot,
  NormalizedThreadEvent,
} from "../contracts/conversationCurtainContracts";
import type { ConversationItem } from "../../../types";
import { normalizeItem } from "../../../utils/threadItems";
import {
  areEquivalentAssistantMessageTexts,
  compactComparableConversationText,
  findEquivalentReasoningObservationIndex,
  isEquivalentUserObservation,
} from "./conversationNormalization";
import {
  classifyConversationObservation,
  formatCompactControlToolItem,
  type ConversationFactSource,
} from "../contracts/conversationFactContract";
import {
  mergeAgentMessageText,
  mergeCompletedAgentText,
  mergeReasoningSnapshotTextForThread,
  mergeReasoningTextForThread,
} from "../hooks/threadReducerTextMerge";

type MessageConversationItem = Extract<ConversationItem, { kind: "message" }>;
type AssistantMessageItem = MessageConversationItem & { role: "assistant" };
type UserMessageItem = MessageConversationItem & { role: "user" };
type ReasoningConversationItem = Extract<ConversationItem, { kind: "reasoning" }>;
type ToolConversationItem = Extract<ConversationItem, { kind: "tool" }>;
type GeneratedImageConversationItem = Extract<
  ConversationItem,
  { kind: "generatedImage" }
>;

export const CONVERSATION_STATE_DIFF_WHITELIST = [
  "meta.heartbeatPulse",
  "meta.historyRestoredAtMs",
] as const;

function buildConversationItemIdentityKey(item: ConversationItem): string {
  return `${item.kind}:${item.id}`;
}

function replaceItemAtIndex(
  items: ConversationItem[],
  index: number,
  next: ConversationItem,
): ConversationItem[] {
  if (index >= 0 && items[index] === next) {
    return items;
  }
  const normalizedNext = normalizeItem(next);
  if (index < 0) {
    return [...items, normalizedNext];
  }
  if (items[index] === normalizedNext) {
    return items;
  }
  const copy = [...items];
  copy[index] = normalizedNext;
  return copy;
}

function findIdentityIndex(items: ConversationItem[], next: ConversationItem): number {
  const nextIdentityKey = buildConversationItemIdentityKey(next);
  return items.findIndex(
    (item) => buildConversationItemIdentityKey(item) === nextIdentityKey,
  );
}

function sliceByComparableLength(text: string, targetLength: number): string {
  if (targetLength <= 0) {
    return text;
  }
  let comparableLength = 0;
  for (let index = 0; index < text.length; index += 1) {
    const currentChar = text[index] ?? "";
    if (!/\s/.test(currentChar)) {
      comparableLength += 1;
    }
    if (comparableLength >= targetLength) {
      return text.slice(index + 1);
    }
  }
  return "";
}

function isAssistantMessageItem(
  item: ConversationItem | undefined,
): item is AssistantMessageItem {
  return item?.kind === "message" && item.role === "assistant";
}

function isUserMessageItem(
  item: ConversationItem | undefined,
): item is UserMessageItem {
  return item?.kind === "message" && item.role === "user";
}

function isReasoningItem(
  item: ConversationItem | undefined,
): item is ReasoningConversationItem {
  return item?.kind === "reasoning";
}

function isToolItem(item: ConversationItem | undefined): item is ToolConversationItem {
  return item?.kind === "tool";
}

function shouldStopAssistantEquivalenceSearch(item: ConversationItem) {
  if (item.kind === "message") {
    return item.role === "user";
  }
  return (
    item.kind === "reasoning" ||
    item.kind === "tool" ||
    item.kind === "generatedImage" ||
    item.kind === "diff" ||
    item.kind === "review" ||
    item.kind === "explore"
  );
}

function findEquivalentAssistantMessageIndex(
  items: ConversationItem[],
  incomingText: string,
  mergeText: (existing: string, incoming: string) => string,
) {
  if (!incomingText.trim()) {
    return -1;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (!candidate) {
      continue;
    }
    if (shouldStopAssistantEquivalenceSearch(candidate)) {
      break;
    }
    if (!isAssistantMessageItem(candidate)) {
      continue;
    }
    if (areEquivalentAssistantMessageTexts(candidate.text, incomingText, mergeText)) {
      return index;
    }
  }
  return -1;
}

function findEquivalentTrailingUserMessageIndex(
  items: ConversationItem[],
  incoming: UserMessageItem,
) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (!candidate) {
      continue;
    }
    if (candidate.kind === "generatedImage") {
      continue;
    }
    if (!isUserMessageItem(candidate)) {
      break;
    }
    if (isEquivalentUserObservation(candidate, incoming)) {
      return index;
    }
  }
  return -1;
}

function mergeToolSnapshot(
  existing: ToolConversationItem,
  incoming: ToolConversationItem,
): ToolConversationItem {
  const incomingOutput = incoming.output ?? "";
  const incomingDetail = incoming.detail ?? "";
  const incomingTitle = incoming.title ?? "";
  const incomingChanges = incoming.changes ?? [];
  return {
    ...existing,
    ...incoming,
    title: incomingTitle || existing.title,
    detail: incomingDetail || existing.detail,
    output: incomingOutput || existing.output,
    changes: incomingChanges.length > 0 ? incomingChanges : existing.changes,
  };
}

function collapseRepeatedAssistantEcho(text: string) {
  const comparable = compactComparableConversationText(text);
  if (comparable.length < 16 || comparable.length % 2 !== 0) {
    return text;
  }
  const halfLength = comparable.length / 2;
  const prefix = comparable.slice(0, halfLength);
  if (!prefix || `${prefix}${prefix}` !== comparable) {
    return text;
  }
  const suffix = sliceByComparableLength(text, halfLength);
  return suffix ? text.slice(0, text.length - suffix.length).trimEnd() : text;
}

function dedupeAdjacentAssistantParagraphs(text: string) {
  const paragraphs = text
    .split(/\r?\n[^\S\r\n]*\r?\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paragraphs.length <= 1) {
    return text;
  }
  const deduped: string[] = [];
  for (const paragraph of paragraphs) {
    const comparableParagraph = compactComparableConversationText(paragraph);
    const previous = deduped[deduped.length - 1] ?? "";
    if (
      previous &&
      comparableParagraph.length >= 8 &&
      compactComparableConversationText(previous) === comparableParagraph
    ) {
      continue;
    }
    deduped.push(paragraph);
  }
  return deduped.length === paragraphs.length ? text : deduped.join("\n\n");
}

function normalizeAssistantSnapshotText(text: string) {
  const normalizedStreamingText = mergeAgentMessageText("", text);
  if (!normalizedStreamingText) {
    return "";
  }
  return dedupeAdjacentAssistantParagraphs(
    mergeCompletedAgentText(
      "",
      collapseRepeatedAssistantEcho(normalizedStreamingText),
    ),
  );
}

function normalizeAssistantSnapshotItem(
  item: AssistantMessageItem,
): AssistantMessageItem {
  const normalizedText = normalizeAssistantSnapshotText(item.text);
  if (!normalizedText || normalizedText === item.text) {
    return item;
  }
  return {
    ...item,
    text: normalizedText,
  };
}

function areConversationImageListsEqual(
  left: AssistantMessageItem["images"] | undefined,
  right: AssistantMessageItem["images"] | undefined,
) {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  for (let index = 0; index < normalizedLeft.length; index += 1) {
    const leftImage = normalizedLeft[index];
    const rightImage = normalizedRight[index];
    if (leftImage === rightImage) {
      continue;
    }
    if (
      leftImage === undefined ||
      rightImage === undefined ||
      JSON.stringify(leftImage) !== JSON.stringify(rightImage)
    ) {
      return false;
    }
  }
  return true;
}

function mergeAssistantSnapshot(
  existing: AssistantMessageItem,
  incoming: AssistantMessageItem,
) {
  const normalizedIncomingText = normalizeAssistantSnapshotText(incoming.text);
  if (!normalizedIncomingText) {
    return existing;
  }
  const nextImages = incoming.images ?? existing.images;
  if (!existing.text) {
    return {
      ...existing,
      ...incoming,
      text: normalizedIncomingText,
    } satisfies AssistantMessageItem;
  }
  if (
    !areEquivalentAssistantMessageTexts(
      existing.text,
      normalizedIncomingText,
      mergeCompletedAgentText,
    )
  ) {
    if (
      incoming.id === existing.id &&
      existing.text === normalizedIncomingText &&
      areConversationImageListsEqual(existing.images, nextImages)
    ) {
      return existing;
    }
    return {
      ...existing,
      ...incoming,
      text: normalizedIncomingText,
    } satisfies AssistantMessageItem;
  }
  const mergedText = mergeCompletedAgentText(existing.text, normalizedIncomingText);
  if (
    incoming.id === existing.id &&
    mergedText === existing.text &&
    areConversationImageListsEqual(existing.images, nextImages)
  ) {
    return existing;
  }
  return {
    ...existing,
    ...incoming,
    text: mergedText,
  } satisfies AssistantMessageItem;
}

function mergeReasoningSnapshot(
  existing: ReasoningConversationItem,
  incoming: ReasoningConversationItem,
  threadId: string,
) {
  return {
    ...existing,
    ...incoming,
    summary: mergeReasoningSnapshotTextForThread(
      threadId,
      existing.summary,
      incoming.summary,
    ),
    content: mergeReasoningSnapshotTextForThread(
      threadId,
      existing.content,
      incoming.content,
    ),
  } satisfies ReasoningConversationItem;
}

function areEquivalentReasoningSnapshotObservation(
  existing: ReasoningConversationItem,
  incoming: ReasoningConversationItem,
) {
  if (findEquivalentReasoningObservationIndex([existing], incoming) >= 0) {
    return true;
  }
  const existingText = (existing.content || existing.summary || "").trim();
  const incomingText = (incoming.content || incoming.summary || "").trim();
  if (!existingText || !incomingText) {
    return false;
  }
  const compactExisting = compactComparableConversationText(existingText);
  const compactIncoming = compactComparableConversationText(incomingText);
  if (!compactExisting || !compactIncoming) {
    return false;
  }
  if (compactExisting === compactIncoming) {
    return true;
  }
  const shorter =
    compactExisting.length <= compactIncoming.length ? compactExisting : compactIncoming;
  const longer =
    shorter === compactExisting ? compactIncoming : compactExisting;
  return (
    shorter.length >= 5 &&
    (longer.startsWith(shorter) || longer.endsWith(shorter))
  );
}

function retargetGeneratedImageAnchors(
  items: ConversationItem[],
  replacementByUserId: Map<string, string>,
) {
  if (replacementByUserId.size === 0) {
    return items;
  }
  let didRetarget = false;
  const nextItems = items.map((item) => {
    if (item.kind !== "generatedImage") {
      return item;
    }
    const replacementAnchorId = replacementByUserId.get(item.anchorUserMessageId ?? "");
    if (!replacementAnchorId || replacementAnchorId === item.anchorUserMessageId) {
      return item;
    }
    didRetarget = true;
    return {
      ...item,
      anchorUserMessageId: replacementAnchorId,
    } satisfies GeneratedImageConversationItem;
  });
  return didRetarget ? nextItems : items;
}

function upsertSnapshotItem(
  items: ConversationItem[],
  next: ConversationItem,
  event: Pick<NormalizedThreadEvent, "engine" | "threadId" | "turnId"> & {
    source: ConversationFactSource;
  },
): ConversationItem[] {
  const factRawType = next.kind === "tool" ? next.toolType : next.kind;
  const factRawText =
    next.kind === "message"
      ? next.text
      : next.kind === "tool"
        ? [next.title, next.detail, next.output].filter(Boolean).join(" ")
        : null;
  const fact = classifyConversationObservation({
    engine: event.engine,
    threadId: event.threadId,
    turnId: event.turnId ?? null,
    source: event.source,
    item: next,
    rawText: factRawText,
    rawType: factRawType,
  });
  if (fact.visibility === "hidden") {
    return items;
  }
  const classifiedNext =
    fact.visibility === "compact" && isToolItem(next)
      ? formatCompactControlToolItem(next)
      : next;

  const normalizedNextCandidate = normalizeItem(classifiedNext);
  const normalizedNext = isAssistantMessageItem(normalizedNextCandidate)
    ? normalizeAssistantSnapshotItem(normalizedNextCandidate)
    : normalizedNextCandidate;
  const identityIndex = findIdentityIndex(items, normalizedNext);
  const existingByIdentity = identityIndex >= 0 ? items[identityIndex] : undefined;

  if (isToolItem(existingByIdentity) && isToolItem(normalizedNext)) {
    return replaceItemAtIndex(
      items,
      identityIndex,
      mergeToolSnapshot(existingByIdentity, normalizedNext),
    );
  }
  if (isReasoningItem(existingByIdentity) && isReasoningItem(normalizedNext)) {
    return replaceItemAtIndex(
      items,
      identityIndex,
      mergeReasoningSnapshot(existingByIdentity, normalizedNext, event.threadId),
    );
  }
  if (isAssistantMessageItem(existingByIdentity) && isAssistantMessageItem(normalizedNext)) {
    return replaceItemAtIndex(
      items,
      identityIndex,
      mergeAssistantSnapshot(existingByIdentity, normalizedNext),
    );
  }
  if (identityIndex >= 0) {
    return replaceItemAtIndex(items, identityIndex, normalizedNext);
  }

  if (isUserMessageItem(normalizedNext)) {
    const userIndex = findEquivalentTrailingUserMessageIndex(items, normalizedNext);
    if (userIndex >= 0) {
      const existing = items[userIndex];
      if (isUserMessageItem(existing)) {
        const retargetedItems =
          existing.id === normalizedNext.id
            ? items
            : retargetGeneratedImageAnchors(
                items,
                new Map([[existing.id, normalizedNext.id]]),
              );
        return replaceItemAtIndex(retargetedItems, userIndex, {
          ...existing,
          ...normalizedNext,
        });
      }
    }
  }
  if (isReasoningItem(normalizedNext)) {
    let reasoningIndex = findEquivalentReasoningObservationIndex(items, normalizedNext);
    if (reasoningIndex < 0) {
      reasoningIndex = items.findIndex((item) => {
        return isReasoningItem(item) &&
          areEquivalentReasoningSnapshotObservation(item, normalizedNext);
      });
    }
    if (reasoningIndex >= 0) {
      const existing = items[reasoningIndex];
      if (isReasoningItem(existing)) {
        return replaceItemAtIndex(
          items,
          reasoningIndex,
          mergeReasoningSnapshot(existing, normalizedNext, event.threadId),
        );
      }
    }
  }
  if (isAssistantMessageItem(normalizedNext)) {
    const assistantIndex = findEquivalentAssistantMessageIndex(
      items,
      normalizedNext.text,
      mergeCompletedAgentText,
    );
    if (assistantIndex >= 0) {
      const existing = items[assistantIndex];
      if (isAssistantMessageItem(existing)) {
        return replaceItemAtIndex(
          items,
          assistantIndex,
          mergeAssistantSnapshot(existing, normalizedNext),
        );
      }
    }
  }

  return replaceItemAtIndex(items, -1, normalizedNext);
}

function appendMessageDelta(
  items: ConversationItem[],
  event: NormalizedThreadEvent,
): ConversationItem[] {
  const delta = event.delta ?? (event.item.kind === "message" ? event.item.text : "");
  if (!delta) {
    return items;
  }
  const existingIndex = items.findIndex(
    (item) => item.kind === "message" && item.id === event.item.id,
  );
  const existing = existingIndex >= 0 ? items[existingIndex] : undefined;
  if (!isAssistantMessageItem(existing)) {
    return replaceItemAtIndex(items, -1, {
      id: event.item.id,
      kind: "message",
      role: "assistant",
      text: delta,
    });
  }
  return replaceItemAtIndex(items, existingIndex, {
    ...existing,
    text: mergeAgentMessageText(existing.text, delta),
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
  const existingIndex = items.findIndex(
    (item) => item.kind === "reasoning" && item.id === event.item.id,
  );
  const fallbackIndex =
    existingIndex >= 0
      ? existingIndex
      : findEquivalentReasoningObservationIndex(items, {
          summary: delta,
          content: "",
        });
  const existing = fallbackIndex >= 0 ? items[fallbackIndex] : undefined;
  if (!isReasoningItem(existing)) {
    return replaceItemAtIndex(items, -1, {
      id: event.item.id,
      kind: "reasoning",
      summary: delta,
      content: "",
    });
  }
  return replaceItemAtIndex(items, fallbackIndex, {
    ...existing,
    summary: mergeReasoningTextForThread(event.threadId, existing.summary, delta),
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
  const existingIndex = items.findIndex(
    (item) => item.kind === "reasoning" && item.id === event.item.id,
  );
  const fallbackIndex =
    existingIndex >= 0
      ? existingIndex
      : findEquivalentReasoningObservationIndex(items, {
          summary: "",
          content: delta,
        });
  const existing = fallbackIndex >= 0 ? items[fallbackIndex] : undefined;
  if (!isReasoningItem(existing)) {
    return replaceItemAtIndex(items, -1, {
      id: event.item.id,
      kind: "reasoning",
      summary: "",
      content: delta,
    });
  }
  return replaceItemAtIndex(items, fallbackIndex, {
    ...existing,
    content: mergeReasoningTextForThread(event.threadId, existing.content, delta),
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
  const existingIndex = items.findIndex(
    (item) => item.kind === "tool" && item.id === event.item.id,
  );
  const existing = existingIndex >= 0 ? items[existingIndex] : undefined;
  if (!isToolItem(existing)) {
    return replaceItemAtIndex(items, -1, {
      ...event.item,
      output: delta,
      status: event.item.status ?? "started",
    });
  }
  return replaceItemAtIndex(items, existingIndex, {
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
  const identityIndex = items.findIndex(
    (item) => item.kind === "message" && item.id === event.item.id,
  );
  const fallbackIndex =
    identityIndex >= 0
      ? identityIndex
      : findEquivalentAssistantMessageIndex(
          items,
          event.item.text,
          mergeCompletedAgentText,
        );
  const existing = fallbackIndex >= 0 ? items[fallbackIndex] : undefined;
  if (!isAssistantMessageItem(existing)) {
    return replaceItemAtIndex(items, -1, event.item);
  }
  const mergedText = mergeCompletedAgentText(existing.text, event.item.text);
  const nextImages =
    event.item.kind === "message" ? event.item.images ?? existing.images : existing.images;
  if (
    event.item.id === existing.id &&
    mergedText === existing.text &&
    areConversationImageListsEqual(existing.images, nextImages)
  ) {
    return items;
  }
  return replaceItemAtIndex(items, fallbackIndex, {
    ...existing,
    ...event.item,
    text: mergedText,
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
      items = upsertSnapshotItem(items, event.item, {
        engine: event.engine,
        threadId: event.threadId,
        turnId: event.turnId ?? null,
        source: "realtime",
      });
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
  const items = snapshot.items.reduce<ConversationItem[]>(
    (current, item) =>
      upsertSnapshotItem(current, item, {
        engine: snapshot.engine,
        threadId: snapshot.threadId,
        turnId: null,
        source: "history",
      }),
    [],
  );
  return {
    items,
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
