import type { ConversationItem } from "../types";

const MAX_ITEMS_PER_THREAD = 200;
const MAX_ITEM_TEXT = 20000;
const TOOL_OUTPUT_RECENT_ITEMS = 40;
const NO_TRUNCATE_TOOL_TYPES = new Set(["fileChange", "commandExecution"]);
const READ_COMMANDS = new Set(["cat", "sed", "head", "tail", "less", "more", "nl"]);
const LIST_COMMANDS = new Set(["ls", "tree", "find", "fd"]);
const SEARCH_COMMANDS = new Set(["rg", "grep", "ripgrep", "findstr"]);
const PATH_HINT_REGEX = /[\\/]/;
const PATHLIKE_REGEX = /(\.[a-z0-9]+$)|(^\.{1,2}$)/i;
const GLOB_HINT_REGEX = /[*?[\]{}]/;
const RG_FLAGS_WITH_VALUES = new Set([
  "-g",
  "--glob",
  "--iglob",
  "-t",
  "--type",
  "--type-add",
  "--type-not",
  "-m",
  "--max-count",
  "-A",
  "-B",
  "-C",
  "--context",
  "--max-depth",
]);
const PROJECT_MEMORY_BLOCK_REGEX = /^<project-memory\b[\s\S]*?<\/project-memory>\s*/i;
const PROJECT_MEMORY_LINE_PREFIX_REGEX =
  /^\[(?:已知问题|技术决策|项目上下文|对话记录|笔记|记忆)\]\s+/;
const MAX_INJECTED_MEMORY_LINES = 12;
const MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX = /\r?\n[^\S\r\n]*\r?\n+/;
const ASSISTANT_FRAGMENT_MIN_RUN = 5;
const ASSISTANT_FRAGMENT_MAX_LENGTH = 14;
const ASSISTANT_FRAGMENT_MIN_TOTAL_CHARS = 12;
const ASSISTANT_LINE_FRAGMENT_MIN_RUN = 6;
const ASSISTANT_LINE_FRAGMENT_MAX_LENGTH = 10;
const ASSISTANT_LINE_FRAGMENT_MIN_TOTAL_CHARS = 12;
const ASSISTANT_TEXT_CACHE_MAX = 320;
const assistantNormalizedTextCache = new Map<string, string>();
const assistantReadabilityScoreCache = new Map<
  string,
  { normalized: string; score: number }
>();

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function joinReasoningFragments(parts: string[]) {
  const fragments = parts.filter((entry) => entry.length > 0);
  if (fragments.length === 0) {
    return "";
  }
  if (fragments.length === 1) {
    return fragments[0];
  }
  return fragments.slice(1).reduce((combined, fragment) => {
    const previousChar = combined[combined.length - 1] ?? "";
    const nextChar = fragment[0] ?? "";
    const shouldInsertSpace =
      /[A-Za-z0-9]/.test(previousChar) &&
      /[A-Za-z0-9]/.test(nextChar);
    return shouldInsertSpace ? `${combined} ${fragment}` : `${combined}${fragment}`;
  }, fragments[0]);
}

function extractReasoningText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return joinReasoningFragments(
      value
        .map((entry) => extractReasoningText(entry))
        .filter(Boolean),
    );
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      extractReasoningText(record.text) ||
      extractReasoningText(record.value) ||
      extractReasoningText(record.content) ||
      extractReasoningText(record.parts) ||
      extractReasoningText(record.summary) ||
      extractReasoningText(record.reasoning);
    return direct;
  }
  return "";
}

function truncateText(text: string, maxLength = MAX_ITEM_TEXT) {
  if (text.length <= maxLength) {
    return text;
  }
  const sliceLength = Math.max(0, maxLength - 3);
  return `${text.slice(0, sliceLength)}...`;
}

function compactMessageText(value: string) {
  return value.replace(/\s+/g, "");
}

function compactComparableMessageText(value: string) {
  return compactMessageText(value)
    .replace(/[！!]/g, "!")
    .replace(/[？?]/g, "?")
    .replace(/[，,]/g, ",")
    .replace(/[。．.]/g, ".");
}

