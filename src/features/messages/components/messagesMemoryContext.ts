import type { ConversationItem } from "../../../types";
import { MEMORY_CONTEXT_SUMMARY_PREFIX } from "../../project-memory/utils/memoryMarkers";
import { parseProjectMemoryRetrievalPackPrefix } from "../../project-memory/utils/projectMemoryRetrievalPack";
import { isEquivalentUserObservation } from "../../threads/assembly/conversationNormalization";

export type MemoryContextSummary = {
  preview: string;
  lines: string[];
  markdown?: string;
  rawPayload?: string;
  memoryPacks?: Array<{
    source: string;
    count: number;
    cleanedContext: string;
    rawPayload: string;
  }>;
  source?: string;
  records?: Array<{
    displayIndex: string;
    index: string;
    memoryId: string;
    source: string;
    title: string;
  }>;
};

const PROJECT_MEMORY_KIND_LINE_REGEX =
  /^\[(?:已知问题|技术决策|项目上下文|对话记录|笔记|记忆)\]\s*/;
const LEGACY_MEMORY_RECORD_HINT_REGEX =
  /(?:用户输入[:：]|助手输出摘要[:：]|助手输出[:：])/;
const PROJECT_MEMORY_XML_PREFIX_REGEX =
  /^<project-memory\b[^>]*>([\s\S]*?)<\/project-memory>\s*/i;
const PARAGRAPH_BREAK_SPLIT_REGEX = /\r?\n[^\S\r\n]*\r?\n+/;
const OPTIMISTIC_USER_MESSAGE_PREFIX = "optimistic-user-";
const QUEUED_HANDOFF_MESSAGE_PREFIX = "queued-handoff-";

function normalizeMemorySummaryKeySegment(value: string) {
  return value.trim().replace(/\r\n/g, "\n").replace(/\s+/g, " ");
}

function isPendingUserBubbleId(id: string) {
  return (
    id.startsWith(OPTIMISTIC_USER_MESSAGE_PREFIX) ||
    id.startsWith(QUEUED_HANDOFF_MESSAGE_PREFIX)
  );
}

