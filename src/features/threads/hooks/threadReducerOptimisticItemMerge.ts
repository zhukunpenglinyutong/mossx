import type { ConversationItem } from "../../../types";
import {
  buildComparableUserMessageKey,
  isEquivalentUserObservation,
} from "../assembly/conversationNormalization";
import { isProcessingGeneratedImageItem } from "../utils/generatedImagePlaceholder";
import { shouldPreserveProcessingGeneratedImage } from "../utils/generatedImagePlaceholderMatching";
import { isOptimisticUserMessageId } from "../utils/queuedHandoffBubble";
import {
  buildOptimisticUserReplacementMap,
  insertGeneratedImagesAfterAnchors,
  retargetGeneratedImageAnchor,
} from "./threadReducerOptimisticUserReconciliation";

type MessageItem = Extract<ConversationItem, { kind: "message" }>;
type UserMessageItem = MessageItem & { role: "user" };
type GeneratedImageItem = Extract<ConversationItem, { kind: "generatedImage" }>;

function isUserMessageItem(item: ConversationItem | undefined): item is UserMessageItem {
  return item?.kind === "message" && item.role === "user";
}

function isOptimisticUserMessage(
  item: ConversationItem,
): item is UserMessageItem {
  return isUserMessageItem(item) && isOptimisticUserMessageId(item.id);
}

function findMatchingRealUserMessage(
  list: ConversationItem[],
  candidate: UserMessageItem,
) {
  return list.some((item) => {
    if (!isUserMessageItem(item)) {
      return false;
    }
    if (isOptimisticUserMessageId(item.id)) {
      return false;
    }
    return isEquivalentUserObservation(item, candidate);
  });
}

