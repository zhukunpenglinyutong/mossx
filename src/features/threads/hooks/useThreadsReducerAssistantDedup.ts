import type { ConversationItem, ThreadSummary } from "../../../types";
import { areEquivalentAssistantMessageTexts } from "../assembly/conversationNormalization";
import { mergeAgentMessageText } from "./threadReducerTextMerge";

type MessageItem = Extract<ConversationItem, { kind: "message" }>;
type AssistantMessageItem = MessageItem & { role: "assistant" };
type UserMessageItem = MessageItem & { role: "user" };

function isUserMessageItem(item: ConversationItem | undefined): item is UserMessageItem {
  return item?.kind === "message" && item.role === "user";
}

function isAssistantMessageItem(
  item: ConversationItem | undefined,
): item is AssistantMessageItem {
  return item?.kind === "message" && item.role === "assistant";
}

function hasKnownNonCodexThreadPrefix(threadId: string) {
  const normalized = threadId.trim().toLowerCase();
  return (
    normalized.startsWith("claude:") ||
    normalized.startsWith("claude-pending-") ||
    normalized.startsWith("gemini:") ||
    normalized.startsWith("gemini-pending-") ||
    normalized.startsWith("opencode:") ||
    normalized.startsWith("opencode-pending-") ||
    normalized.startsWith("shared:")
  );
}

function inferCodexThreadId(threadId: string) {
  const normalized = threadId.trim().toLowerCase();
  if (!normalized || hasKnownNonCodexThreadPrefix(normalized)) {
    return false;
  }
  return (
    normalized.startsWith("codex:") ||
    normalized.startsWith("codex-pending-") ||
    !normalized.includes(":")
  );
}

function findThreadSummary(
  threadsByWorkspace: Record<string, ThreadSummary[]>,
  workspaceId: string,
  threadId: string,
) {
  const threads = threadsByWorkspace[workspaceId] ?? [];
  const exact = threads.find((thread) => thread.id === threadId);
  if (exact || threadId.includes(":")) {
    return exact ?? null;
  }
  const aliasMatches = threads.filter((thread) => thread.id.endsWith(`:${threadId}`));
  return aliasMatches.length === 1 ? aliasMatches[0] ?? null : null;
}

export function shouldDeduplicateCodexAssistantMessages(params: {
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  workspaceId: string;
  threadId: string;
}) {
  const thread = findThreadSummary(
    params.threadsByWorkspace,
    params.workspaceId,
    params.threadId,
  );
  if (thread?.threadKind === "shared") {
    return false;
  }
  if (thread?.engineSource) {
    return thread.engineSource === "codex";
  }
  return inferCodexThreadId(params.threadId);
}

export function findEquivalentCodexAssistantMessageIndex(
  list: ConversationItem[],
  incomingText: string,
) {
  if (!incomingText.trim()) {
    return -1;
  }
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (!item) {
      continue;
    }
    if (isUserMessageItem(item)) {
      return -1;
    }
    if (!isAssistantMessageItem(item)) {
      continue;
    }
    if (
      areEquivalentAssistantMessageTexts(
        item.text,
        incomingText,
        mergeAgentMessageText,
      )
    ) {
      return index;
    }
  }
  return -1;
}