function rememberCacheEntry<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
) {
  cache.set(key, value);
  if (cache.size > ASSISTANT_TEXT_CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  return value;
}

function startsWithMarkdownBlockSyntax(value: string) {
  const trimmed = value.trimStart();
  return (
    /^[-*+]\s/.test(trimmed) ||
    /^\d+\.\s/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^#{1,6}\s/.test(trimmed) ||
    /^```/.test(trimmed) ||
    /^\|/.test(trimmed)
  );
}

function shouldMergeAssistantFragment(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= ASSISTANT_FRAGMENT_MAX_LENGTH &&
    !startsWithMarkdownBlockSyntax(trimmed)
  );
}

function normalizeAssistantFragmentedParagraphs(value: string) {
  if (!MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX.test(value)) {
    return value;
  }
  const paragraphs = value.split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX);
  if (paragraphs.length < ASSISTANT_FRAGMENT_MIN_RUN) {
    return value;
  }
  let changed = false;
  const normalized: string[] = [];
  let index = 0;
  while (index < paragraphs.length) {
    const current = paragraphs[index] ?? "";
    if (!shouldMergeAssistantFragment(current)) {
      normalized.push(current);
      index += 1;
      continue;
    }
    let cursor = index;
    const run: string[] = [];
    let totalChars = 0;
    while (cursor < paragraphs.length) {
      const candidate = paragraphs[cursor] ?? "";
      if (!shouldMergeAssistantFragment(candidate)) {
        break;
      }
      const trimmed = candidate.trim();
      run.push(trimmed);
      totalChars += trimmed.length;
      cursor += 1;
    }
    if (
      run.length >= ASSISTANT_FRAGMENT_MIN_RUN &&
      totalChars >= ASSISTANT_FRAGMENT_MIN_TOTAL_CHARS
    ) {
      normalized.push(joinReasoningFragments(run));
      changed = true;
    } else {
      normalized.push(...paragraphs.slice(index, cursor));
    }
    index = cursor;
  }
  return changed ? normalized.join("\n\n") : value;
}

function shouldMergeAssistantLine(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= ASSISTANT_LINE_FRAGMENT_MAX_LENGTH &&
    !startsWithMarkdownBlockSyntax(trimmed)
  );
}

function normalizeAssistantFragmentedLines(value: string) {
  if (!value.includes("\n")) {
    return value;
  }
  const blocks = value.split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX);
  let changed = false;
  const normalizedBlocks = blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const normalizedLines: string[] = [];
    let index = 0;
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (!shouldMergeAssistantLine(current)) {
        normalizedLines.push(current);
        index += 1;
        continue;
      }
      let cursor = index;
      const run: string[] = [];
      let totalChars = 0;
      while (cursor < lines.length) {
        const candidate = lines[cursor] ?? "";
        if (!shouldMergeAssistantLine(candidate)) {
          break;
        }
        const trimmed = candidate.trim();
        run.push(trimmed);
        totalChars += trimmed.length;
        cursor += 1;
      }
      const runCompact = run.join("");
      const nonSpaceLength = runCompact.replace(/\s+/g, "").length;
      const cjkCount = (runCompact.match(/[\u4e00-\u9fff]/g) ?? []).length;
      const isCjkDominant =
        cjkCount >= Math.max(2, Math.floor(nonSpaceLength * 0.35));
      if (
        run.length >= ASSISTANT_LINE_FRAGMENT_MIN_RUN &&
        totalChars >= ASSISTANT_LINE_FRAGMENT_MIN_TOTAL_CHARS &&
        isCjkDominant
      ) {
        normalizedLines.push(joinReasoningFragments(run));
        changed = true;
      } else {
        normalizedLines.push(...lines.slice(index, cursor));
      }
      index = cursor;
    }
    return normalizedLines.join("\n");
  });
  return changed ? normalizedBlocks.join("\n\n") : value;
}

function dedupeAdjacentAssistantParagraphs(value: string) {
  const paragraphs = value
    .split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paragraphs.length <= 1) {
    return value.trim();
  }
  const deduped: string[] = [];
  for (const paragraph of paragraphs) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      compactComparableMessageText(previous) === compactComparableMessageText(paragraph) &&
      compactComparableMessageText(paragraph).length >= 6
    ) {
      continue;
    }
    deduped.push(paragraph);
  }
  return deduped.join("\n\n");
}

function collapseRepeatedAssistantParagraphBlocks(value: string) {
  const paragraphs = value
    .split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) {
    return value;
  }
  for (const repeatCount of [3, 2]) {
    if (paragraphs.length % repeatCount !== 0) {
      continue;
    }
    const blockLength = paragraphs.length / repeatCount;
    if (blockLength < 1) {
      continue;
    }
    const firstBlock = paragraphs
      .slice(0, blockLength)
      .map((entry) => compactComparableMessageText(entry));
    if (!firstBlock.some((entry) => entry.length >= 6)) {
      continue;
    }
    let matches = true;
    for (let blockIndex = 1; blockIndex < repeatCount; blockIndex += 1) {
      const start = blockIndex * blockLength;
      const candidate = paragraphs
        .slice(start, start + blockLength)
        .map((entry) => compactComparableMessageText(entry));
      if (
        candidate.length !== firstBlock.length ||
        candidate.some((entry, index) => entry !== firstBlock[index])
      ) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return paragraphs.slice(0, blockLength).join("\n\n");
    }
  }
  return value;
}

function collapseRepeatedAssistantFullText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const directRepeat = trimmed.match(/^([\s\S]{6,}?)(?:\s+\1){1,2}$/);
  if (directRepeat?.[1]) {
    return directRepeat[1].trim();
  }
  const compact = compactMessageText(trimmed);
  for (const repeatCount of [3, 2]) {
    if (compact.length < 12 || compact.length % repeatCount !== 0) {
      continue;
    }
    const chunkLength = compact.length / repeatCount;
    const chunk = compact.slice(0, chunkLength);
    if (chunk.length < 6 || chunk.repeat(repeatCount) !== compact) {
      continue;
    }
    let nonSpaceCount = 0;
    for (let index = 0; index < trimmed.length; index += 1) {
      if (!/\s/.test(trimmed[index])) {
        nonSpaceCount += 1;
      }
      if (nonSpaceCount >= chunkLength) {
        return trimmed.slice(0, index + 1).trim();
      }
    }
  }
  return trimmed;
}

function sharedComparablePrefixLength(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function sharedComparableSuffixLength(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (
    index < max &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

function isNearDuplicateAssistantSentence(left: string, right: string) {
  const leftCompact = compactComparableMessageText(left.trim());
  const rightCompact = compactComparableMessageText(right.trim());
  if (!leftCompact || !rightCompact) {
    return false;
  }
  if (leftCompact === rightCompact) {
    return true;
  }
  if (leftCompact.length < 6 || rightCompact.length < 6) {
    return false;
  }
  if (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)) {
    return true;
  }
  const minLength = Math.min(leftCompact.length, rightCompact.length);
  const sharedPrefix = sharedComparablePrefixLength(leftCompact, rightCompact);
  if (sharedPrefix >= Math.floor(minLength * 0.72)) {
    return true;
  }
  const sharedSuffix = sharedComparableSuffixLength(leftCompact, rightCompact);
  if (sharedSuffix >= Math.floor(minLength * 0.72)) {
    return true;
  }
  return sharedPrefix + sharedSuffix >= Math.floor(minLength * 0.92);
}

function scoreAssistantSentenceBlock(sentences: string[]) {
  const joined = sentences.join("").trim();
  const compactLength = compactMessageText(joined).length;
  const punctuationCount = (joined.match(/[。！？!?]/g) ?? []).length;
  const lineBreakPenalty = (joined.match(/\r?\n/g) ?? []).length;
  return compactLength + punctuationCount * 2 - lineBreakPenalty;
}

function collapseNearDuplicateAssistantSentenceBlocks(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /```/.test(trimmed) || hasRichAssistantMarkdownStructure(trimmed)) {
    return value;
  }
  const sentenceMatches = trimmed.match(/[^。！？!?]+[。！？!?]?/g);
  if (!sentenceMatches || sentenceMatches.length < 4) {
    return value;
  }
  for (const repeatCount of [3, 2]) {
    if (sentenceMatches.length % repeatCount !== 0) {
      continue;
    }
    const blockLength = sentenceMatches.length / repeatCount;
    if (blockLength < 1) {
      continue;
    }
    const blocks = Array.from({ length: repeatCount }, (_, blockIndex) =>
      sentenceMatches.slice(blockIndex * blockLength, (blockIndex + 1) * blockLength),
    );
    const baseBlock = blocks[0] ?? [];
    if (baseBlock.length === 0) {
      continue;
    }
    let comparablePairs = 0;
    let hasStrongPair = false;
    let matches = true;
    for (let blockIndex = 1; blockIndex < blocks.length; blockIndex += 1) {
      const candidateBlock = blocks[blockIndex] ?? [];
      if (candidateBlock.length !== baseBlock.length) {
        matches = false;
        break;
      }
      for (let sentenceIndex = 0; sentenceIndex < baseBlock.length; sentenceIndex += 1) {
        const left = baseBlock[sentenceIndex] ?? "";
        const right = candidateBlock[sentenceIndex] ?? "";
        if (!isNearDuplicateAssistantSentence(left, right)) {
          matches = false;
          break;
        }
        const pairLength = Math.max(
          compactMessageText(left).length,
          compactMessageText(right).length,
        );
        if (pairLength >= 8) {
          comparablePairs += 1;
          hasStrongPair = true;
        }
      }
      if (!matches) {
        break;
      }
    }
    if (!matches || !hasStrongPair || comparablePairs < Math.max(1, blockLength - 1)) {
      continue;
    }
    let selectedIndex = 0;
    let selectedScore = Number.NEGATIVE_INFINITY;
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const score = scoreAssistantSentenceBlock(blocks[blockIndex] ?? []);
      if (score > selectedScore || (score === selectedScore && blockIndex > selectedIndex)) {
        selectedScore = score;
        selectedIndex = blockIndex;
      }
    }
    return (blocks[selectedIndex] ?? []).join("").trim();
  }
  return value;
}

