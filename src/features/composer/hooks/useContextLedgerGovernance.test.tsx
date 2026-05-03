/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { useContextLedgerGovernance } from "./useContextLedgerGovernance";
import type { ContextLedgerBlock } from "../../context-ledger/types";

type InlineFileReference = {
  path: string;
};

function makeFileReferenceBlock(sourceRef: string): ContextLedgerBlock {
  return {
    id: "file-ref-1",
    kind: "file_reference",
    title: "Guide.ts",
    sourceRef,
    participationState: "selected",
    freshness: "fresh",
    carryOverReason: null,
    estimate: {
      kind: "unknown",
      value: null,
    },
  };
}

function useGovernanceHarness(options?: {
  activeFilePath?: string | null;
  activeFileReferenceSignature?: string | null;
  inlineFileReferences?: InlineFileReference[];
}) {
  const [dismissedActiveFileReference, setDismissedActiveFileReference] =
    useState<string | null>(null);
  const [carryOverManualMemoryIds, setCarryOverManualMemoryIds] = useState<string[]>([]);
  const [retainedManualMemoryIds, setRetainedManualMemoryIds] = useState<string[]>([]);
  const [selectedManualMemories, setSelectedManualMemories] = useState<{ id: string }[]>([]);
  const [carryOverNoteCardIds, setCarryOverNoteCardIds] = useState<string[]>([]);
  const [retainedNoteCardIds, setRetainedNoteCardIds] = useState<string[]>([]);
  const [selectedNoteCards, setSelectedNoteCards] = useState<{ id: string }[]>([]);
  const [carryOverContextChipKeys, setCarryOverContextChipKeys] = useState<string[]>([]);
  const [retainedContextChipKeys, setRetainedContextChipKeys] = useState<string[]>([]);
  const [selectedSkillNames, setSelectedSkillNames] = useState<string[]>([]);
  const [selectedCommonsNames, setSelectedCommonsNames] = useState<string[]>([]);
  const [selectedInlineFileReferences, setSelectedInlineFileReferences] =
    useState<InlineFileReference[]>(options?.inlineFileReferences ?? []);

  const governance = useContextLedgerGovernance({
    activeFilePath: options?.activeFilePath,
    activeFileReferenceSignature: options?.activeFileReferenceSignature ?? null,
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
  });

  return {
    governance,
    dismissedActiveFileReference,
    carryOverManualMemoryIds,
    retainedManualMemoryIds,
    selectedManualMemories,
    carryOverNoteCardIds,
    retainedNoteCardIds,
    selectedNoteCards,
    carryOverContextChipKeys,
    retainedContextChipKeys,
    selectedSkillNames,
    selectedCommonsNames,
    selectedInlineFileReferences,
  };
}

describe("useContextLedgerGovernance", () => {
  it("dismisses the active file reference even when the ledger source path is normalized for Windows", () => {
    const { result } = renderHook(() =>
      useGovernanceHarness({
        activeFilePath: "C:\\Repo\\Docs\\Guide.ts",
        activeFileReferenceSignature: "active-file-signature",
      }),
    );

    act(() => {
      result.current.governance.handleExcludeLedgerBlock(
        makeFileReferenceBlock("c:/repo/docs/guide.ts"),
      );
    });

    expect(result.current.dismissedActiveFileReference).toBe("active-file-signature");
  });

  it("removes inline file references across Windows separator and drive-case variants", () => {
    const { result } = renderHook(() =>
      useGovernanceHarness({
        inlineFileReferences: [
          { path: "C:\\Repo\\Docs\\Guide.ts" },
          { path: "/tmp/other.ts" },
        ],
      }),
    );

    act(() => {
      result.current.governance.handleExcludeLedgerBlock(
        makeFileReferenceBlock("c:/repo/docs/guide.ts"),
      );
    });

    expect(result.current.selectedInlineFileReferences).toEqual([
      { path: "/tmp/other.ts" },
    ]);
  });
});
