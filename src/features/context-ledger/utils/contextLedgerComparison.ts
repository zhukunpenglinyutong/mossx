import type {
  ContextLedgerBlock,
  ContextLedgerComparison,
  ContextLedgerComparisonBasis,
  ContextLedgerComparisonItem,
  ContextLedgerProjection,
} from "../types";

function getBlockComparisonKey(block: ContextLedgerBlock) {
  return block.sourceRef || `${block.kind}:${block.id}`;
}

function getBlockComparisonTitle(block: ContextLedgerBlock) {
  return block.inspectionTitle || block.title || block.id;
}

function areBlockSnapshotsEquivalent(
  left: ContextLedgerBlock,
  right: ContextLedgerBlock,
) {
  return (
    left.kind === right.kind
    && left.title === right.title
    && left.detail === right.detail
    && left.titleKey === right.titleKey
    && left.detailKey === right.detailKey
    && left.participationState === right.participationState
    && left.carryOverReason === right.carryOverReason
    && left.freshness === right.freshness
    && left.sourcePath === right.sourcePath
    && left.backendSource === right.backendSource
    && left.attributionKind === right.attributionKind
    && left.attributionConfidence === right.attributionConfidence
    && left.estimate.kind === right.estimate.kind
    && left.estimate.value === right.estimate.value
  );
}

function flattenProjection(projection: ContextLedgerProjection) {
  const map = new Map<string, ContextLedgerBlock>();
  for (const group of projection.groups) {
    for (const block of group.blocks) {
      map.set(getBlockComparisonKey(block), block);
    }
  }
  return map;
}

function pushComparisonItem(
  items: ContextLedgerComparisonItem[],
  block: ContextLedgerBlock,
  change: ContextLedgerComparisonItem["change"],
) {
  items.push({
    key: getBlockComparisonKey(block),
    title: getBlockComparisonTitle(block),
    kind: block.kind,
    change,
  });
}

export function buildContextLedgerComparison(
  current: ContextLedgerProjection | null,
  previous: ContextLedgerProjection | null,
  basis: ContextLedgerComparisonBasis,
): ContextLedgerComparison | null {
  if (!current || !previous) {
    return null;
  }

  const currentBlocks = flattenProjection(current);
  const previousBlocks = flattenProjection(previous);
  const comparisonItems: ContextLedgerComparisonItem[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let retainedCount = 0;
  let changedCount = 0;

  const keys = new Set([
    ...currentBlocks.keys(),
    ...previousBlocks.keys(),
  ]);

  for (const key of keys) {
    const currentBlock = currentBlocks.get(key);
    const previousBlock = previousBlocks.get(key);
    if (currentBlock && !previousBlock) {
      addedCount += 1;
      pushComparisonItem(comparisonItems, currentBlock, "added");
      continue;
    }
    if (!currentBlock && previousBlock) {
      removedCount += 1;
      pushComparisonItem(comparisonItems, previousBlock, "removed");
      continue;
    }
    if (!currentBlock || !previousBlock) {
      continue;
    }
    if (areBlockSnapshotsEquivalent(currentBlock, previousBlock)) {
      retainedCount += 1;
      continue;
    }
    changedCount += 1;
    pushComparisonItem(comparisonItems, currentBlock, "changed");
  }

  const currentUsageTokens = current.totalUsageTokens;
  const previousUsageTokens = previous.totalUsageTokens;
  const usageTokenDelta =
    currentUsageTokens != null && previousUsageTokens != null
      ? currentUsageTokens - previousUsageTokens
      : null;

  const hasMaterialChanges =
    addedCount > 0
    || removedCount > 0
    || changedCount > 0
    || (usageTokenDelta != null && usageTokenDelta !== 0);
  if (!hasMaterialChanges) {
    return null;
  }

  const sortedItems = comparisonItems.sort((left, right) => {
    const changeOrder = {
      changed: 0,
      added: 1,
      removed: 2,
      retained: 3,
    } as const;
    const leftOrder = changeOrder[left.change];
    const rightOrder = changeOrder[right.change];
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.title.localeCompare(right.title);
  });

  return {
    basis,
    addedCount,
    removedCount,
    retainedCount,
    changedCount,
    currentUsageTokens,
    previousUsageTokens,
    usageTokenDelta,
    items: sortedItems,
  };
}
