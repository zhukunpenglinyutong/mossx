import type { ProjectMemoryItem, ProjectMemoryListResult } from "../../../services/tauri";
import {
  normalizeQueryTerms,
  isIdentityRecallQueryText,
  sanitizeForMemoryBlock,
  scoreMemoryRelevance,
  selectContextMemories,
  type InjectionResult,
  type ScoredMemory,
} from "./memoryContextInjection";
import {
  PROJECT_MEMORY_SEMANTIC_SCAN_PAGE_SIZE,
  retrieveProjectMemorySemanticCandidates,
  semanticCandidatesToScoredMemories,
  type ProjectMemoryEmbeddingProvider,
  type ProjectMemoryRetrievalMode,
  type ProjectMemorySemanticDiagnostics,
  type ProjectMemorySemanticRetrievalResult,
} from "./projectMemorySemanticRetrieval";
import {
  resolveProjectMemoryCompactSummary,
  resolveProjectMemoryCompactTitle,
} from "./projectMemoryDisplay";
import { cleanProjectMemoryRecordsForRequest } from "./projectMemoryCleaner";
import {
  buildProjectMemoryRetrievalPack,
  buildProjectMemorySourceRecords,
  formatProjectMemoryRetrievalPack,
} from "./projectMemoryRetrievalPack";

export type MemoryBriefStatus = "ok" | "empty" | "timeout" | "error";

export type MemoryBriefSource = {
  threadId?: string | null;
  turnId?: string | null;
  engine?: string | null;
  updatedAt: number;
};

export type MemoryBriefItem = {
  memoryId: string;
  title: string;
  recordKind: string;
  reason: string;
  summary: string;
  source: MemoryBriefSource;
};

export type MemoryBrief = {
  status: MemoryBriefStatus;
  query: string;
  memories?: ProjectMemoryItem[];
  items: MemoryBriefItem[];
  conflicts: string[];
  truncated: boolean;
  elapsedMs: number;
  retrievalMode: ProjectMemoryRetrievalMode;
  semanticDiagnostics?: ProjectMemorySemanticDiagnostics;
};

export type MemoryScoutListFn = (params: {
  workspaceId: string;
  query?: string | null;
  importance?: string | null;
  page?: number | null;
  pageSize?: number | null;
}) => Promise<ProjectMemoryListResult>;

export const MEMORY_SCOUT_MAX_ITEMS = 3;
export const MEMORY_SCOUT_MAX_SUMMARY_CHARS = 220;
export const MEMORY_SCOUT_MAX_REASON_CHARS = 120;
export const MEMORY_SCOUT_PREVIEW_PREFIX = "Memory Reference";
export const MEMORY_SCOUT_FALLBACK_SCAN_PAGE_SIZE = 200;
export const MEMORY_SCOUT_FALLBACK_MAX_SCAN_ITEMS = 1_000;

const ENABLED_MARKERS = ["enable", "enabled", "开启", "启用", "true", "yes", "允许"];
const DISABLED_MARKERS = ["disable", "disabled", "关闭", "禁用", "false", "no", "禁止"];

