import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ContextLedgerBlock } from "../../context-ledger/types";
import {
  buildContextLedgerGovernanceBuckets,
  parseContextLedgerChipSourceRef,
} from "../../context-ledger/utils/contextLedgerGovernance";

type IdentifiedEntry = {
  id: string;
};

type UseContextLedgerGovernanceParams<
  TManualMemory extends IdentifiedEntry,
  TNoteCard extends IdentifiedEntry,
  TInlineFileReference extends { path: string },
> = {
  activeFilePath: string | null | undefined;
  activeFileReferenceSignature: string | null;
  setDismissedActiveFileReference: Dispatch<SetStateAction<string | null>>;
  setCarryOverManualMemoryIds: Dispatch<SetStateAction<string[]>>;
  setRetainedManualMemoryIds: Dispatch<SetStateAction<string[]>>;
  setSelectedManualMemories: Dispatch<SetStateAction<TManualMemory[]>>;
  setCarryOverNoteCardIds: Dispatch<SetStateAction<string[]>>;
  setRetainedNoteCardIds: Dispatch<SetStateAction<string[]>>;
  setSelectedNoteCards: Dispatch<SetStateAction<TNoteCard[]>>;
  setCarryOverContextChipKeys: Dispatch<SetStateAction<string[]>>;
  setRetainedContextChipKeys: Dispatch<SetStateAction<string[]>>;
  setSelectedSkillNames: Dispatch<SetStateAction<string[]>>;
  setSelectedCommonsNames: Dispatch<SetStateAction<string[]>>;
  setSelectedInlineFileReferences: Dispatch<SetStateAction<TInlineFileReference[]>>;
};

function mergeUniqueStrings(currentValues: string[], nextValues: string[]) {
  return Array.from(new Set([...currentValues, ...nextValues]));
}

function normalizeLedgerFilePath(path: string) {
  const normalizedPath = path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalizedPath) {
    return "";
  }
  return /^[a-z]:\//i.test(normalizedPath) || normalizedPath.startsWith("//")
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}

export function useContextLedgerGovernance<
  TManualMemory extends IdentifiedEntry,
  TNoteCard extends IdentifiedEntry,
  TInlineFileReference extends { path: string },
