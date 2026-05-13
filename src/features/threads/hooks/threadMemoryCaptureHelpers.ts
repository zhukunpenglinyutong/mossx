/** 回合级记忆待合并数据（输入侧采集后暂存，等输出侧压缩后融合写入） */
export type PendingMemoryCapture = {
  workspaceId: string;
  threadId: string;
  turnId: string;
  inputText: string;
  memoryId: string | null;
  workspaceName: string | null;
  workspacePath: string | null;
  engine: string | null;
  createdAt: number;
};

export type PendingAssistantCompletion = {
  workspaceId: string;
  threadId: string;
  turnId: string | null;
  itemId: string;
  text: string;
  segments: PendingAssistantCompletionSegment[];
  createdAt: number;
  updatedAt: number;
};

// Claude turns can exceed 30s frequently; keep a wider merge window to avoid dropping write-back.
export const PENDING_MEMORY_STALE_MS = 10 * 60_000;

export type PendingAssistantCompletionSegment = {
  itemId: string;
  text: string;
  updatedAt: number;
};

export function buildMemoryTurnKey(threadId: string, turnId: string | null | undefined) {
  const normalizedTurnId = turnId?.trim() || "__unknown_turn__";
  return `${threadId}::${normalizedTurnId}`;
}

const MEMORY_DEBUG_FLAG_KEY = "ccgui:memory-debug";
const MEMORY_PARAGRAPH_BREAK_SPLIT_REGEX = /\r?\n[^\S\r\n]*\r?\n+/;
const MEMORY_SENTENCE_BOUNDARY_CHARS = new Set([
  "。",
  "！",
  "？",
  ".",
  "!",
  "?",
  "；",
  ";",
  ":",
  "：",
  "\n",
]);

function compactComparableMemoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u3400-\u9FFF]+/gu, "");
}

function shouldReplaceAssistantCompletionSegments(
  existingText: string,
  incomingText: string,
) {
  const existingComparable = compactComparableMemoryText(existingText);
  const incomingComparable = compactComparableMemoryText(incomingText);
  if (existingComparable.length < 12 || incomingComparable.length < 12) {
    return false;
  }
  return incomingComparable.includes(existingComparable);
}

function isRedundantAssistantCompletionSegment(
  existingText: string,
  incomingText: string,
) {
  const existingComparable = compactComparableMemoryText(existingText);
  const incomingComparable = compactComparableMemoryText(incomingText);
  if (existingComparable.length < 12 || incomingComparable.length < 12) {
    return false;
  }
  return existingComparable.includes(incomingComparable);
}

export function joinPendingAssistantCompletionText(
  completion: Pick<PendingAssistantCompletion, "segments" | "text">,
) {
  if (!completion.segments.length) {
    return completion.text;
  }
  return completion.segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function upsertPendingAssistantCompletionSegment(
  existing: PendingAssistantCompletion | undefined,
  payload: {
    workspaceId: string;
    threadId: string;
    turnId: string | null;
    itemId: string;
    text: string;
  },
  nowMs: number,
): PendingAssistantCompletion {
  const incomingSegment: PendingAssistantCompletionSegment = {
    itemId: payload.itemId,
    text: payload.text,
    updatedAt: nowMs,
  };
  if (!existing) {
    return {
      workspaceId: payload.workspaceId,
      threadId: payload.threadId,
      turnId: payload.turnId,
      itemId: payload.itemId,
      text: payload.text,
      segments: [incomingSegment],
      createdAt: nowMs,
      updatedAt: nowMs,
    };
  }

  const existingSegmentIndex = existing.segments.findIndex(
    (segment) => segment.itemId === payload.itemId,
  );
  let nextSegments = [...existing.segments];
  if (existingSegmentIndex >= 0) {
    nextSegments[existingSegmentIndex] = incomingSegment;
  } else {
    const existingText = joinPendingAssistantCompletionText(existing);
    if (shouldReplaceAssistantCompletionSegments(existingText, payload.text)) {
      nextSegments = [incomingSegment];
    } else if (!isRedundantAssistantCompletionSegment(existingText, payload.text)) {
      nextSegments.push(incomingSegment);
    }
  }

  const nextCompletion = {
    ...existing,
    itemId: payload.itemId,
    text: nextSegments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n\n"),
    segments: nextSegments,
    updatedAt: nowMs,
  };
  return nextCompletion;
}

function splitMemorySentences(value: string) {
  const segments: string[] = [];
  let segmentStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const currentChar = value[index] ?? "";
    if (!MEMORY_SENTENCE_BOUNDARY_CHARS.has(currentChar)) {
      continue;
    }
    let segmentEnd = index + 1;
    while (segmentEnd < value.length && /\s/.test(value[segmentEnd] ?? "")) {
      segmentEnd += 1;
    }
    const segment = value.slice(segmentStart, segmentEnd);
    if (segment.trim()) {
      segments.push(segment);
    }
    segmentStart = segmentEnd;
  }
  const tailSegment = value.slice(segmentStart);
  if (tailSegment.trim()) {
    segments.push(tailSegment);
  }
  return segments
    .map((entry) => trimTrailingPromptFragment(entry).trim())
    .filter(Boolean);
}

function trimTrailingPromptFragment(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= 16 && /[：:]$/.test(trimmed)) {
    return "";
  }
  const sentenceEndIndex = Math.max(
    trimmed.lastIndexOf("。"),
    trimmed.lastIndexOf("！"),
    trimmed.lastIndexOf("？"),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?"),
    trimmed.lastIndexOf(";"),
    trimmed.lastIndexOf("；"),
  );
  if (sentenceEndIndex < 0 || sentenceEndIndex >= trimmed.length - 1) {
    return trimmed;
  }
  const tail = trimmed.slice(sentenceEndIndex + 1).trim();
  if (tail.length > 0 && tail.length <= 16 && /[：:]$/.test(tail)) {
    return trimmed.slice(0, sentenceEndIndex + 1).trim();
  }
  return trimmed;
}

