import {
  normalizeOutsideMarkdownCode,
  normalizeOutsideMarkdownCodeStableInlineRegions,
} from "./markdownCodeRegions";
import { collapseNearDuplicateParagraphRepeats } from "./assistantDuplicateParagraphs";

const MESSAGE_PARAGRAPH_BREAK_SPLIT_REGEX = /\r?\n[^\S\r\n]*\r?\n+/;
const ASSISTANT_FRAGMENT_MIN_RUN = 5;
const ASSISTANT_FRAGMENT_MAX_LENGTH = 14;
const ASSISTANT_FRAGMENT_MIN_TOTAL_CHARS = 12;
const ASSISTANT_LINE_FRAGMENT_MIN_RUN = 6;
const ASSISTANT_LINE_FRAGMENT_MAX_LENGTH = 10;
const ASSISTANT_LINE_FRAGMENT_MIN_TOTAL_CHARS = 12;
const ASSISTANT_TEXT_CACHE_MAX = 320;
const ASSISTANT_NO_CONTENT_PLACEHOLDER_SET = new Set(["(no content)", "no content"]);
const CLAUDE_APPROVAL_RESUME_MARKER_REGEX =
  /<ccgui-approval-resume>([\s\S]*?)<\/ccgui-approval-resume>\s*/i;
const CLAUDE_APPROVAL_RESUME_TRAILER_REGEX =
  /\bPlease continue from the current workspace state and finish the original task\.\s*$/i;
const CLAUDE_APPROVAL_RESUME_BLOCK_REGEX =
  /(?:^|\n)Completed approved operations:\n(?:- .*\n?)+Please continue from the current workspace state and finish the original task\.\s*/i;
const CLAUDE_NO_RESPONSE_REQUESTED_REGEX =
  /(?:^|\n)No response requested\.\s*(?:\n|$)/gi;

const assistantNormalizedTextCache = new Map<string, string>();
const assistantReadabilityScoreCache = new Map<
  string,
  { normalized: string; score: number }
>();

function asString(value: unknown) {
  return typeof value === "string" ? value : value ? String(value) : "";
}

function joinTextFragments(parts: string[]) {
  const fragments = parts.filter((entry) => entry.length > 0);
  if (fragments.length === 0) {
    return "";
  }
  const firstFragment = fragments[0] ?? "";
  if (fragments.length === 1) {
    return firstFragment;
  }
  return fragments.slice(1).reduce((combined, fragment) => {
    const previousChar = combined[combined.length - 1] ?? "";
    const nextChar = fragment[0] ?? "";
    const shouldInsertSpace =
      /[A-Za-z0-9]/.test(previousChar) &&
      /[A-Za-z0-9]/.test(nextChar);
    return shouldInsertSpace ? `${combined} ${fragment}` : `${combined}${fragment}`;
  }, firstFragment);
}

export type ClaudeApprovalResumeEntry = {
  summary: string;
  path: string | null;
  kind: string | null;
  status: string | null;
};