function clamp(value: string, maxChars: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeRecordKind(memory: ProjectMemoryItem) {
  return memory.recordKind ?? (
    memory.source === "conversation_turn" || memory.turnId ? "conversation_turn" : "legacy"
  );
}

function resolveLooseReviewState(memory: ProjectMemoryItem) {
  const looseMemory = memory as ProjectMemoryItem & {
    reviewState?: string | null;
    metadata?: { reviewState?: string | null } | null;
  };
  return looseMemory.reviewState ?? looseMemory.metadata?.reviewState ?? null;
}

function isObsoleteMemory(memory: ProjectMemoryItem) {
  return resolveLooseReviewState(memory) === "obsolete";
}

function selectRecentMemories(scored: ScoredMemory[]) {
  return [...scored]
    .sort((a, b) => {
      const timeDelta = b.memory.updatedAt - a.memory.updatedAt;
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return a.memory.id.localeCompare(b.memory.id);
    })
    .slice(0, MEMORY_SCOUT_MAX_ITEMS);
}

function buildReason(memory: ProjectMemoryItem, queryTerms: string[], relevanceScore: number) {
  const memoryTerms = new Set(
    normalizeQueryTerms(`${memory.title} ${memory.summary} ${(memory.tags ?? []).join(" ")}`),
  );
  const matchedTerms = queryTerms.filter((term) => memoryTerms.has(term)).slice(0, 4);
  if (matchedTerms.length > 0) {
    return clamp(`Matched query terms: ${matchedTerms.join(", ")}`, MEMORY_SCOUT_MAX_REASON_CHARS);
  }
  if (relevanceScore > 0) {
    return clamp(`Related memory score ${relevanceScore.toFixed(2)}`, MEMORY_SCOUT_MAX_REASON_CHARS);
  }
  return "Recent project memory candidate";
}

function toBriefItem(entry: ScoredMemory, queryTerms: string[]): MemoryBriefItem {
  const memory = entry.memory;
  return {
    memoryId: memory.id,
    title: clamp(resolveProjectMemoryCompactTitle(memory), 120),
    recordKind: normalizeRecordKind(memory),
    reason: buildReason(memory, queryTerms, entry.relevanceScore),
    summary: clamp(resolveProjectMemoryCompactSummary(memory), MEMORY_SCOUT_MAX_SUMMARY_CHARS),
    source: {
      threadId: memory.threadId ?? null,
      turnId: memory.turnId ?? null,
      engine: memory.engine ?? null,
      updatedAt: memory.updatedAt,
    },
  };
}

function detectPolarity(text: string) {
  const normalized = text.toLowerCase();
  const enabled = ENABLED_MARKERS.some((marker) => normalized.includes(marker));
  const disabled = DISABLED_MARKERS.some((marker) => normalized.includes(marker));
  return { enabled, disabled };
}

function detectConflicts(items: MemoryBriefItem[]) {
  const conflicts: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const left = items[i];
      const right = items[j];
      if (!left || !right) {
        continue;
      }
      const leftPolarity = detectPolarity(`${left.title} ${left.summary}`);
      const rightPolarity = detectPolarity(`${right.title} ${right.summary}`);
      const polarityConflict =
        (leftPolarity.enabled && rightPolarity.disabled) ||
        (leftPolarity.disabled && rightPolarity.enabled);
      if (polarityConflict) {
        conflicts.push(
          `Potential conflict between ${left.memoryId} and ${right.memoryId}: ${left.title} / ${right.title}`,
        );
      }
    }
  }
  return conflicts;
}

export function buildMemoryBrief(params: {
  query: string;
  memories: ProjectMemoryItem[];
  elapsedMs?: number;
  includeObsolete?: boolean;
  semanticResult?: ProjectMemorySemanticRetrievalResult | null;
}): MemoryBrief {
  const queryTerms = normalizeQueryTerms(params.query);
  const candidates = params.includeObsolete
    ? params.memories
    : params.memories.filter((memory) => !isObsoleteMemory(memory));
  const semanticDiagnostics = params.semanticResult?.diagnostics;
  const semanticScored =
    params.semanticResult && params.semanticResult.candidates.length > 0
      ? semanticCandidatesToScoredMemories(params.semanticResult.candidates)
      : null;
  const retrievalMode: ProjectMemoryRetrievalMode = semanticScored ? "hybrid" : "lexical";

  if (candidates.length === 0) {
    return {
      status: "empty",
      query: params.query,
      memories: [],
      items: [],
      conflicts: [],
      truncated: false,
      elapsedMs: params.elapsedMs ?? 0,
      retrievalMode,
      semanticDiagnostics,
    };
  }

  const scored = candidates.map((memory) => ({
    memory,
    relevanceScore: scoreMemoryRelevance(memory, queryTerms, { queryText: params.query }),
  }));
  const selected =
    semanticScored ??
    (queryTerms.length > 0
      ? selectContextMemories(scored, {
          preferRelevanceOverImportance: isIdentityRecallQueryText(params.query),
        })
      : selectRecentMemories(scored));
  const selectedWithinBudget = selected.slice(0, MEMORY_SCOUT_MAX_ITEMS);
  if (selectedWithinBudget.length === 0) {
    return {
      status: "empty",
      query: params.query,
      memories: [],
      items: [],
      conflicts: [],
      truncated: false,
      elapsedMs: params.elapsedMs ?? 0,
      retrievalMode,
      semanticDiagnostics,
    };
  }

  const items = selectedWithinBudget.map((entry) => toBriefItem(entry, queryTerms));
  return {
    status: "ok",
    query: params.query,
    memories: selectedWithinBudget.map((entry) => entry.memory),
    items,
    conflicts: detectConflicts(items),
    truncated: selected.length > selectedWithinBudget.length || candidates.length > items.length,
    elapsedMs: params.elapsedMs ?? 0,
    retrievalMode,
    semanticDiagnostics,
  };
}