function buildMemorySummary(preview: string): MemoryContextSummary | null {
  const normalizedPreview = preview.trim();
  if (!normalizedPreview) {
    return null;
  }
  const lines = normalizedPreview
    .split(/[；\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    preview: normalizedPreview,
    lines: lines.length > 0 ? lines : [normalizedPreview],
    markdown: normalizedPreview,
  };
}

export function parseMemoryContextSummary(text: string): MemoryContextSummary | null {
  const normalized = text.trim();
  if (!normalized.startsWith(MEMORY_CONTEXT_SUMMARY_PREFIX)) {
    return null;
  }
  const preview = normalized.slice(MEMORY_CONTEXT_SUMMARY_PREFIX.length).trim();
  if (!preview) {
    return null;
  }
  const lines = preview
    .split(/[；\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    preview,
    lines: lines.length > 0 ? lines : [preview],
    markdown: preview,
  };
}

export function buildMemoryContextSummaryKey(summary: MemoryContextSummary | null) {
  if (!summary) {
    return null;
  }
  const normalizedLines = summary.lines
    .map((line) => normalizeMemorySummaryKeySegment(line))
    .filter(Boolean);
  if (normalizedLines.length === 0) {
    return null;
  }
  const previewHead = normalizedLines.slice(0, 2).join("；");
  const previewLooksTruncated =
    summary.preview.trim().endsWith("...") || normalizedLines.length > 2;
  if (!previewHead) {
    return null;
  }
  return previewLooksTruncated && !previewHead.endsWith("...")
    ? `${previewHead}...`
    : previewHead;
}

export function parseInjectedMemoryPrefixFromUser(
  text: string,
): { memorySummary: MemoryContextSummary; remainingText: string } | null {
  const normalized = text.trimStart();
  if (!normalized) {
    return null;
  }

  const packSummaries: Array<NonNullable<
    ReturnType<typeof parseProjectMemoryRetrievalPackPrefix>
  >["packSummary"]> = [];
  let remainingPackText = normalized;
  let packMatch = parseProjectMemoryRetrievalPackPrefix(remainingPackText);
  while (packMatch) {
    packSummaries.push(packMatch.packSummary);
    remainingPackText = packMatch.remainingText;
    packMatch = parseProjectMemoryRetrievalPackPrefix(remainingPackText);
  }
  if (packSummaries.length > 0) {
    const records = packSummaries.flatMap((summary) =>
      summary.records.map((record) => ({
        ...record,
        source: summary.source,
      })),
    ).map((record, index) => ({
      ...record,
      displayIndex: `#${index + 1}`,
    }));
    const recordLines = records.map((record) => {
      const sourcePrefix = packSummaries.length > 1 && record.source
        ? `${record.source}: `
        : "";
      return `${sourcePrefix}${record.displayIndex} ${record.title || record.memoryId}`.trim();
    });
    const fallbackLines = packSummaries.flatMap((summary) =>
      packSummaries.length > 1 && summary.source
        ? summary.lines.map((line) => `${summary.source}: ${line}`)
        : summary.lines,
    );
    const combinedLines = recordLines.length > 0 ? recordLines : fallbackLines;
    const preview = combinedLines.length > 0
      ? combinedLines.slice(0, 3).join("；")
      : packSummaries.map((summary) => summary.preview).filter(Boolean).join("；");
    const memorySummary = buildMemorySummary(preview);
    if (!memorySummary) {
      return null;
    }
    return {
      memorySummary: {
        ...memorySummary,
        source: packSummaries.map((summary) => summary.source).filter(Boolean).join(","),
        rawPayload: packSummaries.map((summary) => summary.rawPayload).join("\n\n"),
        memoryPacks: packSummaries.map((summary) => ({
          source: summary.source,
          count: summary.count,
          cleanedContext: summary.cleanedContext,
          rawPayload: summary.rawPayload,
        })),
        records,
        lines: combinedLines.length > 0
          ? combinedLines
          : memorySummary.lines,
      },
      remainingText: remainingPackText,
    };
  }

  const xmlMatch = normalized.match(PROJECT_MEMORY_XML_PREFIX_REGEX);
  if (xmlMatch) {
    const blockBody = (xmlMatch[1] ?? "").trim();
    const memoryLines = blockBody
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => PROJECT_MEMORY_KIND_LINE_REGEX.test(line));
    const previewText = memoryLines.length > 0 ? memoryLines.join("；") : blockBody;
    const memorySummary = buildMemorySummary(previewText);
    if (!memorySummary) {
      return null;
    }
    const remainingText = normalized.slice(xmlMatch[0].length).trimStart();
    return { memorySummary, remainingText };
  }

  if (!PROJECT_MEMORY_KIND_LINE_REGEX.test(normalized)) {
    return null;
  }
  if (!LEGACY_MEMORY_RECORD_HINT_REGEX.test(normalized)) {
    return null;
  }

  const paragraphBlocks = normalized.split(PARAGRAPH_BREAK_SPLIT_REGEX);
  if (paragraphBlocks.length >= 2) {
    const firstBlock = (paragraphBlocks[0] ?? "").trim();
    if (
      PROJECT_MEMORY_KIND_LINE_REGEX.test(firstBlock) &&
      LEGACY_MEMORY_RECORD_HINT_REGEX.test(firstBlock)
    ) {
      const memorySummary = buildMemorySummary(firstBlock);
      if (!memorySummary) {
        return null;
      }
      return {
        memorySummary,
        remainingText: paragraphBlocks.slice(1).join("\n\n").trimStart(),
      };
    }
  }

  const lines = normalized.split(/\r?\n/);
  if (lines.length >= 2) {
    const firstLine = (lines[0] ?? "").trim();
    if (
      PROJECT_MEMORY_KIND_LINE_REGEX.test(firstLine) &&
      LEGACY_MEMORY_RECORD_HINT_REGEX.test(firstLine)
    ) {
      const memorySummary = buildMemorySummary(firstLine);
      if (!memorySummary) {
        return null;
      }
      return {
        memorySummary,
        remainingText: lines.slice(1).join("\n").trimStart(),
      };
    }
  }

  return null;
}

export function buildSuppressedUserMemoryContextMessageIdSet(items: ConversationItem[]) {
  const suppressedMessageIds = new Set<string>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || item.kind !== "message" || item.role !== "user") {
      continue;
    }
    const legacyUserMemory = parseInjectedMemoryPrefixFromUser(item.text);
    const userSummaryKey = buildMemoryContextSummaryKey(
      legacyUserMemory?.memorySummary ?? null,
    );
    if (!userSummaryKey) {
      continue;
    }

    for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
      const previousItem = items[previousIndex];
      if (!previousItem || previousItem.kind !== "message") {
        continue;
      }
      if (previousItem.role === "user") {
        if (
          isPendingUserBubbleId(previousItem.id) &&
          isEquivalentUserObservation(previousItem, item)
        ) {
          continue;
        }
        break;
      }
      const assistantSummaryKey = buildMemoryContextSummaryKey(
        parseMemoryContextSummary(previousItem.text),
      );
      if (assistantSummaryKey && assistantSummaryKey === userSummaryKey) {
        suppressedMessageIds.add(item.id);
        break;
      }
    }
  }

  return suppressedMessageIds;
}