export function extractClaudeApprovalResumeEntries(
  text: string,
): ClaudeApprovalResumeEntry[] {
  if (!text) {
    return [];
  }
  const match = text.match(CLAUDE_APPROVAL_RESUME_MARKER_REGEX);
  if (!match?.[1]) {
    return [];
  }
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return null;
        }
        const record = entry as Record<string, unknown>;
        const summary = asString(record.summary).trim();
        if (!summary) {
          return null;
        }
        const path = asString(record.path).trim();
        const kind = asString(record.kind).trim();
        const status = asString(record.status).trim();
        return {
          summary,
          path: path || null,
          kind: kind || null,
          status: status || null,
        } satisfies ClaudeApprovalResumeEntry;
      })
      .filter((entry): entry is ClaudeApprovalResumeEntry => Boolean(entry));
  } catch {
    return [];
  }
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
      normalized.push(joinTextFragments(run));
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
        normalizedLines.push(joinTextFragments(run));
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
      const currentChar = trimmed[index];
      if (currentChar && !/\s/.test(currentChar)) {
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

export function stripClaudeApprovalResumeArtifacts(text: string) {
  if (!text) {
    return text;
  }
  let normalized = text;
  normalized = normalized.replace(CLAUDE_APPROVAL_RESUME_MARKER_REGEX, "");
  normalized = normalized.replace(CLAUDE_APPROVAL_RESUME_BLOCK_REGEX, "\n");
  normalized = normalized.replace(CLAUDE_APPROVAL_RESUME_TRAILER_REGEX, "");
  normalized = normalized.replace(CLAUDE_NO_RESPONSE_REQUESTED_REGEX, "\n");
  return normalized.trim();
}

function normalizeAssistantMessageText(text: string) {
  if (!text) {
    return text;
  }
  let normalized = stripClaudeApprovalResumeArtifacts(text);
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    collapseRepeatedAssistantParagraphBlocks,
  );
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    collapseNearDuplicateParagraphRepeats,
  );
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    collapseRepeatedAssistantFullText,
  );
  if (isLikelyFragmentedAssistantText(normalized)) {
    normalized = normalizeOutsideMarkdownCode(
      normalized,
      normalizeAssistantFragmentedParagraphs,
    );
    normalized = normalizeOutsideMarkdownCode(
      normalized,
      normalizeAssistantFragmentedLines,
    );
  }
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    dedupeRepeatedAssistantSentences,
  );
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    collapseNearDuplicateAssistantSentenceBlocks,
  );
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    dedupeAdjacentAssistantParagraphs,
  );
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    collapseRepeatedAssistantParagraphBlocks,
  );
  normalized = normalizeOutsideMarkdownCodeStableInlineRegions(
    normalized,
    collapseRepeatedAssistantFullText,
  );
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
    if (
      shortParagraphs >= ASSISTANT_FRAGMENT_MIN_RUN &&
      shortParagraphs / paragraphs.length >= 0.6
    ) {
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
      if (
        totalChars >= ASSISTANT_LINE_FRAGMENT_MIN_TOTAL_CHARS &&
        cjkChars >= Math.max(2, Math.floor(totalChars * 0.35))
      ) {
        return true;
      }
    }
  }
  return false;
}

export function shouldNormalizeAssistantText(text: string) {
  if (!text) {
    return false;
  }
  if (stripClaudeApprovalResumeArtifacts(text) !== text.trim()) {
    return true;
  }
  if (hasRepeatedAssistantTextPattern(text)) {
    return true;
  }
  const collapsedNearDuplicate = collapseNearDuplicateAssistantSentenceBlocks(text);
  if (collapsedNearDuplicate.trim() !== text.trim()) {
    return true;
  }
  const collapsedNearDuplicateParagraphs = collapseNearDuplicateParagraphRepeats(text);
  if (collapsedNearDuplicateParagraphs.trim() !== text.trim()) {
    return true;
  }
  if (hasRichAssistantMarkdownStructure(text)) {
    return false;
  }
  return isLikelyFragmentedAssistantText(text);
}

export function getNormalizedAssistantMessageText(text: string) {
  const cached = assistantNormalizedTextCache.get(text);
  if (cached !== undefined) {
    return cached;
  }
  const normalized = normalizeAssistantMessageText(text);
  return rememberCacheEntry(assistantNormalizedTextCache, text, normalized);
}

export function scoreAssistantMessageReadability(text: string) {
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
    score += Math.min(
      12,
      Math.floor((compactOriginal.length - compactNormalized.length) / 3),
    );
  }
  return rememberCacheEntry(assistantReadabilityScoreCache, text, {
    normalized,
    score,
  });
}

function normalizeAssistantPlaceholderText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("（", "(")
    .replaceAll("）", ")");
}

export function isAssistantNoContentPlaceholder(value: string) {
  if (!value) {
    return false;
  }
  return ASSISTANT_NO_CONTENT_PLACEHOLDER_SET.has(
    normalizeAssistantPlaceholderText(value),
  );
}

export function compactMessageText(value: string) {
  return value.replace(/\s+/g, "");
}