export function normalizeAssistantOutputForMemory(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const directRepeat = trimmed.match(/^([\s\S]{8,}?)(?:\s+\1){1,2}$/);
  if (directRepeat?.[1]) {
    return directRepeat[1].trim();
  }

  const paragraphs = trimmed
    .split(MEMORY_PARAGRAPH_BREAK_SPLIT_REGEX)
    .map((entry) => trimTrailingPromptFragment(entry))
    .filter(Boolean);
  if (paragraphs.length > 1) {
    const deduped: string[] = [];
    for (const paragraph of paragraphs) {
      const previous = deduped[deduped.length - 1];
      if (
        previous &&
        compactComparableMemoryText(previous) === compactComparableMemoryText(paragraph) &&
        compactComparableMemoryText(paragraph).length >= 8
      ) {
        continue;
      }
      deduped.push(paragraph);
    }
    for (const repeatCount of [3, 2]) {
      if (deduped.length < repeatCount || deduped.length % repeatCount !== 0) {
        continue;
      }
      const blockLength = deduped.length / repeatCount;
      if (blockLength < 1) {
        continue;
      }
      const firstBlock = deduped
        .slice(0, blockLength)
        .map((entry) => compactComparableMemoryText(entry));
      if (!firstBlock.some((entry) => entry.length >= 8)) {
        continue;
      }
      let matches = true;
      for (let blockIndex = 1; blockIndex < repeatCount; blockIndex += 1) {
        const start = blockIndex * blockLength;
        const candidate = deduped
          .slice(start, start + blockLength)
          .map((entry) => compactComparableMemoryText(entry));
        if (
          candidate.length !== firstBlock.length ||
          candidate.some((entry, index) => entry !== firstBlock[index])
        ) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return deduped.slice(0, blockLength).join("\n\n");
      }
    }
    return deduped.join("\n\n");
  }

  return trimmed;
}

export function normalizeDigestSummaryForMemory(value: string) {
  const normalized = trimTrailingPromptFragment(
    normalizeAssistantOutputForMemory(value),
  );
  const sentences = splitMemorySentences(normalized);
  if (sentences.length <= 1) {
    return normalized.trim();
  }
  const deduped: string[] = [];
  const seenShort = new Set<string>();
  for (const sentence of sentences) {
    const comparable = compactComparableMemoryText(
      trimTrailingPromptFragment(sentence),
    );
    if (!comparable) {
      continue;
    }
    const previous = deduped[deduped.length - 1];
    if (previous && compactComparableMemoryText(previous) === comparable) {
      continue;
    }
    if (comparable.length <= 24 && seenShort.has(comparable)) {
      continue;
    }
    if (comparable.length <= 24) {
      seenShort.add(comparable);
    }
    deduped.push(sentence);
  }
  return deduped.join(" ").trim();
}

function isAssistantOutputRedundant(summary: string, output: string) {
  const compactSummary = compactComparableMemoryText(summary);
  const compactOutput = compactComparableMemoryText(output);
  if (!compactSummary || !compactOutput) {
    return false;
  }
  if (compactSummary === compactOutput) {
    return true;
  }
  const longerLength = Math.max(compactSummary.length, compactOutput.length);
  const shorterLength = Math.min(compactSummary.length, compactOutput.length);
  if (shorterLength < 12) {
    return false;
  }
  if (longerLength <= 0) {
    return false;
  }
  if (shorterLength / longerLength < 0.78) {
    return false;
  }
  return compactSummary.includes(compactOutput) || compactOutput.includes(compactSummary);
}

export function extractNovelAssistantOutput(summary: string, output: string) {
  const normalizedSummary = normalizeDigestSummaryForMemory(summary);
  const normalizedOutput = normalizeAssistantOutputForMemory(output);
  if (!normalizedOutput) {
    return "";
  }

  const summarySentences = splitMemorySentences(normalizedSummary);
  const summaryComparables = summarySentences
    .map((entry) => compactComparableMemoryText(entry))
    .filter((entry) => entry.length >= 8);

  if (summaryComparables.length === 0) {
    return normalizedOutput;
  }

  const outputSentences = splitMemorySentences(normalizedOutput);
  const kept: string[] = [];
  for (const sentence of outputSentences) {
    const comparable = compactComparableMemoryText(sentence);
    if (!comparable) {
      continue;
    }
    const overlapsSummary = summaryComparables.some((entry) => {
      if (comparable === entry) {
        return true;
      }
      const minLength = Math.min(comparable.length, entry.length);
      if (minLength < 12) {
        return false;
      }
      return comparable.includes(entry) || entry.includes(comparable);
    });
    if (overlapsSummary) {
      continue;
    }
    const previous = kept[kept.length - 1];
    if (previous && compactComparableMemoryText(previous) === comparable) {
      continue;
    }
    kept.push(sentence);
  }

  const novelOutput = kept.join(" ").trim();
  if (!novelOutput) {
    return "";
  }
  return isAssistantOutputRedundant(normalizedSummary, novelOutput)
    ? ""
    : novelOutput;
}

function isMemoryDebugEnabled(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(MEMORY_DEBUG_FLAG_KEY) === "1";
}

export function memoryDebugLog(message: string, payload?: Record<string, unknown>) {
  if (!isMemoryDebugEnabled()) {
    return;
  }
  if (payload) {
    console.info(`[project-memory][debug] ${message}`, payload);
    return;
  }
  console.info(`[project-memory][debug] ${message}`);
}
