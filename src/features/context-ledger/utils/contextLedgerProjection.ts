import type { ContextCompactionState, DualContextUsageViewModel } from "../../composer/components/ChatInputBox/types";
import type { MemoryContextInjectionMode, ThreadTokenUsage } from "../../../types";
import { buildContextLine } from "../../project-memory/utils/memoryContextInjection";
import { buildNoteBlock } from "../../note-cards/utils/noteCardContextInjection";
import {
  classifyManagedInstructionAttribution,
  normalizeManagedInstructionSource,
} from "../../skills/utils/managedInstructionSource";
import type {
  ContextLedgerAttributionConfidence,
  ContextLedgerBlock,
  ContextLedgerCarryOverReason,
  ContextLedgerFreshness,
  ContextLedgerGroup,
  ContextLedgerInlineFileReferenceSelection,
  ContextLedgerNoteCardSelection,
  ContextLedgerParticipationState,
  ContextLedgerProjection,
  ContextLedgerProjectionInput,
} from "../types";
import type { CodeAnnotationSelection } from "../../code-annotations/types";

export function clampLedgerPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.min(Math.max(percent, 0), 100);
}

export function resolveCompactionState(
  isContextCompacting: boolean,
  lifecycleState: "idle" | "compacting" | "completed",
): ContextCompactionState {
  if (isContextCompacting || lifecycleState === "compacting") {
    return "compacting";
  }
  if (lifecycleState === "completed") {
    return "compacted";
  }
  return "idle";
}

export function resolveDualContextUsageModel(
  contextUsage: ThreadTokenUsage | null,
  isContextCompacting: boolean,
  lifecycleState: "idle" | "compacting" | "completed",
  compactionSource: "auto" | "manual" | null,
  compactionCompletedAt: number | null,
  lastTokenUsageUpdatedAt: number | null,
): DualContextUsageViewModel {
  const contextWindow = Math.max(contextUsage?.modelContextWindow ?? 0, 0);
  const lastInput = Math.max(contextUsage?.last.inputTokens ?? 0, 0);
  const lastCached = Math.max(contextUsage?.last.cachedInputTokens ?? 0, 0);
  const usedTokens = lastInput + lastCached;
  const hasUsage = usedTokens > 0 && contextWindow > 0;
  const percent =
    contextWindow > 0
      ? clampLedgerPercent((usedTokens / contextWindow) * 100)
      : 0;
  return {
    usedTokens,
    contextWindow,
    percent,
    hasUsage,
    compactionState: resolveCompactionState(isContextCompacting, lifecycleState),
    compactionSource: compactionSource ?? null,
    usageSyncPendingAfterCompaction:
      lifecycleState === "completed"
      && (
        compactionCompletedAt == null
        || lastTokenUsageUpdatedAt == null
        || lastTokenUsageUpdatedAt < compactionCompletedAt
      ),
  };
}

function normalizePath(value: string) {
  return value.trim().replace(/\\/g, "/");
}