function dedupeRepeatedAssistantSentences(value: string) {
  const dedupeSentences = (paragraph: string) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      return trimmed;
    }
    const sentences = trimmed.match(/[^。！？!?]+[。！？!?]/g);
    if (!sentences || sentences.length < 2) {
      return trimmed;
    }
    let collapsedSentences = sentences.map((sentence) => sentence.trim());
    for (const repeatCount of [3, 2]) {
      if (collapsedSentences.length % repeatCount !== 0) {
        continue;
      }
      const blockLength = collapsedSentences.length / repeatCount;
      if (blockLength < 1) {
        continue;
      }
      const firstBlock = collapsedSentences
        .slice(0, blockLength)
        .map((entry) => compactComparableMessageText(entry));
      if (!firstBlock.some((entry) => entry.length >= 6)) {
        continue;
      }
      let matches = true;
      for (let blockIndex = 1; blockIndex < repeatCount; blockIndex += 1) {
        const start = blockIndex * blockLength;
        const candidate = collapsedSentences
          .slice(start, start + blockLength)
          .map((entry) => compactComparableMessageText(entry));
        if (
          candidate.length !== firstBlock.length ||
          candidate.some((entry, index) => entry !== firstBlock[index])
        ) {
          matches = false;
          break;
        }
      }
      if (matches) {
        collapsedSentences = collapsedSentences.slice(0, blockLength);
        break;
      }
    }

    const deduped: string[] = [];
    for (const sentence of collapsedSentences) {
      const current = sentence.trim();
      const previous = deduped[deduped.length - 1];
      if (
        previous &&
        compactComparableMessageText(previous) === compactComparableMessageText(current) &&
        compactComparableMessageText(current).length >= 6
      ) {
        continue;
      }
      deduped.push(current);
    }
    const consumed = sentences.join("");
    const remainder = trimmed.slice(consumed.length);
    return `${deduped.join("")}${remainder}`.trim();
  };

  if (!MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX.test(value)) {
    return dedupeSentences(value);
  }
  return value
    .split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX)
    .map((entry) => dedupeSentences(entry))
    .filter(Boolean)
    .join("\n\n");
}

function normalizeAssistantMessageText(text: string) {
  if (!text) {
    return text;
  }
  let normalized = text;
  normalized = collapseRepeatedAssistantParagraphBlocks(normalized);
  normalized = collapseRepeatedAssistantFullText(normalized);
  if (isLikelyFragmentedAssistantText(normalized)) {
    normalized = normalizeAssistantFragmentedParagraphs(normalized);
    normalized = normalizeAssistantFragmentedLines(normalized);
  }
  normalized = dedupeRepeatedAssistantSentences(normalized);
  normalized = collapseNearDuplicateAssistantSentenceBlocks(normalized);
  normalized = dedupeAdjacentAssistantParagraphs(normalized);
  normalized = collapseRepeatedAssistantParagraphBlocks(normalized);
  normalized = collapseRepeatedAssistantFullText(normalized);
  return normalized.trim();
}

function hasRepeatedAssistantTextPattern(text: string) {
  if (!text) {
    return false;
  }
  const compact = compactComparableMessageText(text);
  if (compact.length < 24) {
    return false;
  }
  for (const repeatCount of [3, 2]) {
    if (compact.length % repeatCount !== 0) {
      continue;
    }
    const chunkLength = compact.length / repeatCount;
    const chunk = compact.slice(0, chunkLength);
    if (chunk.length >= 6 && chunk.repeat(repeatCount) === compact) {
      return true;
    }
  }
  const anchorLength = Math.max(6, Math.floor(compact.length / 4));
  const anchor = compact.slice(0, anchorLength);
  return anchor.length >= 6 && compact.indexOf(anchor, anchor.length) >= 0;
}

