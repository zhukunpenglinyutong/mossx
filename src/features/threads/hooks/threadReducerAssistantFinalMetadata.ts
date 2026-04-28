import type { ConversationItem } from "../../../types";

type MessageItem = Extract<ConversationItem, { kind: "message" }>;
type AssistantMessageItem = MessageItem & { role: "assistant" };

export function clearAssistantFinalMetadata(
  item: AssistantMessageItem,
): AssistantMessageItem {
  const {
    finalCompletedAt: _finalCompletedAt,
    finalDurationMs: _finalDurationMs,
    ...rest
  } = item;
  return rest as AssistantMessageItem;
}

export function shouldPreserveAssistantFinalMetadata(
  item: AssistantMessageItem,
  isThreadProcessing: boolean,
) {
  return item.isFinal === true && !isThreadProcessing;
}