function truncateLedgerPreview(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxChars - 1, 0)).trimEnd()}…`;
}

function getFileName(path: string) {
  const normalized = normalizePath(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function toDedupeKey(path: string) {
  const normalized = normalizePath(path);
  if (!normalized) {
    return "";
  }
  if (/^[A-Za-z]:\//.test(normalized) || normalized.includes("\\")) {
    return normalized.toLowerCase();
  }
  return normalized;
}

function formatLineRange(
  lineRange: {
    startLine: number;
    endLine: number;
  } | null | undefined,
) {
  if (!lineRange) {
    return null;
  }
  if (lineRange.startLine === lineRange.endLine) {
    return `L${lineRange.startLine}`;
  }
  return `L${lineRange.startLine}-${lineRange.endLine}`;
}

const MANUAL_MEMORY_USER_INPUT_REGEX =
  /(?:^|\n)\s*(?:用户输入|User input)[:：]\s*([\s\S]*?)(?=\n+\s*(?:AI 回复|助手输出摘要|助手输出|Assistant response|Assistant summary|Assistant output)[:：]|$)/i;
const MANUAL_MEMORY_ASSISTANT_SUMMARY_REGEX =
  /(?:^|\n)\s*(?:AI 回复|助手输出摘要|助手输出|Assistant response|Assistant summary|Assistant output)[:：]\s*([\s\S]*?)(?=\n+\s*(?:用户输入|User input)[:：]|$)/i;

function resolveManualMemoryTitle(memory: ContextLedgerProjectionInput["selectedManualMemories"][number]) {
  const detail = memory.detail.trim();
  if (detail) {
    const matched = detail.match(MANUAL_MEMORY_USER_INPUT_REGEX);
    if (matched?.[1]) {
      const normalized = matched[1].replace(/\s+/g, " ").trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  if (memory.summary.trim()) {
    return memory.summary.trim();
  }
  return memory.title.trim() || memory.id;
}

function resolveManualMemoryDetail(memory: ContextLedgerProjectionInput["selectedManualMemories"][number]) {
  const detail = memory.detail.trim();
  if (detail) {
    const matched = detail.match(MANUAL_MEMORY_ASSISTANT_SUMMARY_REGEX);
    if (matched?.[1]) {
      const normalized = matched[1].replace(/\s+/g, " ").trim();
      if (normalized) {
        return normalized;
      }
    }
  }
  return memory.summary.trim() || null;
}

function resolveNoteCardTitle(noteCard: ContextLedgerNoteCardSelection) {
  const normalizedBody = noteCard.bodyMarkdown.trim();
  if (normalizedBody) {
    const firstLine = normalizedBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (firstLine) {
      return firstLine.replace(/^#{1,6}\s*/, "");
    }
  }
  return noteCard.plainTextExcerpt.trim() || noteCard.title.trim() || noteCard.id;
}

function isPinnedManualMemory(
  memoryId: string,
  input: ContextLedgerProjectionInput,
) {
  return input.carryOverManualMemoryIds?.includes(memoryId) ?? false;
}

function isRetainedManualMemory(
  memoryId: string,
  input: ContextLedgerProjectionInput,
) {
  return input.retainedManualMemoryIds?.includes(memoryId) ?? false;
}

function isPinnedNoteCard(
  noteCardId: string,
  input: ContextLedgerProjectionInput,
) {
  return input.carryOverNoteCardIds?.includes(noteCardId) ?? false;
}

function isRetainedNoteCard(
  noteCardId: string,
  input: ContextLedgerProjectionInput,
) {
  return input.retainedNoteCardIds?.includes(noteCardId) ?? false;
}

function isPinnedContextChip(
  sourceRef: string,
  input: ContextLedgerProjectionInput,
) {
  return input.carryOverContextChipKeys?.includes(sourceRef) ?? false;
}

function isRetainedContextChip(
  sourceRef: string,
  input: ContextLedgerProjectionInput,
) {
  return input.retainedContextChipKeys?.includes(sourceRef) ?? false;
}

function resolveNoteCardDetail(noteCard: ContextLedgerNoteCardSelection) {
  const normalizedTitle = noteCard.title.trim();
  const normalizedExcerpt = noteCard.plainTextExcerpt.trim();
  const resolvedTitle = resolveNoteCardTitle(noteCard);
  if (normalizedTitle && normalizedTitle !== resolvedTitle) {
    return normalizedTitle;
  }
  if (normalizedExcerpt && normalizedExcerpt !== resolvedTitle) {
    return normalizedExcerpt;
  }
  return null;
}

function estimateManualMemoryChars(
  memory: ContextLedgerProjectionInput["selectedManualMemories"][number],
  mode: MemoryContextInjectionMode,
) {
  const line = buildContextLine(
    {
      kind: memory.kind,
      title: memory.title,
      summary: memory.summary,
      detail: memory.detail,
      cleanText: memory.summary,
    },
    mode,
  );
  return line?.length ?? null;
}

function estimateNoteCardChars(noteCard: ContextLedgerNoteCardSelection) {
  return buildNoteBlock({
    title: noteCard.title,
    bodyMarkdown: noteCard.bodyMarkdown,
    plainTextExcerpt: noteCard.plainTextExcerpt,
    archivedAt: noteCard.archived ? noteCard.updatedAt : null,
    attachments: noteCard.previewAttachments.map((attachment) => ({
      fileName: attachment.fileName,
      absolutePath: attachment.absolutePath,
    })),
  }).length;
}

function resolveCarryOverReason(
  participationState: ContextLedgerParticipationState,
): ContextLedgerCarryOverReason | null {
  if (participationState === "pinned_next_send") {
    return "will_carry_next_send";
  }
  if (participationState === "carried_over") {
    return "inherited_from_last_send";
  }
  return null;
}

function resolveAttributionConfidence(
  attributionKind: ContextLedgerBlock["attributionKind"],
  backendSource: string | null,
): ContextLedgerAttributionConfidence | null {
  if (attributionKind === "degraded" || !backendSource) {
    return "degraded";
  }
  if (attributionKind === "workspace_context" && backendSource === "workspace_managed") {
    return "precise";
  }
  if (attributionKind === "engine_injected" || attributionKind === "system_injected") {
    return "coarse";
  }
  return "coarse";
}

function buildRecentTurnsBlock(input: ContextLedgerProjectionInput): ContextLedgerBlock | null {
  if (!input.contextUsage) {
    return null;
  }
  const totalTokens = Math.max(input.contextUsage.total.totalTokens ?? 0, 0);
  const contextWindowTokens = Math.max(input.contextUsage.modelContextWindow ?? 0, 0);
  const dualUsage = input.contextDualViewEnabled ? input.dualContextUsage : null;
  const windowSummary =
    dualUsage && contextWindowTokens > 0
      ? `${dualUsage.usedTokens} / ${contextWindowTokens}`
      : null;
  const supportedEngine =
    input.engine === "codex" || input.engine === "claude" || input.engine === "gemini";
  const participationState: ContextLedgerParticipationState = supportedEngine
    ? "shared"
    : "degraded";
  const freshness: ContextLedgerFreshness =
    dualUsage?.usageSyncPendingAfterCompaction ? "pending_sync" : "fresh";
  return {
    id: "recent-turns",
    kind: "usage_snapshot",
    title: input.engine === "codex" ? "codex-recent-turns" : "recent-turns",
    titleKey:
      input.engine === "codex"
        ? "composer.contextLedgerTitleRecentTurnsCodex"
        : "composer.contextLedgerTitleRecentTurns",
    detail: null,
    detailKey: windowSummary
      ? "composer.contextLedgerDetailUsageWindow"
      : "composer.contextLedgerDetailUsageTotal",
    detailParams: windowSummary
      ? {
          usedTokens: dualUsage?.usedTokens ?? 0,
          contextWindowTokens,
          totalTokens,
        }
      : {
          totalTokens,
        },
    participationState,
    freshness,
    inspectionTitleKey:
      input.engine === "codex"
        ? "composer.contextLedgerTitleRecentTurnsCodex"
        : "composer.contextLedgerTitleRecentTurns",
    inspectionContentKey: windowSummary
      ? "composer.contextLedgerInspectionUsageWindow"
      : "composer.contextLedgerInspectionUsageTotal",
    inspectionContentParams: windowSummary
      ? {
          usedTokens: dualUsage?.usedTokens ?? 0,
          contextWindowTokens,
          totalTokens,
        }
      : {
          totalTokens,
        },
    estimate: {
      kind: "tokens",
      value: totalTokens,
    },
  };
}

function buildCompactionBlock(input: ContextLedgerProjectionInput): ContextLedgerBlock | null {
  const dualUsage = input.contextDualViewEnabled ? input.dualContextUsage : null;
  if (!dualUsage || dualUsage.compactionState === "idle") {
    return null;
  }
  const freshness: ContextLedgerFreshness = dualUsage.usageSyncPendingAfterCompaction
    ? "pending_sync"
    : "fresh";
  return {
    id: "compaction-summary",
    kind: "compaction_summary",
    title:
      dualUsage.compactionState === "compacting"
        ? dualUsage.compactionSource === "auto"
          ? "compaction-running-auto"
          : "compaction-running-manual"
        : dualUsage.compactionSource === "auto"
          ? "compaction-completed-auto"
          : "compaction-completed-manual",
    titleKey:
      dualUsage.compactionState === "compacting"
        ? dualUsage.compactionSource === "auto"
          ? "composer.contextLedgerTitleCompactionRunningAuto"
          : "composer.contextLedgerTitleCompactionRunning"
        : dualUsage.compactionSource === "auto"
          ? "composer.contextLedgerTitleCompactionCompletedAuto"
          : "composer.contextLedgerTitleCompactionCompleted",
    detail: null,
    detailKey:
      dualUsage.compactionState === "compacted" && dualUsage.usageSyncPendingAfterCompaction
        ? "composer.contextLedgerDetailCompactionPendingSync"
        : null,
    participationState: "shared",
    freshness,
    inspectionTitle:
      dualUsage.compactionState === "compacting"
        ? dualUsage.compactionSource === "auto"
          ? "Automatic compaction running"
          : "Compaction running"
        : dualUsage.compactionSource === "auto"
          ? "Automatic compaction completed"
          : "Compaction completed",
    inspectionContent:
      dualUsage.compactionState === "compacted" && dualUsage.usageSyncPendingAfterCompaction
        ? "Waiting for usage refresh"
        : null,
    estimate: {
      kind: "unknown",
      value: null,
    },
  };
}

function buildManualMemoryBlocks(input: ContextLedgerProjectionInput): ContextLedgerBlock[] {
  return [...input.selectedManualMemories]
    .sort((left, right) => {
      const timeDelta = right.updatedAt - left.updatedAt;
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return left.id.localeCompare(right.id);
    })
    .map((memory) => {
      const participationState = isPinnedManualMemory(memory.id, input)
        ? "pinned_next_send"
        : isRetainedManualMemory(memory.id, input)
          ? "carried_over"
          : "selected";
      return {
        id: `manual-memory-${memory.id}`,
        kind: "manual_memory",
        title: truncateLedgerPreview(resolveManualMemoryTitle(memory), 96),
        detail: truncateLedgerPreview(resolveManualMemoryDetail(memory) ?? "", 160) || null,
        inspectionTitle: memory.title.trim() || resolveManualMemoryTitle(memory),
        inspectionContent: memory.detail.trim() || resolveManualMemoryDetail(memory),
        sourceRef: memory.id,
        participationState,
        carryOverReason: resolveCarryOverReason(participationState),
        freshness: "fresh",
        estimate: {
          kind: "chars",
          value: estimateManualMemoryChars(memory, input.manualMemoryInjectionMode),
        },
      };
    });
}

function buildNoteCardBlocks(
  selectedNoteCards: ContextLedgerNoteCardSelection[],
  input: ContextLedgerProjectionInput,
): ContextLedgerBlock[] {
  return [...selectedNoteCards]
    .sort((left, right) => {
      const timeDelta = right.updatedAt - left.updatedAt;
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return left.id.localeCompare(right.id);
    })
    .map((noteCard) => {
      const participationState = isPinnedNoteCard(noteCard.id, input)
        ? "pinned_next_send"
        : isRetainedNoteCard(noteCard.id, input)
          ? "carried_over"
          : "selected";
      return {
        id: `note-card-${noteCard.id}`,
        kind: "note_card",
        title: truncateLedgerPreview(resolveNoteCardTitle(noteCard), 96),
        detail: truncateLedgerPreview(resolveNoteCardDetail(noteCard) ?? "", 180) || null,
        inspectionTitle: noteCard.title.trim() || resolveNoteCardTitle(noteCard),
        inspectionContent:
          noteCard.bodyMarkdown.trim()
          || noteCard.plainTextExcerpt.trim()
          || resolveNoteCardDetail(noteCard),
        sourceRef: noteCard.id,
        participationState,
        carryOverReason: resolveCarryOverReason(participationState),
        freshness: "fresh",
        estimate: {
          kind: "chars",
          value: estimateNoteCardChars(noteCard),
        },
      };
    });
}

function buildFileReferenceBlocks(
  activeFileReference: ContextLedgerProjectionInput["activeFileReference"],
  selectedInlineFileReferences: ContextLedgerInlineFileReferenceSelection[],
  selectedCodeAnnotations: CodeAnnotationSelection[] = [],
): ContextLedgerBlock[] {
  const blocks: ContextLedgerBlock[] = [];
  const seen = new Set<string>();
  if (activeFileReference?.path) {
    const normalizedPath = normalizePath(activeFileReference.path);
    const dedupeKey = toDedupeKey(normalizedPath);
    if (dedupeKey) {
      seen.add(dedupeKey);
      blocks.push({
        id: `active-file-${dedupeKey}`,
        kind: "file_reference",
        title: truncateLedgerPreview(getFileName(normalizedPath), 72),
        detail: formatLineRange(activeFileReference.lineRange)
          ? `${normalizedPath} · ${formatLineRange(activeFileReference.lineRange)}`
          : normalizedPath,
        inspectionTitle: getFileName(normalizedPath),
        inspectionContent: formatLineRange(activeFileReference.lineRange)
          ? `${normalizedPath}\n${formatLineRange(activeFileReference.lineRange)}`
          : normalizedPath,
        sourceRef: normalizedPath,
        participationState: "selected",
        freshness: "fresh",
        estimate: {
          kind: "unknown",
          value: null,
        },
      });
    }
  }
  for (const reference of selectedInlineFileReferences) {
    const normalizedPath = normalizePath(reference.path);
    const dedupeKey = toDedupeKey(normalizedPath);
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    blocks.push({
      id: `inline-file-${reference.id}`,
      kind: "file_reference",
      title: truncateLedgerPreview(getFileName(normalizedPath), 72),
      detail: normalizedPath,
      inspectionTitle: reference.label || getFileName(normalizedPath),
      inspectionContent: normalizedPath,
      sourceRef: normalizedPath,
      participationState: "selected",
      freshness: "fresh",
      estimate: {
        kind: "unknown",
        value: null,
      },
    });
  }
  for (const annotation of selectedCodeAnnotations) {
    const normalizedPath = normalizePath(annotation.path);
    const lineRange = formatLineRange(annotation.lineRange);
    const annotationDedupeKey = `${toDedupeKey(normalizedPath)}:${lineRange}:${annotation.body}`;
    if (!normalizedPath || !annotationDedupeKey) {
      continue;
    }
    blocks.push({
      id: `code-annotation-${annotation.id}`,
      kind: "file_reference",
      title: truncateLedgerPreview(getFileName(normalizedPath), 72),
      detail: lineRange
        ? `${normalizedPath} · ${lineRange} · ${truncateLedgerPreview(annotation.body, 96)}`
        : `${normalizedPath} · ${truncateLedgerPreview(annotation.body, 96)}`,
      inspectionTitle: getFileName(normalizedPath),
      inspectionContent: `${normalizedPath}\n${lineRange ?? ""}\n标注：${annotation.body}`.trim(),
      sourceRef: normalizedPath,
      participationState: "selected",
      freshness: "fresh",
      estimate: {
        kind: "chars",
        value: annotation.body.length,
      },
    });
  }
  return blocks;
}

function buildHelperBlocks(input: ContextLedgerProjectionInput): ContextLedgerBlock[] {
  return input.selectedContextChips.map((chip) => {
    const normalizedSource = normalizeManagedInstructionSource(chip.source);
    const normalizedPath = chip.path ? normalizePath(chip.path) : null;
    const sourceRef = `${chip.type}:${chip.name}`;
    const participationState = isPinnedContextChip(sourceRef, input)
      ? "pinned_next_send"
      : isRetainedContextChip(sourceRef, input)
        ? "carried_over"
        : "selected";
    const attributionKind = classifyManagedInstructionAttribution(
      normalizedSource || null,
      normalizedPath,
    );
    return {
      id: `helper-${chip.type}-${chip.name}`,
      kind: "helper_selection",
      title: chip.name,
      detail: truncateLedgerPreview(chip.description ?? "", 140) || null,
      inspectionTitle: chip.name,
      inspectionContent: chip.description ?? null,
      sourceRef,
      sourcePath: normalizedPath,
      backendSource: normalizedSource || null,
      attributionKind,
      attributionConfidence: resolveAttributionConfidence(
        attributionKind,
        normalizedSource || null,
      ),
      participationState,
      carryOverReason: resolveCarryOverReason(participationState),
      freshness: "fresh",
      estimate: {
        kind: "unknown",
        value: null,
      },
    };
  });
}

function pushGroup(groups: ContextLedgerGroup[], kind: ContextLedgerGroup["kind"], blocks: ContextLedgerBlock[]) {
  if (blocks.length === 0) {
    return;
  }
  groups.push({ kind, blocks });
}

export function buildContextLedgerProjection(
  input: ContextLedgerProjectionInput,
): ContextLedgerProjection {
  const groups: ContextLedgerGroup[] = [];
  pushGroup(groups, "recent_turns", [
    ...[buildRecentTurnsBlock(input)].filter((block): block is ContextLedgerBlock => block != null),
  ]);
  pushGroup(groups, "compaction_summary", [
    ...[buildCompactionBlock(input)].filter((block): block is ContextLedgerBlock => block != null),
  ]);
  pushGroup(groups, "manual_memory", buildManualMemoryBlocks(input));
  pushGroup(groups, "attached_resource", [
    ...buildNoteCardBlocks(input.selectedNoteCards, input),
    ...buildFileReferenceBlocks(
      input.activeFileReference,
      input.selectedInlineFileReferences,
      input.selectedCodeAnnotations ?? [],
    ),
  ]);
  pushGroup(groups, "helper_selection", buildHelperBlocks(input));

  const totalBlockCount = groups.reduce((sum, group) => sum + group.blocks.length, 0);
  const hasNonUsageContext = groups.some((group) => group.kind !== "recent_turns");
  return {
    visible: totalBlockCount > 0 && hasNonUsageContext,
    totalBlockCount,
    totalGroupCount: groups.length,
    totalUsageTokens: input.contextUsage?.total.totalTokens ?? null,
    contextWindowTokens: input.contextUsage?.modelContextWindow ?? null,
    groups,
  };
}