export function mergeThreadItemsPreservingOptimisticUsers(
  localItems: ConversationItem[],
  incomingItems: ConversationItem[],
  isProcessing: boolean,
) {
  const hasSelectedAgentName = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;
  const hasSelectedAgentIcon = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;
  const hasSelectedAgentMetadata = (item: UserMessageItem) =>
    hasSelectedAgentName(item.selectedAgentName) ||
    hasSelectedAgentIcon(item.selectedAgentIcon);
  const toComparableUserMessageSequence = (items: ConversationItem[]) =>
    items
      .filter(isUserMessageItem)
      .map((item) => buildComparableUserMessageKey(item));
  const areSameSequence = (left: string[], right: string[]) => {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => value === right[index]);
  };
  const localUserSequence = toComparableUserMessageSequence(localItems);
  const incomingUserSequence = toComparableUserMessageSequence(incomingItems);
  const hasUserSequenceDrift = !areSameSequence(localUserSequence, incomingUserSequence);
  const optimisticUserReplacementById = buildOptimisticUserReplacementMap(
    localItems,
    incomingItems,
  );
  const localUserMessageMetadataBuckets = new Map<
    string,
    Array<Pick<UserMessageItem, "selectedAgentName" | "selectedAgentIcon">>
  >();
  for (const item of localItems) {
    if (!isUserMessageItem(item) || !hasSelectedAgentMetadata(item)) {
      continue;
    }
    const key = buildComparableUserMessageKey(item);
    const bucket = localUserMessageMetadataBuckets.get(key) ?? [];
    bucket.push({
      selectedAgentName: item.selectedAgentName ?? null,
      selectedAgentIcon: item.selectedAgentIcon ?? null,
    });
    localUserMessageMetadataBuckets.set(key, bucket);
  }

  let mergedItems = incomingItems.map((item) => {
    if (!isUserMessageItem(item)) {
      return item;
    }
    const key = buildComparableUserMessageKey(item);
    const bucket = localUserMessageMetadataBuckets.get(key);
    if (!bucket || bucket.length === 0) {
      return item;
    }
    if (hasUserSequenceDrift && bucket.length > 1) {
      return item;
    }
    const matchedLocalMetadata = bucket.shift();
    if (!matchedLocalMetadata) {
      return item;
    }
    if (bucket.length === 0) {
      localUserMessageMetadataBuckets.delete(key);
    } else {
      localUserMessageMetadataBuckets.set(key, bucket);
    }
    const incomingHasName = hasSelectedAgentName(item.selectedAgentName);
    const incomingHasIcon = hasSelectedAgentIcon(item.selectedAgentIcon);
    if (incomingHasName && incomingHasIcon) {
      return item;
    }
    return {
      ...item,
      selectedAgentName: incomingHasName
        ? item.selectedAgentName
        : matchedLocalMetadata.selectedAgentName,
      selectedAgentIcon: incomingHasIcon
        ? item.selectedAgentIcon
        : matchedLocalMetadata.selectedAgentIcon,
    };
  });

  if (localItems.length > 0) {
    let lastRealUserIndex = -1;
    for (let index = localItems.length - 1; index >= 0; index -= 1) {
      const candidate = localItems[index];
      if (
        isUserMessageItem(candidate) &&
        !isOptimisticUserMessage(candidate)
      ) {
        lastRealUserIndex = index;
        break;
      }
    }
    const optimisticCandidates = localItems
      .map((item, index) => ({ item, index }))
      .filter(
        (entry): entry is { item: UserMessageItem; index: number } =>
          isOptimisticUserMessage(entry.item) && entry.index > lastRealUserIndex,
      )
      .map((entry) => entry.item);
    const preservedOptimisticUsers = optimisticCandidates.filter(
      (item) => !findMatchingRealUserMessage(mergedItems, item),
    );
    if (preservedOptimisticUsers.length > 0) {
      const preservedOptimisticIds = new Set(
        preservedOptimisticUsers.map((item) => item.id),
      );
      const mergedById = new Map(mergedItems.map((item) => [item.id, item]));
      const orderedItems: ConversationItem[] = [];
      const emittedIds = new Set<string>();
      localItems.forEach((localItem) => {
        if (preservedOptimisticIds.has(localItem.id)) {
          if (!emittedIds.has(localItem.id)) {
            orderedItems.push(localItem);
            emittedIds.add(localItem.id);
          }
          return;
        }
        const mergedCandidate = mergedById.get(localItem.id);
        if (mergedCandidate && !emittedIds.has(localItem.id)) {
          orderedItems.push(mergedCandidate);
          emittedIds.add(localItem.id);
        }
      });
      mergedItems.forEach((item) => {
        if (emittedIds.has(item.id)) {
          return;
        }
        orderedItems.push(item);
        emittedIds.add(item.id);
      });
      mergedItems = orderedItems;
    }
  }

  const incomingIds = new Set(mergedItems.map((item) => item.id));

  if (isProcessing) {
    const preservedProcessingGeneratedImages = localItems
      .map((item) =>
        isProcessingGeneratedImageItem(item)
          ? retargetGeneratedImageAnchor(item, optimisticUserReplacementById)
          : item,
      )
      .filter(
        (item): item is GeneratedImageItem =>
          isProcessingGeneratedImageItem(item) &&
          shouldPreserveProcessingGeneratedImage(
            item,
            mergedItems,
            incomingIds,
          ),
      );
    if (preservedProcessingGeneratedImages.length > 0) {
      mergedItems = insertGeneratedImagesAfterAnchors(
        mergedItems,
        preservedProcessingGeneratedImages,
      );
    }
  }

  if (isProcessing) {
    // Keep locally generated requestUserInput submitted records visible while
    // the thread is still processing and backend snapshot may lag.
    const preservedSubmittedItems = localItems.filter(
      (item) =>
        item.kind === "tool" &&
        item.toolType === "requestUserInputSubmitted" &&
        !incomingIds.has(item.id),
    );
    if (preservedSubmittedItems.length > 0) {
      mergedItems = [...mergedItems, ...preservedSubmittedItems];
    }
  }

  return mergedItems;
}
