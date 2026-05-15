import type { ProjectMemoryItem } from "../../../services/tauri";
import type { MemoryContextInjectionMode } from "../../../types";
import { resolveProjectMemoryInjectionText } from "./projectMemoryDisplay";
import {
  buildProjectMemoryRetrievalPack,
  buildProjectMemorySourceRecords,
  formatProjectMemoryRetrievalPack,
} from "./projectMemoryRetrievalPack";

export const MAX_ITEM_CHARS = 200;
export const MAX_TOTAL_CHARS = 1000;
export const MAX_CANDIDATE_COUNT = 20;
export const MAX_INJECT_COUNT = 5;
export const RELEVANCE_THRESHOLD = 0.2;
export const RECALL_INTENT_MAX_INJECT_COUNT = 3;
export const IDENTITY_RECALL_SCORE = 1;

export const STOP_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "why",
  "with",
]);

export const KIND_LABEL_MAP: Record<string, string> = {
  known_issue: "已知问题",
  code_decision: "技术决策",
  project_context: "项目上下文",
  conversation: "对话记录",
  note: "笔记",
};

const CJK_REGEX = /[\u3400-\u9FFF]/;
const NON_TEXT_CHARS_REGEX = /[^\p{L}\p{N}\u3400-\u9FFF]+/gu;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function buildCjkBigrams(token: string): string[] {
  if (token.length <= 2) {
    return [token];
  }
  const grams: string[] = [token];
  for (let i = 0; i < token.length - 1; i += 1) {
    grams.push(token.slice(i, i + 2));
  }
  return grams;
}

const IDENTITY_RECALL_PHRASES = [
  "我是谁",
  "我叫什么",
  "我的名字",
  "我的身份",
  "你知道我是谁",
  "还记得我是谁",
];

const IDENTITY_EVIDENCE_PATTERNS = [
  /(?:^|用户[:：]?|user[:：]?|输入[:：]?|input[:：]?)我是[\u3400-\u9FFF\w-]{2,16}/iu,
  /(?:^|用户[:：]?|user[:：]?|输入[:：]?|input[:：]?)我叫[\u3400-\u9FFF\w-]{2,16}/iu,
  /用户是[\u3400-\u9FFF\w-]{2,16}/u,
  /用户叫[\u3400-\u9FFF\w-]{2,16}/u,
  /名字是[\u3400-\u9FFF\w-]{2,16}/u,
  /姓名是[\u3400-\u9FFF\w-]{2,16}/u,
];

export function isIdentityRecallQueryText(text: string) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  return IDENTITY_RECALL_PHRASES.some((phrase) => normalized.includes(phrase));
}

function hasIdentityEvidence(text: string) {
  const compact = text.replace(/\s+/g, "");
  return IDENTITY_EVIDENCE_PATTERNS.some((pattern) => pattern.test(compact));
}

export function normalizeQueryTerms(text: string): string[] {
  const normalized = text.toLowerCase().replace(NON_TEXT_CHARS_REGEX, " ").trim();
  if (!normalized) {
    return [];
  }

  const result = new Set<string>();
  for (const part of normalized.split(/\s+/)) {
    const token = part.trim();
    if (!token) {
      continue;
    }
    if (CJK_REGEX.test(token)) {
      for (const gram of buildCjkBigrams(token)) {
        result.add(gram);
      }
      continue;
    }
    if (STOP_WORDS.has(token)) {
      continue;
    }
    result.add(token);
  }
  return [...result];
}

export function scoreMemoryRelevance(
  memory: Pick<ProjectMemoryItem, "title" | "summary" | "tags"> &
    Partial<Pick<
      ProjectMemoryItem,
      | "userInput"
      | "assistantResponse"
      | "assistantThinkingSummary"
      | "detail"
      | "cleanText"
    >>,
  queryTerms: string[],
  options?: { queryText?: string },
): number {
  if (queryTerms.length === 0) {
    return 0;
  }
  const queryText = options?.queryText ?? queryTerms.join("");
  const identityEvidenceText = [
    memory.userInput,
    memory.detail,
    memory.cleanText,
    memory.title,
    memory.summary,
    (memory.tags ?? []).join(" "),
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  const memoryText = [
    memory.title,
    memory.summary,
    (memory.tags ?? []).join(" "),
    memory.userInput,
    memory.assistantThinkingSummary,
    memory.assistantResponse,
    memory.detail,
    memory.cleanText,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
  if (isIdentityRecallQueryText(queryText) && hasIdentityEvidence(identityEvidenceText)) {
    return IDENTITY_RECALL_SCORE;
  }
  const memoryTerms = new Set(normalizeQueryTerms(memoryText));
  if (memoryTerms.size === 0) {
    return 0;
  }
  let hits = 0;
  for (const term of queryTerms) {
    if (memoryTerms.has(term)) {
      hits += 1;
    }
  }
  return hits / queryTerms.length;
}

export type ScoredMemory = {
  memory: ProjectMemoryItem;
  relevanceScore: number;
};

type SelectContextMemoriesOptions = {
  preferRelevanceOverImportance?: boolean;
};

function isRecallIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("之前") ||
    normalized.includes("说过") ||
    normalized.includes("聊过") ||
    normalized.includes("history") ||
    normalized.includes("earlier")
  );
}