function hasDenseMarkdownStructure(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 4) {
    return false;
  }
  const markdownStructureLines = lines.filter((line) => {
    const trimmed = line.trimStart();
    return (
      /^[-*+]\s/.test(trimmed) ||
      /^\d+\.\s/.test(trimmed) ||
      /^>\s?/.test(trimmed) ||
      /^#{1,6}\s/.test(trimmed) ||
      /^\|/.test(trimmed)
    );
  }).length;
  if (markdownStructureLines >= 3) {
    return true;
  }
  const fenceCount = (text.match(/```|~~~/g) ?? []).length;
  return fenceCount >= 2;
}

function hasRichAssistantMarkdownStructure(text: string) {
  if (!text.includes("\n")) {
    return false;
  }
  if (hasDenseMarkdownStructure(text)) {
    return true;
  }
  const lines = text.split(/\r?\n/);
  let tableSeparatorCount = 0;
  let indentedCodeCount = 0;
  for (const line of lines) {
    if (
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
    ) {
      tableSeparatorCount += 1;
    }
    if (/^( {4}|\t)\S+/.test(line)) {
      indentedCodeCount += 1;
    }
    if (tableSeparatorCount >= 1 || indentedCodeCount >= 3) {
      return true;
    }
  }
  return false;
}

function isLikelyFragmentedAssistantText(text: string) {
  if (!text.includes("\n") || hasRichAssistantMarkdownStructure(text)) {
    return false;
  }
  const paragraphs = text
    .split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paragraphs.length >= ASSISTANT_FRAGMENT_MIN_RUN) {
    const shortParagraphs = paragraphs.filter(
      (entry) =>
        entry.length > 0 &&
        entry.length <= ASSISTANT_FRAGMENT_MAX_LENGTH &&
        !startsWithMarkdownBlockSyntax(entry),
    ).length;
    if (shortParagraphs >= ASSISTANT_FRAGMENT_MIN_RUN && shortParagraphs / paragraphs.length >= 0.6) {
      return true;
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (lines.length >= ASSISTANT_LINE_FRAGMENT_MIN_RUN) {
    const shortLines = lines.filter(
      (entry) =>
        entry.length > 0 &&
        entry.length <= ASSISTANT_LINE_FRAGMENT_MAX_LENGTH &&
        !startsWithMarkdownBlockSyntax(entry),
    );
    if (shortLines.length >= ASSISTANT_LINE_FRAGMENT_MIN_RUN) {
      const cjkChars = (shortLines.join("").match(/[\u4e00-\u9fff]/g) ?? []).length;
      const totalChars = shortLines.join("").replace(/\s+/g, "").length;
      if (totalChars >= ASSISTANT_LINE_FRAGMENT_MIN_TOTAL_CHARS && cjkChars >= Math.max(2, Math.floor(totalChars * 0.35))) {
        return true;
      }
    }
  }
  return false;
}

function shouldNormalizeAssistantText(text: string) {
  if (!text) {
    return false;
  }
  const hasRepeatedPattern = hasRepeatedAssistantTextPattern(text);
  if (hasRepeatedPattern) {
    return true;
  }
  const collapsedNearDuplicate = collapseNearDuplicateAssistantSentenceBlocks(text);
  if (collapsedNearDuplicate.trim() !== text.trim()) {
    return true;
  }
  if (hasRichAssistantMarkdownStructure(text)) {
    return false;
  }
  return isLikelyFragmentedAssistantText(text);
}

function getNormalizedAssistantMessageText(text: string) {
  const cached = assistantNormalizedTextCache.get(text);
  if (cached !== undefined) {
    return cached;
  }
  const normalized = normalizeAssistantMessageText(text);
  return rememberCacheEntry(assistantNormalizedTextCache, text, normalized);
}

function scoreAssistantMessageReadability(text: string) {
  const cached = assistantReadabilityScoreCache.get(text);
  if (cached) {
    return cached;
  }
  const normalized = shouldNormalizeAssistantText(text)
    ? getNormalizedAssistantMessageText(text)
    : text;
  const paragraphs = normalized
    .split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const shortParagraphCount = paragraphs.filter((entry) => entry.length <= 8).length;
  const compactOriginal = compactMessageText(text);
  const compactNormalized = compactMessageText(normalized);
  let score = shortParagraphCount * 3 + paragraphs.length;
  if (
    compactOriginal.length > compactNormalized.length &&
    compactNormalized.length >= 6
  ) {
    score += Math.min(12, Math.floor((compactOriginal.length - compactNormalized.length) / 3));
  }
  return rememberCacheEntry(assistantReadabilityScoreCache, text, { normalized, score });
}

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

function formatCollabAgentStates(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([id, state]) => {
      const status = asString(
        (state as Record<string, unknown>)?.status ?? state ?? "",
      );
      return status ? `${id}: ${status}` : id;
    })
    .filter(Boolean);
  if (entries.length === 0) {
    return "";
  }
  return entries.join("\n");
}

export function normalizeItem(item: ConversationItem): ConversationItem {
  if (item.kind === "message") {
    const normalizedText =
      item.role === "assistant"
        ? shouldNormalizeAssistantText(item.text)
          ? getNormalizedAssistantMessageText(item.text)
          : item.text
        : item.text;
    return { ...item, text: truncateText(normalizedText) };
  }
  if (item.kind === "explore") {
    return item;
  }
  if (item.kind === "reasoning") {
    return {
      ...item,
      summary: truncateText(item.summary),
      content: truncateText(item.content),
    };
  }
  if (item.kind === "diff") {
    return { ...item, diff: truncateText(item.diff) };
  }
  if (item.kind === "tool") {
    const isNoTruncateTool = NO_TRUNCATE_TOOL_TYPES.has(item.toolType);
    return {
      ...item,
      title: truncateText(item.title, 200),
      detail: truncateText(item.detail, 2000),
      output: isNoTruncateTool
        ? item.output
        : item.output
          ? truncateText(item.output)
          : item.output,
      changes: item.changes
        ? item.changes.map((change) => ({
            ...change,
            diff:
              isNoTruncateTool || !change.diff
                ? change.diff
                : truncateText(change.diff),
          }))
        : item.changes,
    };
  }
  return item;
}

function cleanCommandText(commandText: string) {
  if (!commandText) {
    return "";
  }
  const trimmed = commandText.trim();
  const shellMatch = trimmed.match(
    /^(?:\/\S+\/)?(?:bash|zsh|sh|fish)(?:\.exe)?\s+-lc\s+(?:(['"])([\s\S]+)\1|([\s\S]+))$/,
  );
  const inner = shellMatch ? (shellMatch[2] ?? shellMatch[3] ?? "") : trimmed;
  const cdMatch = inner.match(
    /^\s*cd\s+[^&;]+(?:\s*&&\s*|\s*;\s*)([\s\S]+)$/i,
  );
  const stripped = cdMatch ? cdMatch[1] : inner;
  return stripped.trim();
}

function tokenizeCommand(command: string) {
  const tokens: string[] = [];
  const regex = /"([^"]*)"|'([^']*)'|`([^`]*)`|(\S+)/g;
  let match: RegExpExecArray | null = regex.exec(command);
  while (match) {
    const [, doubleQuoted, singleQuoted, backticked, bare] = match;
    const value = doubleQuoted ?? singleQuoted ?? backticked ?? bare ?? "";
    if (value) {
      tokens.push(value);
    }
    match = regex.exec(command);
  }
  return tokens;
}

function splitCommandSegments(command: string) {
  return command
    .split(/\s*(?:&&|;)\s*/g)
    .map((segment) => trimAtPipe(segment))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function trimAtPipe(command: string) {
  if (!command) {
    return "";
  }
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char !== "|" || inSingle || inDouble) {
      continue;
    }
    const prev = index > 0 ? command[index - 1] : "";
    const next = index + 1 < command.length ? command[index + 1] : "";
    const prevIsSpace = prev === "" || /\s/.test(prev);
    const nextIsSpace = next === "" || /\s/.test(next);
    if (!prevIsSpace || !nextIsSpace) {
      continue;
    }
    return command.slice(0, index).trim();
  }
  return command.trim();
}

function isOptionToken(token: string) {
  return token.startsWith("-");
}

function isPathLike(token: string) {
  if (!token || isOptionToken(token)) {
    return false;
  }
  if (GLOB_HINT_REGEX.test(token)) {
    return false;
  }
  return PATH_HINT_REGEX.test(token) || PATHLIKE_REGEX.test(token);
}

function collectNonFlagOperands(tokens: string[], commandName: string) {
  const operands: string[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (isOptionToken(token)) {
      if (commandName === "rg" && RG_FLAGS_WITH_VALUES.has(token)) {
        index += 1;
      }
      continue;
    }
    operands.push(token);
  }
  return operands;
}

function findPathTokens(tokens: string[]) {
  const commandName = tokens[0]?.toLowerCase() ?? "";
  const positional = collectNonFlagOperands(tokens, commandName);
  const pathLike = positional.filter(isPathLike);
  return pathLike.length > 0 ? pathLike : positional;
}

function normalizeCommandStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  return /(pending|running|processing|started|in[_ -]?progress|inprogress)/.test(
    normalized,
  )
    ? "exploring"
    : "explored";
}

function isFailedStatus(status?: string) {
  const normalized = (status ?? "").toLowerCase();
  return /(fail|error)/.test(normalized);
}

type ExploreEntry = Extract<ConversationItem, { kind: "explore" }>["entries"][number];
type ExploreItem = Extract<ConversationItem, { kind: "explore" }>;

function parseSearch(tokens: string[]): ExploreEntry | null {
  const commandName = tokens[0]?.toLowerCase() ?? "";
  const hasFilesFlag = tokens.some((token) => token === "--files");
  if (tokens[0] === "rg" && hasFilesFlag) {
    const paths = findPathTokens(tokens);
    const path = paths[paths.length - 1] || "rg --files";
    return { kind: "list", label: path };
  }
  const positional = collectNonFlagOperands(tokens, commandName);
  if (positional.length === 0) {
    return null;
  }
  const query = positional[0];
  const rawPath = positional.length > 1 ? positional[1] : "";
  const path =
    commandName === "rg" ? rawPath : rawPath && isPathLike(rawPath) ? rawPath : "";
  const label = path ? `${query} in ${path}` : query;
  return { kind: "search", label };
}

function parseRead(tokens: string[]): ExploreEntry[] | null {
  const paths = findPathTokens(tokens).filter(Boolean);
  if (paths.length === 0) {
    return null;
  }
  const entries = paths.map((path) => {
    const name = path.split(/[\\/]/g).filter(Boolean).pop() ?? path;
    return name && name !== path
      ? ({ kind: "read", label: name, detail: path } satisfies ExploreEntry)
      : ({ kind: "read", label: path } satisfies ExploreEntry);
  });
  const seen = new Set<string>();
  const deduped: ExploreEntry[] = [];
  for (const entry of entries) {
    const key = entry.detail ? `${entry.label}|${entry.detail}` : entry.label;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function parseList(tokens: string[]): ExploreEntry {
  const paths = findPathTokens(tokens);
  const path = paths[paths.length - 1];
  return { kind: "list", label: path || tokens[0] };
}

function parseCommandSegment(command: string): ExploreEntry[] | null {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    return null;
  }
  const commandName = tokens[0].toLowerCase();
  if (READ_COMMANDS.has(commandName)) {
    return parseRead(tokens);
  }
  if (LIST_COMMANDS.has(commandName)) {
    return [parseList(tokens)];
  }
  if (SEARCH_COMMANDS.has(commandName)) {
    const entry = parseSearch(tokens);
    return entry ? [entry] : null;
  }
  return null;
}

function coalesceReadEntries(entries: ExploreEntry[]) {
  const result: ExploreEntry[] = [];
  const seenReads = new Set<string>();

  for (const entry of entries) {
    if (entry.kind !== "read") {
      result.push(entry);
      continue;
    }
    const key = entry.detail ? `${entry.label}|${entry.detail}` : entry.label;
    if (seenReads.has(key)) {
      continue;
    }
    seenReads.add(key);
    result.push(entry);
  }
  return result;
}

function mergeExploreEntries(base: ExploreEntry[], next: ExploreEntry[]) {
  const merged = [...base, ...next];
  const seen = new Set<string>();
  const deduped: ExploreEntry[] = [];
  for (const entry of merged) {
    const key = `${entry.kind}|${entry.label}|${entry.detail ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function summarizeCommandExecution(item: Extract<ConversationItem, { kind: "tool" }>) {
  if (isFailedStatus(item.status)) {
    return null;
  }
  const rawCommand = item.title.replace(/^Command:\s*/i, "").trim();
  const cleaned = cleanCommandText(rawCommand);
  if (!cleaned) {
    return null;
  }
  const segments = splitCommandSegments(cleaned);
  if (segments.length === 0) {
    return null;
  }
  const entries: ExploreEntry[] = [];
  for (const segment of segments) {
    const parsed = parseCommandSegment(segment);
    if (!parsed) {
      return null;
    }
    entries.push(...parsed);
  }
  if (entries.length === 0) {
    return null;
  }
  const coalescedEntries = coalesceReadEntries(entries);
  const status: ExploreItem["status"] = normalizeCommandStatus(item.status);
  const summary: ExploreItem = {
    id: item.id,
    kind: "explore",
    status,
    entries: coalescedEntries,
  };
  return summary;
}

function summarizeExploration(items: ConversationItem[]) {
  const result: ConversationItem[] = [];

  for (const item of items) {
    if (item.kind === "explore") {
      const last = result[result.length - 1];
      if (last?.kind === "explore" && last.status === item.status) {
        result[result.length - 1] = {
          ...last,
          entries: mergeExploreEntries(last.entries, item.entries),
        };
        continue;
      }
      result.push(item);
      continue;
    }
    if (item.kind === "tool" && item.toolType === "commandExecution") {
      const summary = summarizeCommandExecution(item);
      if (!summary) {
        result.push(item);
        continue;
      }
      const last = result[result.length - 1];
      if (last?.kind === "explore" && last.status === summary.status) {
        result[result.length - 1] = {
          ...last,
          entries: mergeExploreEntries(last.entries, summary.entries),
        };
        continue;
      }
      result.push(summary);
      continue;
    }
    result.push(item);
  }
  return result;
}

function mergeToolItemPreservingSnapshot(
  existing: Extract<ConversationItem, { kind: "tool" }>,
  incoming: Extract<ConversationItem, { kind: "tool" }>,
): Extract<ConversationItem, { kind: "tool" }> {
  const hasTitle = incoming.title.trim().length > 0;
  const hasDetail = incoming.detail.trim().length > 0;
  const hasOutput =
    typeof incoming.output === "string" && incoming.output.trim().length > 0;
  const hasChanges = Array.isArray(incoming.changes) && incoming.changes.length > 0;
  return {
    ...existing,
    ...incoming,
    title: hasTitle ? incoming.title : existing.title,
    detail: hasDetail ? incoming.detail : existing.detail,
    output: hasOutput ? incoming.output : existing.output,
    changes: hasChanges ? incoming.changes : existing.changes,
  };
}

function mergeSameKindItem(existing: ConversationItem, incoming: ConversationItem) {
  if (existing.kind === "tool" && incoming.kind === "tool") {
    return mergeToolItemPreservingSnapshot(existing, incoming);
  }
  return { ...existing, ...incoming };
}

export function prepareThreadItems(items: ConversationItem[]) {
  const coalesced: ConversationItem[] = [];
  const coalescedIndexByKey = new Map<string, number>();
  for (const rawItem of items) {
    const item = normalizeItem(rawItem);
    const key = `${item.kind}\u0000${item.id}`;
    const index = coalescedIndexByKey.get(key);
    if (index === undefined) {
      coalescedIndexByKey.set(key, coalesced.length);
      coalesced.push(item);
      continue;
    }
    coalesced[index] = mergeSameKindItem(coalesced[index], item);
  }
  const filtered: ConversationItem[] = [];
  for (const item of coalesced) {
    const last = filtered[filtered.length - 1];
    if (
      item.kind === "message" &&
      item.role === "assistant" &&
      last?.kind === "review" &&
      last.state === "completed" &&
      item.text.trim() === last.text.trim()
    ) {
      continue;
    }
    filtered.push(item);
  }
  const limited =
    filtered.length > MAX_ITEMS_PER_THREAD
      ? filtered.slice(-MAX_ITEMS_PER_THREAD)
      : filtered;
  const summarized = summarizeExploration(limited);
  const cutoff = Math.max(0, summarized.length - TOOL_OUTPUT_RECENT_ITEMS);
  return summarized.map((item, index) => {
    if (index >= cutoff || item.kind !== "tool") {
      return item;
    }
    const output = item.output ? truncateText(item.output) : item.output;
    const changes = item.changes
      ? item.changes.map((change) => ({
          ...change,
          diff: change.diff ? truncateText(change.diff) : change.diff,
        }))
      : item.changes;
    if (output === item.output && changes === item.changes) {
      return item;
    }
    return { ...item, output, changes };
  });
}

export function upsertItem(list: ConversationItem[], item: ConversationItem) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) {
    return [...list, item];
  }
  const next = [...list];
  next[index] = mergeSameKindItem(next[index], item);
  return next;
}

export function getThreadTimestamp(thread: Record<string, unknown>) {
  const raw =
    (thread.updatedAt ?? thread.updated_at ?? thread.createdAt ?? thread.created_at) ??
    0;
  let numeric: number;
  if (typeof raw === "string") {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) {
      numeric = asNumber;
    } else {
      const parsed = Date.parse(raw);
      if (!Number.isFinite(parsed)) {
        return 0;
      }
      numeric = parsed;
    }
  } else {
    numeric = Number(raw);
  }
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
}

export function previewThreadName(text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed;
}

export function buildConversationItem(
  item: Record<string, unknown>,
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "agentMessage") {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const { text, images } = parseUserInputs(content);
    return {
      id,
      kind: "message",
      role: "user",
      text,
      images: images.length > 0 ? images : undefined,
    };
  }
  if (type === "reasoning") {
    const summary = extractReasoningText(item.summary ?? "");
    const contentFromItem = extractReasoningText(item.content ?? "");
    const content = contentFromItem || asString(item.text ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  if (type === "commandExecution") {
    const command = Array.isArray(item.command)
      ? item.command.map((part) => asString(part)).join(" ")
      : asString(item.command ?? "");
    const durationMs = asNumber(item.durationMs ?? item.duration_ms);
    return {
      id,
      kind: "tool",
      toolType: type,
      title: command ? `Command: ${command}` : "Command",
      detail: asString(item.cwd ?? ""),
      status: asString(item.status ?? ""),
      output: asString(item.aggregatedOutput ?? ""),
      durationMs,
    };
  }
  if (type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const normalizedChanges = changes
      .map((change) => {
        const path = asString(change?.path ?? "");
        const kind = change?.kind as Record<string, unknown> | string | undefined;
        const kindType =
          typeof kind === "string"
            ? kind
            : typeof kind === "object" && kind
              ? asString((kind as Record<string, unknown>).type ?? "")
              : "";
        const normalizedKind = kindType ? kindType.toLowerCase() : "";
        const diff = asString(change?.diff ?? "");
        return { path, kind: normalizedKind || undefined, diff: diff || undefined };
      })
      .filter((change) => change.path);
    const formattedChanges = normalizedChanges
      .map((change) => {
        const prefix =
          change.kind === "add"
            ? "A"
            : change.kind === "delete"
              ? "D"
              : change.kind
                ? "M"
                : "";
        return [prefix, change.path].filter(Boolean).join(" ");
      })
      .filter(Boolean);
    const paths = formattedChanges.join(", ");
    const diffOutput = normalizedChanges
      .map((change) => change.diff ?? "")
      .filter(Boolean)
      .join("\n\n");
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "File changes",
      detail: paths || "Pending changes",
      status: asString(item.status ?? ""),
      output: diffOutput,
      changes: normalizedChanges,
    };
  }
  if (type === "mcpToolCall") {
    const server = asString(item.server ?? "");
    const tool = asString(item.tool ?? "");
    const args = item.arguments ? JSON.stringify(item.arguments, null, 2) : "";
    return {
      id,
      kind: "tool",
      toolType: type,
      title: `Tool: ${server}${tool ? ` / ${tool}` : ""}`,
      detail: args,
      status: asString(item.status ?? ""),
      output: asString(item.result ?? item.error ?? ""),
    };
  }
  if (type === "collabToolCall" || type === "collabAgentToolCall") {
    const tool = asString(item.tool ?? "");
    const status = asString(item.status ?? "");
    const sender = asString(item.senderThreadId ?? item.sender_thread_id ?? "");
    const receivers = [
      ...normalizeStringList(item.receiverThreadId ?? item.receiver_thread_id),
      ...normalizeStringList(item.receiverThreadIds ?? item.receiver_thread_ids),
      ...normalizeStringList(item.newThreadId ?? item.new_thread_id),
    ];
    const prompt = asString(item.prompt ?? "");
    const agentsState = formatCollabAgentStates(
      item.agentStatus ?? item.agentsStates ?? item.agents_states,
    );
    const detailParts = [sender ? `From ${sender}` : ""]
      .concat(receivers.length > 0 ? `→ ${receivers.join(", ")}` : "")
      .filter(Boolean);
    const outputParts = [prompt, agentsState].filter(Boolean);
    return {
      id,
      kind: "tool",
      toolType: "collabToolCall",
      title: tool ? `Collab: ${tool}` : "Collab tool call",
      detail: detailParts.join(" "),
      status,
      output: outputParts.join("\n\n"),
    };
  }
  if (type === "webSearch") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Web search",
      detail: asString(item.query ?? ""),
      status: "",
      output: "",
    };
  }
  if (type === "imageView") {
    return {
      id,
      kind: "tool",
      toolType: type,
      title: "Image view",
      detail: asString(item.path ?? ""),
      status: "",
      output: "",
    };
  }
  if (type === "enteredReviewMode" || type === "exitedReviewMode") {
    return {
      id,
      kind: "review",
      state: type === "enteredReviewMode" ? "started" : "completed",
      text: asString(item.review ?? ""),
    };
  }
  return null;
}

function extractImageInputValue(input: Record<string, unknown>) {
  const value =
    asString(input.url ?? "") ||
    asString(input.path ?? "") ||
    asString(input.value ?? "") ||
    asString(input.data ?? "") ||
    asString(input.source ?? "");
  return value.trim();
}

function stripInjectedProjectMemoryBlock(text: string) {
  if (!text) {
    return "";
  }
  let normalized = text.trimStart();
  while (PROJECT_MEMORY_BLOCK_REGEX.test(normalized)) {
    normalized = normalized.replace(PROJECT_MEMORY_BLOCK_REGEX, "").trimStart();
  }

  const blocks = normalized.split(MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX);
  if (blocks.length >= 2) {
    const firstBlock = blocks[0] ?? "";
    const firstBlockLines = firstBlock
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const looksLikeInjectedMemoryLines =
      firstBlockLines.length > 0 &&
      firstBlockLines.length <= MAX_INJECTED_MEMORY_LINES &&
      firstBlockLines.every((line) => PROJECT_MEMORY_LINE_PREFIX_REGEX.test(line));
    if (looksLikeInjectedMemoryLines) {
      normalized = blocks.slice(1).join("\n\n").trimStart();
    }
  }
  return normalized.trim();
}

function parseUserInputs(inputs: Array<Record<string, unknown>>) {
  const textParts: string[] = [];
  const images: string[] = [];
  inputs.forEach((input) => {
    const type = asString(input.type);
    if (type === "text") {
      const text = asString(input.text);
      if (text) {
        textParts.push(stripInjectedProjectMemoryBlock(text));
      }
      return;
    }
    if (type === "skill") {
      const name = asString(input.name);
      if (name) {
        textParts.push(`$${name}`);
      }
      return;
    }
    if (type === "image" || type === "localImage") {
      const value = extractImageInputValue(input);
      if (value) {
        images.push(value);
      }
    }
  });
  return { text: textParts.join(" ").trim(), images };
}

export function buildConversationItemFromThreadItem(
  item: Record<string, unknown>,
): ConversationItem | null {
  const type = asString(item.type);
  const id = asString(item.id);
  if (!id || !type) {
    return null;
  }
  if (type === "userMessage") {
    const content = Array.isArray(item.content) ? item.content : [];
    const { text, images } = parseUserInputs(content);
    return {
      id,
      kind: "message",
      role: "user",
      text,
      images: images.length > 0 ? images : undefined,
    };
  }
  if (type === "agentMessage") {
    return {
      id,
      kind: "message",
      role: "assistant",
      text: asString(item.text),
    };
  }
  if (type === "reasoning") {
    const summary = extractReasoningText(item.summary ?? "");
    const contentFromItem = extractReasoningText(item.content ?? "");
    const content = contentFromItem || asString(item.text ?? "");
    return { id, kind: "reasoning", summary, content };
  }
  return buildConversationItem(item);
}

export function buildItemsFromThread(thread: Record<string, unknown>) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const items: ConversationItem[] = [];
  turns.forEach((turn) => {
    const turnRecord = turn as Record<string, unknown>;
    const turnItems = Array.isArray(turnRecord.items)
      ? (turnRecord.items as Record<string, unknown>[])
      : [];
    turnItems.forEach((item) => {
      const converted = buildConversationItemFromThreadItem(item);
      if (converted) {
        items.push(converted);
      }
    });
  });
  return items;
}

export function isReviewingFromThread(thread: Record<string, unknown>) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  let reviewing = false;
  turns.forEach((turn) => {
    const turnRecord = turn as Record<string, unknown>;
    const turnItems = Array.isArray(turnRecord.items)
      ? (turnRecord.items as Record<string, unknown>[])
      : [];
    turnItems.forEach((item) => {
      const type = asString(item?.type ?? "");
      if (type === "enteredReviewMode") {
        reviewing = true;
      } else if (type === "exitedReviewMode") {
        reviewing = false;
      }
    });
  });
  return reviewing;
}

function chooseRicherItem(remote: ConversationItem, local: ConversationItem) {
  if (remote.kind !== local.kind) {
    return remote;
  }
  if (remote.kind === "message" && local.kind === "message") {
    if (remote.role !== local.role) {
      return remote;
    }
    if (remote.role !== "assistant") {
      return local.text.length > remote.text.length ? local : remote;
    }
    const remoteScored = scoreAssistantMessageReadability(remote.text);
    const localScored = scoreAssistantMessageReadability(local.text);
    if (localScored.score < remoteScored.score) {
      return { ...local, text: localScored.normalized };
    }
    if (remoteScored.score < localScored.score) {
      return { ...remote, text: remoteScored.normalized };
    }
    if (
      compactMessageText(remoteScored.normalized) ===
      compactMessageText(localScored.normalized)
    ) {
      return localScored.normalized.length >= remoteScored.normalized.length
        ? { ...local, text: localScored.normalized }
        : { ...remote, text: remoteScored.normalized };
    }
    return localScored.normalized.length > remoteScored.normalized.length
      ? { ...local, text: localScored.normalized }
      : { ...remote, text: remoteScored.normalized };
  }
  if (remote.kind === "reasoning" && local.kind === "reasoning") {
    const remoteLength = remote.summary.length + remote.content.length;
    const localLength = local.summary.length + local.content.length;
    return localLength > remoteLength ? local : remote;
  }
  if (remote.kind === "tool" && local.kind === "tool") {
    const remoteLength = (remote.output ?? "").length;
    const localLength = (local.output ?? "").length;
    const base = localLength > remoteLength ? local : remote;
    return {
      ...base,
      status: remote.status ?? local.status,
      output: localLength > remoteLength ? local.output : remote.output,
      changes: remote.changes ?? local.changes,
    };
  }
  if (remote.kind === "diff" && local.kind === "diff") {
    const useLocal = local.diff.length > remote.diff.length;
    return {
      ...remote,
      diff: useLocal ? local.diff : remote.diff,
      status: remote.status ?? local.status,
    };
  }
  return remote;
}

export function mergeThreadItems(
  remoteItems: ConversationItem[],
  localItems: ConversationItem[],
) {
  if (!localItems.length) {
    return remoteItems;
  }
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  const localById = new Map(localItems.map((item) => [item.id, item]));
  const merged = remoteItems.map((item) => {
    const local = localById.get(item.id);
    return local ? chooseRicherItem(item, local) : item;
  });
  localItems.forEach((item) => {
    if (!remoteIds.has(item.id)) {
      merged.push(item);
    }
  });
  return merged;
}
