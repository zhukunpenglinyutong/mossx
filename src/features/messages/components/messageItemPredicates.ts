import type { ConversationItem } from "../../../types";

export type MessageConversationItem = Extract<ConversationItem, { kind: "message" }>;
export type ReasoningConversationItem = Extract<ConversationItem, { kind: "reasoning" }>;

export function isMessageConversationItem(
  item: ConversationItem | undefined,
): item is MessageConversationItem {
  return item?.kind === "message";
}

export function isUserMessageConversationItem(
  item: ConversationItem | undefined,
): item is MessageConversationItem & { role: "user" } {
  return item?.kind === "message" && item.role === "user";
}

export function isAssistantMessageConversationItem(
  item: ConversationItem | undefined,
): item is MessageConversationItem & { role: "assistant" } {
  return item?.kind === "message" && item.role === "assistant";
}

export function isReasoningConversationItem(
  item: ConversationItem | undefined,
): item is ReasoningConversationItem {
  return item?.kind === "reasoning";
}