function importanceWeight(level: string): number {
  if (level === "high") {
    return 3;
  }
  if (level === "medium") {
    return 2;
  }
  if (level === "low") {
    return 1;
  }
  return 0;
}

export function selectContextMemories(
  scored: ScoredMemory[],
  options?: SelectContextMemoriesOptions,
): ScoredMemory[] {
  return [...scored]
    .filter((entry) => entry.relevanceScore >= RELEVANCE_THRESHOLD)
    .sort((a, b) => {
      const relevanceDelta = b.relevanceScore - a.relevanceScore;
      if (options?.preferRelevanceOverImportance && relevanceDelta !== 0) {
        return relevanceDelta;
      }
      const importanceDelta =
        importanceWeight(b.memory.importance) - importanceWeight(a.memory.importance);
      if (importanceDelta !== 0) {
        return importanceDelta;
      }
      if (relevanceDelta !== 0) {
        return relevanceDelta;
      }
      const timeDelta = b.memory.updatedAt - a.memory.updatedAt;
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return a.memory.id.localeCompare(b.memory.id);
    })
    .slice(0, MAX_INJECT_COUNT);
}

function selectRecentConversations(scored: ScoredMemory[]): ScoredMemory[] {
  return [...scored]
    .filter((entry) => entry.memory.kind === "conversation")
    .sort((a, b) => {
      const importanceDelta =
        importanceWeight(b.memory.importance) - importanceWeight(a.memory.importance);
      if (importanceDelta !== 0) {
        return importanceDelta;
      }
      const timeDelta = b.memory.updatedAt - a.memory.updatedAt;
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return a.memory.id.localeCompare(b.memory.id);
    })
    .slice(0, RECALL_INTENT_MAX_INJECT_COUNT);
}

function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

