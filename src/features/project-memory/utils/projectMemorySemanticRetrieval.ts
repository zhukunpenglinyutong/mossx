import type { ProjectMemoryItem } from "../../../services/tauri";
import { normalizeQueryTerms, scoreMemoryRelevance } from "./memoryContextInjection";

export const PROJECT_MEMORY_EMBEDDING_DOCUMENT_VERSION = 1;
export const PROJECT_MEMORY_SEMANTIC_DEFAULT_TOP_K = 5;
export const PROJECT_MEMORY_SEMANTIC_SCAN_PAGE_SIZE = 10_000;

export type ProjectMemorySemanticStatus =
  | "available"
  | "indexing"
  | "unavailable"
  | "stale"
  | "error";

export type ProjectMemoryEmbeddingProviderScope = "production" | "test";

export type ProjectMemoryEmbeddingProviderHealth = {
  status: Extract<ProjectMemorySemanticStatus, "available" | "unavailable" | "error">;
  reason?: string;
};

export type ProjectMemoryEmbeddingProvider = {
  providerId: string;
  modelId: string;
  dimensions: number;
  embeddingVersion: string;
  scope?: ProjectMemoryEmbeddingProviderScope;
  health: () => ProjectMemoryEmbeddingProviderHealth | Promise<ProjectMemoryEmbeddingProviderHealth>;
  embed: (text: string) => number[] | Promise<number[]>;
};

export type ProjectMemoryEmbeddingIndexRecord = {
  workspaceId: string;
  memoryId: string;
  providerId: string;
  modelId: string;
  embeddingVersion: string;
  dimensions: number;
  contentHash: string;
  vector: number[];
  memoryUpdatedAt: number;
  indexedAt: number;
};

export type ProjectMemoryRetrievalMode = "lexical" | "semantic" | "hybrid";

export type ProjectMemoryScoreComponents = {
  vectorScore: number | null;
  lexicalScore: number;
  tagScore: number;
  importanceBoost: number;
  recencyBoost: number;
  finalScore: number;
};

export type ProjectMemorySemanticCandidate = {
  memory: ProjectMemoryItem;
  retrievalMode: ProjectMemoryRetrievalMode;
  matchedFields: string[];
  score: ProjectMemoryScoreComponents;
};

export type ProjectMemorySemanticDiagnostics = {
  status: ProjectMemorySemanticStatus;
  providerId: string | null;
  modelId: string | null;
  fallbackReason: string | null;
  scannedCount: number;
  candidateCount: number;
};

export type ProjectMemorySemanticRetrievalResult = {
  status: ProjectMemorySemanticStatus;
  candidates: ProjectMemorySemanticCandidate[];
  diagnostics: ProjectMemorySemanticDiagnostics;
};

type BuildIndexParams = {
  workspaceId: string;
  memories: ProjectMemoryItem[];
  provider: ProjectMemoryEmbeddingProvider;
  allowTestProvider?: boolean;
  now?: number;
};

type RetrieveParams = BuildIndexParams & {
  query: string;
  topK?: number;
};

type ScoredMemoryInput = {
  memory: ProjectMemoryItem;
  relevanceScore: number;
};

const SEMANTIC_WEIGHTS = {
  vector: 0.62,
  lexical: 0.24,
  tag: 0.08,
  importance: 0.04,
  recency: 0.02,
};

function compactText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function appendDocumentField(lines: string[], label: string, value: string | null | undefined) {
  const compact = compactText(value);
  if (compact) {
    lines.push(`${label}: ${compact}`);
  }
}

export function buildProjectMemoryEmbeddingDocument(memory: ProjectMemoryItem): string {
  const lines: string[] = [];
  appendDocumentField(lines, "Title", memory.title);
  appendDocumentField(lines, "Summary", memory.summary);
  appendDocumentField(lines, "Tags", memory.tags.join(", "));
  appendDocumentField(lines, "Kind", memory.recordKind ?? memory.kind);
  appendDocumentField(lines, "User input", memory.userInput);
  appendDocumentField(lines, "Assistant thinking summary", memory.assistantThinkingSummary);
  appendDocumentField(lines, "Assistant response", memory.assistantResponse);
  appendDocumentField(lines, "Detail", memory.detail);
  appendDocumentField(lines, "Clean text", memory.cleanText);
  return lines.join("\n");
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildProjectMemoryEmbeddingContentHash(memory: ProjectMemoryItem): string {
  return stableHash(
    [
      `documentVersion=${PROJECT_MEMORY_EMBEDDING_DOCUMENT_VERSION}`,
      buildProjectMemoryEmbeddingDocument(memory),
    ].join("\n"),
  );
}

function vectorMagnitude(vector: number[]) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

export function normalizeEmbeddingVector(vector: number[]): number[] {
  const magnitude = vectorMagnitude(vector);
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    return [];
  }
  return vector.map((value) => value / magnitude);
}

