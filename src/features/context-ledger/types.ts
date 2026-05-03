import type { NoteCardPreviewAttachment } from "../../services/tauri";
import type { ContextSelectionChip, DualContextUsageViewModel } from "../composer/components/ChatInputBox/types";
import type { MemoryContextInjectionMode, EngineType, ThreadTokenUsage } from "../../types";
import type { ManagedInstructionAttributionKind } from "../skills/utils/managedInstructionSource";

export type ContextLedgerGroupKind =
  | "recent_turns"
  | "compaction_summary"
  | "manual_memory"
  | "attached_resource"
  | "helper_selection";

export type ContextLedgerBlockKind =
  | "usage_snapshot"
  | "compaction_summary"
  | "manual_memory"
  | "note_card"
  | "file_reference"
  | "helper_selection";

export type ContextLedgerParticipationState =
  | "selected"
  | "pinned_next_send"
  | "carried_over"
  | "shared"
  | "degraded";
export type ContextLedgerCarryOverReason =
  | "will_carry_next_send"
  | "inherited_from_last_send";
export type ContextLedgerAttributionConfidence =
  | "precise"
  | "coarse"
  | "degraded";
export type ContextLedgerFreshness = "fresh" | "pending_sync" | "unknown";
export type ContextLedgerEstimateKind = "tokens" | "chars" | "unknown";

export type ContextLedgerEstimate = {
  kind: ContextLedgerEstimateKind;
  value: number | null;
};

export type ContextLedgerBlock = {
  id: string;
  kind: ContextLedgerBlockKind;
  title: string;
  titleKey?: string | null;
  titleParams?: Record<string, unknown> | null;
  detail?: string | null;
  detailKey?: string | null;
  detailParams?: Record<string, unknown> | null;
  inspectionTitle?: string | null;
  inspectionTitleKey?: string | null;
  inspectionTitleParams?: Record<string, unknown> | null;
  inspectionContent?: string | null;
  inspectionContentKey?: string | null;
  inspectionContentParams?: Record<string, unknown> | null;
  sourceRef?: string | null;
  sourcePath?: string | null;
  backendSource?: string | null;
  attributionKind?: ManagedInstructionAttributionKind | null;
  attributionConfidence?: ContextLedgerAttributionConfidence | null;
  participationState: ContextLedgerParticipationState;
  carryOverReason?: ContextLedgerCarryOverReason | null;
  freshness: ContextLedgerFreshness;
  estimate: ContextLedgerEstimate;
};

export type ContextLedgerSourceNavigationTarget =
  | {
      kind: "manual_memory";
      memoryId: string;
    }
  | {
      kind: "note_card";
      noteId: string;
    }
  | {
      kind: "file_reference";
      path: string;
    };

export type ContextLedgerComparisonBasis =
  | "last_send"
  | "pre_compaction";

export type ContextLedgerComparisonItemChange =
  | "added"
  | "removed"
  | "retained"
  | "changed";

export type ContextLedgerComparisonItem = {
  key: string;
  title: string;
  kind: ContextLedgerBlockKind;
  change: ContextLedgerComparisonItemChange;
};

export type ContextLedgerComparison = {
  basis: ContextLedgerComparisonBasis;
  addedCount: number;
  removedCount: number;
  retainedCount: number;
  changedCount: number;
  currentUsageTokens: number | null;
  previousUsageTokens: number | null;
  usageTokenDelta: number | null;
  items: ContextLedgerComparisonItem[];
};

export type ContextLedgerGroup = {
  kind: ContextLedgerGroupKind;
  blocks: ContextLedgerBlock[];
};

export type ContextLedgerProjection = {
  visible: boolean;
  totalBlockCount: number;
  totalGroupCount: number;
  totalUsageTokens: number | null;
  contextWindowTokens: number | null;
  groups: ContextLedgerGroup[];
};

export type ContextLedgerManualMemorySelection = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  kind: string;
  importance: string;
  updatedAt: number;
  tags: string[];
};

export type ContextLedgerNoteCardSelection = {
  id: string;
  title: string;
  plainTextExcerpt: string;
  bodyMarkdown: string;
  updatedAt: number;
  archived: boolean;
  imageCount: number;
  previewAttachments: NoteCardPreviewAttachment[];
};

export type ContextLedgerInlineFileReferenceSelection = {
  id: string;
  label: string;
  path: string;
};

export type ContextLedgerActiveFileReference = {
  path: string;
  lineRange?: {
    startLine: number;
    endLine: number;
  } | null;
};

export type ContextLedgerProjectionInput = {
  engine: EngineType | null | undefined;
  contextUsage: ThreadTokenUsage | null;
  contextDualViewEnabled: boolean;
  dualContextUsage: DualContextUsageViewModel | null;
  manualMemoryInjectionMode: MemoryContextInjectionMode;
  selectedManualMemories: ContextLedgerManualMemorySelection[];
  selectedNoteCards: ContextLedgerNoteCardSelection[];
  selectedInlineFileReferences: ContextLedgerInlineFileReferenceSelection[];
  activeFileReference?: ContextLedgerActiveFileReference | null;
  selectedContextChips: ContextSelectionChip[];
  carryOverManualMemoryIds?: string[];
  carryOverNoteCardIds?: string[];
  carryOverContextChipKeys?: string[];
  retainedManualMemoryIds?: string[];
  retainedNoteCardIds?: string[];
  retainedContextChipKeys?: string[];
};
