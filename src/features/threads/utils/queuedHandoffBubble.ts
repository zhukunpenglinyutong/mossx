import type {
  ConversationItem,
  MessageSendOptions,
  QueuedMessage,
} from "../../../types";
import {
  buildComparableUserMessageKey,
  isEquivalentUserObservation,
} from "../assembly/conversationNormalization";

const OPTIMISTIC_USER_ITEM_PREFIX = "optimistic-user-";

type MessageConversationItem = Extract<ConversationItem, { kind: "message" }>;
type UserConversationMessage = MessageConversationItem & { role: "user" };

export type QueuedHandoffBubble = UserConversationMessage;
export {
  areSameUserImages,
  normalizeComparableUserText,
  normalizeUserImages,
} from "../assembly/conversationNormalization";

export function isOptimisticUserMessageId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_USER_ITEM_PREFIX);
}

export function isUserConversationMessage(
  item: ConversationItem | undefined,
): item is UserConversationMessage {
  return item?.kind === "message" && item.role === "user";
}

export function doesConversationItemMatchUserBubble(
  item: ConversationItem,
  bubble: Pick<UserConversationMessage, "text" | "images">,
): boolean {
  if (!isUserConversationMessage(item)) {
    return false;
  }
  return isEquivalentUserObservation(item, bubble);
}

export function hasPendingOptimisticUserBubble(items: ConversationItem[]): boolean {
  return items.some(
    (item) => isUserConversationMessage(item) && isOptimisticUserMessageId(item.id),
  );
}

function normalizeSelectedAgentName(options: MessageSendOptions | undefined): string | undefined {
  const trimmed = options?.selectedAgent?.name?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSelectedAgentIcon(options: MessageSendOptions | undefined): string | undefined {
  const trimmed = options?.selectedAgent?.icon?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeCollaborationMode(
  options: MessageSendOptions | undefined,
): "plan" | "code" | undefined {
  const mode = options?.collaborationMode?.mode;
  return mode === "plan" || mode === "code" ? mode : undefined;
}

export function buildQueuedHandoffBubbleItem(
  item: QueuedMessage,
): QueuedHandoffBubble {
  const collaborationMode = normalizeCollaborationMode(item.sendOptions);
  const selectedAgentName = normalizeSelectedAgentName(item.sendOptions);
  const selectedAgentIcon = normalizeSelectedAgentIcon(item.sendOptions);
  return {
    id: `queued-handoff-${item.id}`,
    kind: "message",
    role: "user",
    text: item.text,
    images: item.images?.length ? item.images : undefined,
    ...(collaborationMode ? { collaborationMode } : {}),
    ...(selectedAgentName ? { selectedAgentName } : {}),
    ...(selectedAgentIcon ? { selectedAgentIcon } : {}),
  };
}

export function appendQueuedHandoffBubbleIfNeeded(
  items: ConversationItem[],
  bubble: QueuedHandoffBubble | null,
): ConversationItem[] {
  if (!bubble) {
    return items;
  }
  const bubbleKey = buildComparableUserMessageKey(bubble);
  if (
    items.some(
      (item) =>
        isUserConversationMessage(item) &&
        buildComparableUserMessageKey(item) === bubbleKey,
    )
  ) {
    return items;
  }
  return [...items, bubble];
}