export async function scoutProjectMemory(params: {
  workspaceId: string;
  query: string;
  listFn: MemoryScoutListFn;
  includeObsolete?: boolean;
  semanticProvider?: ProjectMemoryEmbeddingProvider | null;
  allowTestSemanticProvider?: boolean;
}): Promise<MemoryBrief> {
  const startedAt = Date.now();
  let fallbackSemanticResult: ProjectMemorySemanticRetrievalResult | null = null;
  try {
    if (params.semanticProvider) {
      const result = await params.listFn({
        workspaceId: params.workspaceId,
        query: null,
        importance: null,
        page: 0,
        pageSize: PROJECT_MEMORY_SEMANTIC_SCAN_PAGE_SIZE,
      });
      const semanticResult = await retrieveProjectMemorySemanticCandidates({
        workspaceId: params.workspaceId,
        query: params.query,
        memories: result.items ?? [],
        provider: params.semanticProvider,
        allowTestProvider: params.allowTestSemanticProvider,
        topK: MEMORY_SCOUT_MAX_ITEMS,
      });
      if (semanticResult.status === "available" || semanticResult.status === "indexing") {
        return buildMemoryBrief({
          query: params.query,
          memories: result.items ?? [],
          includeObsolete: params.includeObsolete,
          semanticResult,
          elapsedMs: Date.now() - startedAt,
        });
      }
      fallbackSemanticResult = semanticResult;
    }

    const result = await listFallbackCandidates({
      workspaceId: params.workspaceId,
      listFn: params.listFn,
    });
    return buildMemoryBrief({
      query: params.query,
      memories: result.items ?? [],
      includeObsolete: params.includeObsolete,
      semanticResult: fallbackSemanticResult,
      elapsedMs: Date.now() - startedAt,
    });
  } catch {
    return {
      status: "error",
      query: params.query,
      memories: [],
      items: [],
      conflicts: [],
      truncated: false,
      elapsedMs: Date.now() - startedAt,
      retrievalMode: "lexical",
    };
  }
}

async function listFallbackCandidates(params: {
  workspaceId: string;
  listFn: MemoryScoutListFn;
}): Promise<ProjectMemoryListResult> {
  const items: ProjectMemoryItem[] = [];
  let total = 0;
  for (
    let page = 0;
    items.length < MEMORY_SCOUT_FALLBACK_MAX_SCAN_ITEMS;
    page += 1
  ) {
    const result = await params.listFn({
      workspaceId: params.workspaceId,
      query: null,
      importance: null,
      page,
      pageSize: MEMORY_SCOUT_FALLBACK_SCAN_PAGE_SIZE,
    });
    const pageItems = result.items ?? [];
    total = result.total;
    items.push(...pageItems);
    if (
      pageItems.length < MEMORY_SCOUT_FALLBACK_SCAN_PAGE_SIZE ||
      items.length >= result.total
    ) {
      break;
    }
  }
  return {
    items: items.slice(0, MEMORY_SCOUT_FALLBACK_MAX_SCAN_ITEMS),
    total,
  };
}

