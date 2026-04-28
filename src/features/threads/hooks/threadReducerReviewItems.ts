import type { ConversationItem } from "../../../types";

type ReviewItem = Extract<ConversationItem, { kind: "review" }>;

export function dropLatestLocalReviewStart(list: ConversationItem[]) {
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    if (!item) {
      continue;
    }
    if (
      item.kind === "review" &&
      item.state === "started" &&
      item.id.startsWith("review-start-")
    ) {
      return [...list.slice(0, index), ...list.slice(index + 1)];
    }
  }
  return list;
}

export function findMatchingReview(
  list: ConversationItem[],
  target: ReviewItem,
) {
  const normalizedText = target.text.trim();
  return list.find(
    (item) =>
      item.kind === "review" &&
      item.state === target.state &&
      item.text.trim() === normalizedText,
  );
}

export function ensureUniqueReviewId(
  list: ConversationItem[],
  item: ConversationItem,
) {
  if (item.kind !== "review") {
    return item;
  }
  if (!list.some((entry) => entry.id === item.id)) {
    return item;
  }
  const existingIds = new Set(list.map((entry) => entry.id));
  let suffix = 1;
  let candidate = `${item.id}-${suffix}`;
  while (existingIds.has(candidate)) {
    suffix += 1;
    candidate = `${item.id}-${suffix}`;
  }
  return { ...item, id: candidate };
}

export function isDuplicateReviewById(
  list: ConversationItem[],
  target: ReviewItem,
) {
  const normalizedText = target.text.trim();
  return list.some(
    (item) =>
      item.kind === "review" &&
      item.id === target.id &&
      item.state === target.state &&
      item.text.trim() === normalizedText,
  );
}