export function sanitizeForMemoryBlock(text: string): string {
  return text
    .replace(CONTROL_CHARS_REGEX, "")
    .replace(/<\/project-memory>/gi, "[project-memory-close]")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeContextText(text: string): string {
  return sanitizeForMemoryBlock(text).replace(/\s+/g, " ").trim();
}

export function resolveMemoryTextForInjection(
  memory: Pick<ProjectMemoryItem, "title" | "summary" | "detail" | "cleanText"> &
    Partial<Pick<
    ProjectMemoryItem,
    | "recordKind"
    | "source"
    | "turnId"
    | "userInput"
    | "assistantResponse"
    | "assistantThinkingSummary"
    | "threadId"
    | "engine"
  >>,
  mode: MemoryContextInjectionMode,
): string {
  return resolveProjectMemoryInjectionText(memory, mode);
}

export function buildContextLine(
  memory: Pick<ProjectMemoryItem, "kind" | "title" | "summary" | "detail" | "cleanText"> &
    Partial<Pick<
    ProjectMemoryItem,
    | "recordKind"
    | "source"
    | "turnId"
    | "userInput"
    | "assistantResponse"
    | "assistantThinkingSummary"
    | "threadId"
    | "engine"
  >>,
  mode: MemoryContextInjectionMode,
): string | null {
  const label = KIND_LABEL_MAP[memory.kind] ?? "记忆";
  const normalizedText = normalizeContextText(resolveMemoryTextForInjection(memory, mode));
  if (!normalizedText) {
    return null;
  }
  const text = clampText(normalizedText, MAX_ITEM_CHARS);
  return `[${label}] ${text}`;
}

export function clampContextBudget(memories: ScoredMemory[]): {
  lines: string[];
  truncated: boolean;
}
export function clampContextBudget(
  memories: ScoredMemory[],
  options: { mode?: MemoryContextInjectionMode },
): {
  lines: string[];
  truncated: boolean;
}
export function clampContextBudget(
  memories: ScoredMemory[],
  options?: { mode?: MemoryContextInjectionMode },
): {
  lines: string[];
  truncated: boolean;
} {
  const lines: string[] = [];
  let usedChars = 0;
  let truncated = false;
  const mode = options?.mode ?? "summary";

  for (const entry of memories) {
    const line = buildContextLine(entry.memory, mode);
    if (!line) {
      continue;
    }

    const delta = line.length + (lines.length > 0 ? 1 : 0);
    if (usedChars + delta > MAX_TOTAL_CHARS) {
      truncated = true;
      break;
    }

    lines.push(line);
    usedChars += delta;
  }

  if (lines.length < memories.length) {
    truncated = true;
  }

  return { lines, truncated };
}

export function formatMemoryContextBlock(
  lines: string[],
  truncated: boolean,
  source = "project-memory",
): string | null {
  if (lines.length === 0) {
    return null;
  }
  return [
    `<project-memory source="${source}" count="${lines.length}" truncated="${
      truncated ? "true" : "false"
    }">`,
    ...lines,
    "</project-memory>",
  ].join("\n");
}

function buildPreviewText(lines: string[]): string {
  const previewLines = lines.slice(0, 2);
  const previewTail = lines.length > previewLines.length ? "..." : "";
  return `${previewLines.join("；")}${previewTail}`;
}

export type InjectionResult = {
  finalText: string;
  injectedCount: number;
  injectedChars: number;
  retrievalMs: number;
  previewText: string | null;
  disabledReason:
    | "switch_off"
    | "empty_result"
    | "low_relevance"
    | "manual_empty"
    | "query_failed"
    | "scout_empty"
    | "scout_timeout"
    | "scout_error"
    | null;
};

export function injectSelectedMemoriesContext(params: {
  userText: string;
  memories: ProjectMemoryItem[];
  mode?: MemoryContextInjectionMode;
  retrievalMs?: number;
}): InjectionResult {
  if (!params.memories.length) {
    return {
      finalText: params.userText,
      injectedCount: 0,
      injectedChars: 0,
      retrievalMs: params.retrievalMs ?? 0,
      previewText: null,
      disabledReason: "manual_empty",
    };
  }

  const records = buildProjectMemorySourceRecords({ memories: params.memories });
  const pack = buildProjectMemoryRetrievalPack({
    source: "manual-selection",
    records,
  });
  const block = formatProjectMemoryRetrievalPack(pack);
  if (!block) {
    return {
      finalText: params.userText,
      injectedCount: 0,
      injectedChars: 0,
      retrievalMs: params.retrievalMs ?? 0,
      previewText: null,
      disabledReason: "manual_empty",
    };
  }
  const selected = params.memories.map((memory) => ({
    memory,
    relevanceScore: 1,
  }));
  const { lines: previewLines } = clampContextBudget(selected, { mode: "summary" });

  return {
    finalText: `${block}\n\n${params.userText}`,
    injectedCount: pack.records.length,
    injectedChars: block.length,
    retrievalMs: params.retrievalMs ?? 0,
    previewText: buildPreviewText(previewLines),
    disabledReason: null,
  };
}

export async function injectProjectMemoryContext(params: {
  workspaceId: string;
  userText: string;
  enabled: boolean;
  listFn: (params: {
    workspaceId: string;
    importance?: string | null;
    page?: number | null;
    pageSize?: number | null;
  }) => Promise<{ items: ProjectMemoryItem[]; total: number }>;
}): Promise<InjectionResult> {
  if (!params.enabled) {
    return {
      finalText: params.userText,
      injectedCount: 0,
      injectedChars: 0,
      retrievalMs: 0,
      previewText: null,
      disabledReason: "switch_off",
    };
  }

  const queryTerms = normalizeQueryTerms(params.userText);
  const start = Date.now();

  try {
    const response = await params.listFn({
      workspaceId: params.workspaceId,
      importance: null,
      page: 0,
      pageSize: MAX_CANDIDATE_COUNT,
    });
    const retrievalMs = Date.now() - start;

    if (!response.items || response.items.length === 0) {
      return {
        finalText: params.userText,
        injectedCount: 0,
        injectedChars: 0,
        retrievalMs,
        previewText: null,
        disabledReason: "empty_result",
      };
    }

    const scored = response.items.map((memory) => ({
      memory,
      relevanceScore: scoreMemoryRelevance(memory, queryTerms),
    }));

    let selected = selectContextMemories(scored);
    if (selected.length === 0 && isRecallIntent(params.userText)) {
      selected = selectRecentConversations(scored);
    }
    if (selected.length === 0) {
      return {
        finalText: params.userText,
        injectedCount: 0,
        injectedChars: 0,
        retrievalMs,
        previewText: null,
        disabledReason: "low_relevance",
      };
    }

    const { lines, truncated } = clampContextBudget(selected);
    const block = formatMemoryContextBlock(lines, truncated);
    if (!block) {
      return {
        finalText: params.userText,
        injectedCount: 0,
        injectedChars: 0,
        retrievalMs,
        previewText: null,
        disabledReason: "low_relevance",
      };
    }

    return {
      finalText: `${block}\n\n${params.userText}`,
      injectedCount: lines.length,
      injectedChars: block.length,
      retrievalMs,
      previewText: buildPreviewText(lines),
      disabledReason: null,
    };
  } catch {
    return {
      finalText: params.userText,
      injectedCount: 0,
      injectedChars: 0,
      retrievalMs: Date.now() - start,
      previewText: null,
      disabledReason: "query_failed",
    };
  }
}