function assertVectorDimensions(vector: number[], dimensions: number) {
  return vector.length === dimensions && vector.every((value) => Number.isFinite(value));
}

async function resolveProviderHealth(provider: ProjectMemoryEmbeddingProvider) {
  try {
    return await provider.health();
  } catch (error) {
    return {
      status: "error" as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function isTestProviderBlocked(
  provider: ProjectMemoryEmbeddingProvider,
  allowTestProvider: boolean | undefined,
) {
  return provider.scope === "test" && allowTestProvider !== true;
}

function unavailableResult(
  provider: ProjectMemoryEmbeddingProvider | null,
  fallbackReason: string,
): ProjectMemorySemanticRetrievalResult {
  return {
    status: "unavailable",
    candidates: [],
    diagnostics: {
      status: "unavailable",
      providerId: provider?.providerId ?? null,
      modelId: provider?.modelId ?? null,
      fallbackReason,
      scannedCount: 0,
      candidateCount: 0,
    },
  };
}

export function isProjectMemoryEmbeddingRecordStale(params: {
  memory: ProjectMemoryItem;
  record: ProjectMemoryEmbeddingIndexRecord;
  provider: ProjectMemoryEmbeddingProvider;
}) {
  return (
    params.record.workspaceId !== params.memory.workspaceId ||
    params.record.memoryId !== params.memory.id ||
    params.record.providerId !== params.provider.providerId ||
    params.record.modelId !== params.provider.modelId ||
    params.record.embeddingVersion !== params.provider.embeddingVersion ||
    params.record.dimensions !== params.provider.dimensions ||
    params.record.memoryUpdatedAt !== params.memory.updatedAt ||
    params.record.contentHash !== buildProjectMemoryEmbeddingContentHash(params.memory)
  );
}

export async function buildProjectMemoryEmbeddingIndex({
  workspaceId,
  memories,
  provider,
  allowTestProvider,
  now = Date.now(),
}: BuildIndexParams): Promise<{
  status: ProjectMemorySemanticStatus;
  records: ProjectMemoryEmbeddingIndexRecord[];
  fallbackReason: string | null;
}> {
  if (isTestProviderBlocked(provider, allowTestProvider)) {
    return {
      status: "unavailable",
      records: [],
      fallbackReason: "test_provider_not_allowed",
    };
  }

  const health = await resolveProviderHealth(provider);
  if (health.status !== "available") {
    return {
      status: health.status,
      records: [],
      fallbackReason: health.reason ?? "provider_unavailable",
    };
  }

  const eligibleMemories = memories.filter(
    (memory) =>
      memory.workspaceId === workspaceId &&
      !memory.deletedAt &&
      buildProjectMemoryEmbeddingDocument(memory).length > 0,
  );
  const records: ProjectMemoryEmbeddingIndexRecord[] = [];
  for (const memory of eligibleMemories) {
    const documentText = buildProjectMemoryEmbeddingDocument(memory);
    const rawVector = await provider.embed(documentText);
    if (!assertVectorDimensions(rawVector, provider.dimensions)) {
      return {
        status: "error",
        records: [],
        fallbackReason: "provider_dimension_mismatch",
      };
    }
    const vector = normalizeEmbeddingVector(rawVector);
    if (vector.length !== provider.dimensions) {
      continue;
    }
    records.push({
      workspaceId,
      memoryId: memory.id,
      providerId: provider.providerId,
      modelId: provider.modelId,
      embeddingVersion: provider.embeddingVersion,
      dimensions: provider.dimensions,
      contentHash: buildProjectMemoryEmbeddingContentHash(memory),
      vector,
      memoryUpdatedAt: memory.updatedAt,
      indexedAt: now,
    });
  }

  return {
    status: records.length === eligibleMemories.length ? "available" : "indexing",
    records,
    fallbackReason: records.length > 0 ? null : "empty_index",
  };
}

function dotProduct(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    sum += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return sum;
}

function scanProjectMemoryEmbeddingIndex(params: {
  queryVector: number[];
  records: ProjectMemoryEmbeddingIndexRecord[];
  memoriesById: Map<string, ProjectMemoryItem>;
  topK: number;
}) {
  return params.records
    .map((record) => {
      const memory = params.memoriesById.get(record.memoryId);
      if (!memory || record.dimensions !== params.queryVector.length) {
        return null;
      }
      return {
        memory,
        vectorScore: Math.max(0, dotProduct(params.queryVector, record.vector)),
      };
    })
    .filter((entry): entry is { memory: ProjectMemoryItem; vectorScore: number } => entry !== null)
    .sort((left, right) => right.vectorScore - left.vectorScore || left.memory.id.localeCompare(right.memory.id))
    .slice(0, params.topK);
}

function tagScore(memory: ProjectMemoryItem, queryTerms: string[]) {
  if (queryTerms.length === 0 || memory.tags.length === 0) {
    return 0;
  }
  const tagTerms = new Set(normalizeQueryTerms(memory.tags.join(" ")));
  const hits = queryTerms.filter((term) => tagTerms.has(term)).length;
  return hits / queryTerms.length;
}

function importanceBoost(memory: ProjectMemoryItem) {
  if (memory.importance === "high") {
    return 1;
  }
  if (memory.importance === "medium") {
    return 0.66;
  }
  if (memory.importance === "low") {
    return 0.33;
  }
  return 0;
}

function recencyBoost(memory: ProjectMemoryItem, newestUpdatedAt: number) {
  if (newestUpdatedAt <= 0 || memory.updatedAt <= 0) {
    return 0;
  }
  return Math.min(1, memory.updatedAt / newestUpdatedAt);
}

function matchedFields(memory: ProjectMemoryItem, queryTerms: string[]) {
  const fields: Array<[string, string]> = [
    ["title", memory.title],
    ["summary", memory.summary],
    ["tags", memory.tags.join(" ")],
    ["userInput", memory.userInput ?? ""],
    ["assistantThinkingSummary", memory.assistantThinkingSummary ?? ""],
    ["assistantResponse", memory.assistantResponse ?? ""],
    ["detail", memory.detail ?? ""],
    ["cleanText", memory.cleanText],
  ];
  return fields
    .filter(([, value]) => {
      const terms = new Set(normalizeQueryTerms(value));
      return queryTerms.some((term) => terms.has(term));
    })
    .map(([field]) => field);
}

function scoreCandidate(params: {
  memory: ProjectMemoryItem;
  queryTerms: string[];
  vectorScore: number | null;
  newestUpdatedAt: number;
}) {
  const lexicalScore = scoreMemoryRelevance(params.memory, params.queryTerms);
  const score = tagScore(params.memory, params.queryTerms);
  const importance = importanceBoost(params.memory);
  const recency = recencyBoost(params.memory, params.newestUpdatedAt);
  const vector = params.vectorScore ?? 0;
  const finalScore =
    vector * SEMANTIC_WEIGHTS.vector +
    lexicalScore * SEMANTIC_WEIGHTS.lexical +
    score * SEMANTIC_WEIGHTS.tag +
    importance * SEMANTIC_WEIGHTS.importance +
    recency * SEMANTIC_WEIGHTS.recency;
  return {
    vectorScore: params.vectorScore,
    lexicalScore,
    tagScore: score,
    importanceBoost: importance,
    recencyBoost: recency,
    finalScore,
  };
}

export function hybridRerankProjectMemories(params: {
  memories: ProjectMemoryItem[];
  query: string;
  semanticMatches?: Array<{ memory: ProjectMemoryItem; vectorScore: number }>;
  topK?: number;
}): ProjectMemorySemanticCandidate[] {
  const queryTerms = normalizeQueryTerms(params.query);
  const semanticById = new Map(
    (params.semanticMatches ?? []).map((entry) => [entry.memory.id, entry.vectorScore]),
  );
  const lexicalCandidates = params.memories.filter(
    (memory) => scoreMemoryRelevance(memory, queryTerms) > 0,
  );
  const candidatesById = new Map<string, ProjectMemoryItem>();
  for (const memory of lexicalCandidates) {
    candidatesById.set(memory.id, memory);
  }
  for (const entry of params.semanticMatches ?? []) {
    candidatesById.set(entry.memory.id, entry.memory);
  }

  const newestUpdatedAt = params.memories.reduce(
    (max, memory) => Math.max(max, memory.updatedAt),
    0,
  );
  return [...candidatesById.values()]
    .map((memory) => {
      const vectorScore = semanticById.get(memory.id) ?? null;
      const lexicalScore = scoreMemoryRelevance(memory, queryTerms);
      const retrievalMode: ProjectMemoryRetrievalMode =
        vectorScore != null && lexicalScore > 0
          ? "hybrid"
          : vectorScore != null
            ? "semantic"
            : "lexical";
      return {
        memory,
        retrievalMode,
        matchedFields: matchedFields(memory, queryTerms),
        score: scoreCandidate({
          memory,
          queryTerms,
          vectorScore,
          newestUpdatedAt,
        }),
      };
    })
    .sort(
      (left, right) =>
        right.score.finalScore - left.score.finalScore ||
        right.memory.updatedAt - left.memory.updatedAt ||
        left.memory.id.localeCompare(right.memory.id),
    )
    .slice(0, params.topK ?? PROJECT_MEMORY_SEMANTIC_DEFAULT_TOP_K);
}

export async function retrieveProjectMemorySemanticCandidates(
  params: RetrieveParams,
): Promise<ProjectMemorySemanticRetrievalResult> {
  const topK = params.topK ?? PROJECT_MEMORY_SEMANTIC_DEFAULT_TOP_K;
  if (isTestProviderBlocked(params.provider, params.allowTestProvider)) {
    return unavailableResult(params.provider, "test_provider_not_allowed");
  }

  const health = await resolveProviderHealth(params.provider);
  if (health.status !== "available") {
    return unavailableResult(params.provider, health.reason ?? "provider_unavailable");
  }

  try {
    const index = await buildProjectMemoryEmbeddingIndex(params);
    if (index.records.length === 0) {
      return {
        status: index.status,
        candidates: [],
        diagnostics: {
          status: index.status,
          providerId: params.provider.providerId,
          modelId: params.provider.modelId,
          fallbackReason: index.fallbackReason,
          scannedCount: 0,
          candidateCount: 0,
        },
      };
    }

    const rawQueryVector = await params.provider.embed(params.query);
    if (!assertVectorDimensions(rawQueryVector, params.provider.dimensions)) {
      return {
        status: "error",
        candidates: [],
        diagnostics: {
          status: "error",
          providerId: params.provider.providerId,
          modelId: params.provider.modelId,
          fallbackReason: "query_dimension_mismatch",
          scannedCount: index.records.length,
          candidateCount: 0,
        },
      };
    }

    const queryVector = normalizeEmbeddingVector(rawQueryVector);
    const memoriesById = new Map(params.memories.map((memory) => [memory.id, memory]));
    const semanticMatches = scanProjectMemoryEmbeddingIndex({
      queryVector,
      records: index.records,
      memoriesById,
      topK,
    });
    const candidates = hybridRerankProjectMemories({
      memories: params.memories,
      query: params.query,
      semanticMatches,
      topK,
    });
    const status = index.status === "indexing" ? "indexing" : "available";
    return {
      status,
      candidates,
      diagnostics: {
        status,
        providerId: params.provider.providerId,
        modelId: params.provider.modelId,
        fallbackReason: index.fallbackReason,
        scannedCount: index.records.length,
        candidateCount: candidates.length,
      },
    };
  } catch (error) {
    return {
      status: "error",
      candidates: [],
      diagnostics: {
        status: "error",
        providerId: params.provider.providerId,
        modelId: params.provider.modelId,
        fallbackReason: error instanceof Error ? error.message : String(error),
        scannedCount: 0,
        candidateCount: 0,
      },
    };
  }
}

export function semanticCandidatesToScoredMemories(
  candidates: ProjectMemorySemanticCandidate[],
): ScoredMemoryInput[] {
  return candidates.map((candidate) => ({
    memory: candidate.memory,
    relevanceScore: candidate.score.finalScore,
  }));
}