>({
  activeFilePath,
  activeFileReferenceSignature,
  setDismissedActiveFileReference,
  setCarryOverManualMemoryIds,
  setRetainedManualMemoryIds,
  setSelectedManualMemories,
  setCarryOverNoteCardIds,
  setRetainedNoteCardIds,
  setSelectedNoteCards,
  setCarryOverContextChipKeys,
  setRetainedContextChipKeys,
  setSelectedSkillNames,
  setSelectedCommonsNames,
  setSelectedInlineFileReferences,
}: UseContextLedgerGovernanceParams<
  TManualMemory,
  TNoteCard,
  TInlineFileReference
>) {
  const removeGovernanceBuckets = useCallback((blocks: ContextLedgerBlock[]) => {
    const { manualMemoryIds, noteCardIds, helperKeys } =
      buildContextLedgerGovernanceBuckets(blocks);

    if (manualMemoryIds.length > 0) {
      setCarryOverManualMemoryIds((prev) =>
        prev.filter((entryId) => !manualMemoryIds.includes(entryId)),
      );
      setRetainedManualMemoryIds((prev) =>
        prev.filter((entryId) => !manualMemoryIds.includes(entryId)),
      );
      setSelectedManualMemories((prev) =>
        prev.filter((entry) => !manualMemoryIds.includes(entry.id)),
      );
    }

    if (noteCardIds.length > 0) {
      setCarryOverNoteCardIds((prev) =>
        prev.filter((entryId) => !noteCardIds.includes(entryId)),
      );
      setRetainedNoteCardIds((prev) =>
        prev.filter((entryId) => !noteCardIds.includes(entryId)),
      );
      setSelectedNoteCards((prev) =>
        prev.filter((entry) => !noteCardIds.includes(entry.id)),
      );
    }

    if (helperKeys.length > 0) {
      setCarryOverContextChipKeys((prev) =>
        prev.filter((entry) => !helperKeys.includes(entry)),
      );
      setRetainedContextChipKeys((prev) =>
        prev.filter((entry) => !helperKeys.includes(entry)),
      );
      const parsedHelperRefs = helperKeys
        .map((sourceRef) => parseContextLedgerChipSourceRef(sourceRef))
        .filter((entry): entry is NonNullable<typeof entry> => entry != null);
      const skillNames = parsedHelperRefs
        .filter((entry) => entry.chipType === "skill")
        .map((entry) => entry.chipName);
      const commonsNames = parsedHelperRefs
        .filter((entry) => entry.chipType === "commons")
        .map((entry) => entry.chipName);
      if (skillNames.length > 0) {
        setSelectedSkillNames((prev) =>
          prev.filter((name) => !skillNames.includes(name)),
        );
      }
      if (commonsNames.length > 0) {
        setSelectedCommonsNames((prev) =>
          prev.filter((name) => !commonsNames.includes(name)),
        );
      }
    }
  }, [
    setCarryOverContextChipKeys,
    setCarryOverManualMemoryIds,
    setCarryOverNoteCardIds,
    setRetainedContextChipKeys,
    setRetainedManualMemoryIds,
    setRetainedNoteCardIds,
    setSelectedCommonsNames,
    setSelectedManualMemories,
    setSelectedNoteCards,
    setSelectedSkillNames,
  ]);

  const handleToggleLedgerPin = useCallback((block: ContextLedgerBlock) => {
    if (!block.sourceRef) {
      return;
    }
    const sourceRef = block.sourceRef;
    if (block.kind === "manual_memory") {
      setCarryOverManualMemoryIds((prev) =>
        prev.includes(sourceRef)
          ? prev.filter((entryId) => entryId !== sourceRef)
          : [...prev, sourceRef],
      );
      return;
    }
    if (block.kind === "note_card") {
      setCarryOverNoteCardIds((prev) =>
        prev.includes(sourceRef)
          ? prev.filter((entryId) => entryId !== sourceRef)
          : [...prev, sourceRef],
      );
      return;
    }
    if (block.kind === "helper_selection") {
      setCarryOverContextChipKeys((prev) =>
        prev.includes(sourceRef)
          ? prev.filter((entry) => entry !== sourceRef)
          : [...prev, sourceRef],
      );
    }
  }, [
    setCarryOverContextChipKeys,
    setCarryOverManualMemoryIds,
    setCarryOverNoteCardIds,
  ]);

  const handleExcludeLedgerBlock = useCallback((block: ContextLedgerBlock) => {
    if (!block.sourceRef) {
      return;
    }
    if (block.kind === "file_reference") {
      const normalizedBlockPath = normalizeLedgerFilePath(block.sourceRef);
      const normalizedActiveFilePath = activeFilePath
        ? normalizeLedgerFilePath(activeFilePath)
        : "";
      if (
        normalizedBlockPath &&
        normalizedActiveFilePath &&
        normalizedBlockPath === normalizedActiveFilePath &&
        activeFileReferenceSignature
      ) {
        setDismissedActiveFileReference(activeFileReferenceSignature);
        return;
      }
      setSelectedInlineFileReferences((prev) =>
        prev.filter(
          (entry) =>
            normalizeLedgerFilePath(entry.path) !== normalizedBlockPath,
        ),
      );
      return;
    }
    removeGovernanceBuckets([block]);
  }, [
    activeFilePath,
    activeFileReferenceSignature,
    removeGovernanceBuckets,
    setDismissedActiveFileReference,
    setSelectedInlineFileReferences,
  ]);

  const handleClearCarryOverLedgerBlock = useCallback((block: ContextLedgerBlock) => {
    if (block.participationState !== "carried_over") {
      return;
    }
    removeGovernanceBuckets([block]);
  }, [removeGovernanceBuckets]);

  const handleBatchKeepLedgerBlocks = useCallback((blocks: ContextLedgerBlock[]) => {
    const { manualMemoryIds, noteCardIds, helperKeys } =
      buildContextLedgerGovernanceBuckets(blocks);

    if (manualMemoryIds.length > 0) {
      setCarryOverManualMemoryIds((prev) =>
        mergeUniqueStrings(prev, manualMemoryIds),
      );
    }
    if (noteCardIds.length > 0) {
      setCarryOverNoteCardIds((prev) =>
        mergeUniqueStrings(prev, noteCardIds),
      );
    }
    if (helperKeys.length > 0) {
      setCarryOverContextChipKeys((prev) =>
        mergeUniqueStrings(prev, helperKeys),
      );
    }
  }, [
    setCarryOverContextChipKeys,
    setCarryOverManualMemoryIds,
    setCarryOverNoteCardIds,
  ]);

  const handleBatchExcludeLedgerBlocks = useCallback((blocks: ContextLedgerBlock[]) => {
    removeGovernanceBuckets(blocks);
  }, [removeGovernanceBuckets]);

  const handleBatchClearCarryOverLedgerBlocks = useCallback((blocks: ContextLedgerBlock[]) => {
    removeGovernanceBuckets(blocks);
  }, [removeGovernanceBuckets]);

  return {
    handleToggleLedgerPin,
    handleExcludeLedgerBlock,
    handleClearCarryOverLedgerBlock,
    handleBatchKeepLedgerBlocks,
    handleBatchExcludeLedgerBlocks,
    handleBatchClearCarryOverLedgerBlocks,
  };
}
