import type { ContextLedgerBlock } from "../types";

export type ContextLedgerNamedChipType = "skill" | "commons";

type IdentifiedEntry = {
  id: string;
};

export function filterRetainedEntries<T extends IdentifiedEntry>(
  entries: T[],
  carryOverIds: string[],
) {
  return entries.filter((entry) => carryOverIds.includes(entry.id));
}

export function filterRetainedChipNames(
  names: string[],
  carryOverKeys: string[],
  chipType: ContextLedgerNamedChipType,
) {
  return names.filter((name) => carryOverKeys.includes(`${chipType}:${name}`));
}

export function buildRetainedContextChipKeys(
  skillNames: string[],
  commonsNames: string[],
) {
  return [
    ...skillNames.map((name) => `skill:${name}`),
    ...commonsNames.map((name) => `commons:${name}`),
  ];
}

export function parseContextLedgerChipSourceRef(sourceRef: string): {
  chipType: ContextLedgerNamedChipType;
  chipName: string;
} | null {
  const [chipType, ...nameParts] = sourceRef.split(":");
  const chipName = nameParts.join(":");
  if (!chipName || (chipType !== "skill" && chipType !== "commons")) {
    return null;
  }
  return {
    chipType,
    chipName,
  };
}

export function isBatchGovernableBlock(block: ContextLedgerBlock) {
  return (
    block.kind === "manual_memory"
    || block.kind === "note_card"
    || block.kind === "helper_selection"
  );
}

export function canBatchKeepBlock(block: ContextLedgerBlock) {
  return isBatchGovernableBlock(block) && (
    block.participationState === "selected"
    || block.participationState === "carried_over"
  );
}

export function canBatchExcludeBlock(block: ContextLedgerBlock) {
  return isBatchGovernableBlock(block) && (
    block.participationState === "selected"
    || block.participationState === "pinned_next_send"
  );
}

export function canBatchClearCarryOverBlock(block: ContextLedgerBlock) {
  return isBatchGovernableBlock(block) && block.participationState === "carried_over";
}

export type ContextLedgerGovernanceBuckets = {
  manualMemoryIds: string[];
  noteCardIds: string[];
  helperKeys: string[];
};

export function buildContextLedgerGovernanceBuckets(
  blocks: ContextLedgerBlock[],
): ContextLedgerGovernanceBuckets {
  const manualMemoryIds = new Set<string>();
  const noteCardIds = new Set<string>();
  const helperKeys = new Set<string>();

  for (const block of blocks) {
    const sourceRef = block.sourceRef?.trim();
    if (!sourceRef) {
      continue;
    }
    if (block.kind === "manual_memory") {
      manualMemoryIds.add(sourceRef);
      continue;
    }
    if (block.kind === "note_card") {
      noteCardIds.add(sourceRef);
      continue;
    }
    if (block.kind === "helper_selection" && parseContextLedgerChipSourceRef(sourceRef)) {
      helperKeys.add(sourceRef);
    }
  }

  return {
    manualMemoryIds: Array.from(manualMemoryIds),
    noteCardIds: Array.from(noteCardIds),
    helperKeys: Array.from(helperKeys),
  };
}
