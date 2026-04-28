import type { ConversationItem } from "../../../types";
import {
  isProcessingGeneratedImageItem,
  scoreGeneratedImageMatch,
} from "./generatedImagePlaceholder";

export function replaceMatchingProcessingGeneratedImage(
  list: ConversationItem[],
  incoming: Extract<ConversationItem, { kind: "generatedImage" }>,
) {
  const processingImages = list
    .map((item, index) => ({ item, index }))
    .filter(
      (
        entry,
      ): entry is {
        item: Extract<ConversationItem, { kind: "generatedImage" }>;
        index: number;
      } => isProcessingGeneratedImageItem(entry.item),
    );
  if (processingImages.length === 0) {
    return null;
  }
  let matchedIndex = -1;
  let matchedScore = 0;
  processingImages.forEach(({ item, index }) => {
    const score = scoreGeneratedImageMatch(item, incoming);
    if (score >= matchedScore) {
      matchedScore = score;
      matchedIndex = index;
    }
  });
  const targetIndex =
    matchedScore > 0
      ? matchedIndex
      : processingImages.length === 1
        ? processingImages[0]!.index
        : -1;
  if (targetIndex < 0) {
    return null;
  }
  const target = list[targetIndex];
  if (!isProcessingGeneratedImageItem(target)) {
    return null;
  }
  const next = [...list];
  next[targetIndex] = {
    ...target,
    ...incoming,
    id: incoming.id,
    promptText: incoming.promptText || target.promptText,
    fallbackText: incoming.fallbackText || target.fallbackText,
    anchorUserMessageId:
      incoming.anchorUserMessageId ?? target.anchorUserMessageId,
    images: incoming.images.length > 0 ? incoming.images : target.images,
  };
  return next;
}

export function shouldPreserveProcessingGeneratedImage(
  item: ConversationItem,
  incomingItems: ConversationItem[],
  incomingIds: Set<string>,
) {
  if (!isProcessingGeneratedImageItem(item)) {
    return false;
  }
  if (incomingIds.has(item.id)) {
    return false;
  }
  const incomingGeneratedImages = incomingItems.filter(
    (
      candidate,
    ): candidate is Extract<ConversationItem, { kind: "generatedImage" }> =>
      candidate.kind === "generatedImage" &&
      !isProcessingGeneratedImageItem(candidate),
  );
  if (incomingGeneratedImages.length === 0) {
    return true;
  }
  return !incomingGeneratedImages.some(
    (candidate) => scoreGeneratedImageMatch(item, candidate) > 0,
  );
}