function formatSource(source: MemoryBriefSource) {
  const parts: string[] = [];
  if (source.threadId) {
    parts.push(`threadId=${source.threadId}`);
  }
  if (source.turnId) {
    parts.push(`turnId=${source.turnId}`);
  }
  if (source.engine) {
    parts.push(`engine=${source.engine}`);
  }
  parts.push(`updatedAt=${source.updatedAt}`);
  return parts.join(" ");
}

export function buildMemoryScoutContextBlock(brief: MemoryBrief): string | null {
  if (brief.status !== "ok" || brief.items.length === 0) {
    return null;
  }
  const lines = [
    `<project-memory source="memory-scout" count="${brief.items.length}" status="${brief.status}" truncated="${brief.truncated ? "true" : "false"}">`,
    "Memory Brief:",
    ...brief.items.flatMap((item, index) => [
      `${index + 1}. [${sanitizeForMemoryBlock(item.recordKind)}] ${sanitizeForMemoryBlock(item.title)} (memoryId=${sanitizeForMemoryBlock(item.memoryId)})`,
      `   reason: ${sanitizeForMemoryBlock(item.reason)}`,
      `   summary: ${sanitizeForMemoryBlock(item.summary)}`,
      `   source: ${sanitizeForMemoryBlock(formatSource(item.source))}`,
    ]),
  ];
  if (brief.conflicts.length > 0) {
    lines.push("Conflicts:");
    lines.push(...brief.conflicts.map((conflict) => `- ${sanitizeForMemoryBlock(conflict)}`));
  }
  lines.push("</project-memory>");
  return lines.join("\n");
}

export function buildMemoryScoutPreviewText(brief: MemoryBrief): string {
  if (brief.status === "ok") {
    const titles = brief.items.map((item) => item.title).slice(0, 3).join("；");
    return `${MEMORY_SCOUT_PREVIEW_PREFIX}: referenced ${brief.items.length} project memories${titles ? ` - ${titles}` : ""}`;
  }
  if (brief.status === "timeout") {
    return `${MEMORY_SCOUT_PREVIEW_PREFIX}: timed out, sent without memory brief`;
  }
  if (brief.status === "error") {
    return `${MEMORY_SCOUT_PREVIEW_PREFIX}: failed, sent without memory brief`;
  }
  return `${MEMORY_SCOUT_PREVIEW_PREFIX}: no related project memory found`;
}

function resolveScoutDisabledReason(
  status: MemoryBriefStatus,
): Exclude<InjectionResult["disabledReason"], null> {
  if (status === "timeout") {
    return "scout_timeout";
  }
  if (status === "error") {
    return "scout_error";
  }
  return "scout_empty";
}

export function injectMemoryScoutBriefContext(params: {
  userText: string;
  brief: MemoryBrief;
  startIndex?: number;
}): InjectionResult {
  const records = buildProjectMemorySourceRecords({
    memories: params.brief.memories ?? [],
    startIndex: params.startIndex,
  });
  const cleaner =
    params.brief.status === "ok"
      ? cleanProjectMemoryRecordsForRequest({
          userText: params.brief.query,
          records,
        })
      : null;
  const pack = buildProjectMemoryRetrievalPack({
    source: "memory-scout",
    records,
    cleaner,
  });
  const block = formatProjectMemoryRetrievalPack(pack) ?? buildMemoryScoutContextBlock(params.brief);
  if (!block) {
    return {
      finalText: params.userText,
      injectedCount: 0,
      injectedChars: 0,
      retrievalMs: params.brief.elapsedMs,
      previewText: buildMemoryScoutPreviewText(params.brief),
      disabledReason: resolveScoutDisabledReason(params.brief.status),
    };
  }
  return {
    finalText: `${block}\n\n${params.userText}`,
    injectedCount: params.brief.items.length,
    injectedChars: block.length,
    retrievalMs: params.brief.elapsedMs,
    previewText: buildMemoryScoutPreviewText(params.brief),
    disabledReason: null,
  };
}
