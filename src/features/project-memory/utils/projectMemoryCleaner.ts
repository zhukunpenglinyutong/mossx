import { normalizeQueryTerms } from "./memoryContextInjection";
import type {
  ProjectMemoryRetrievalPackCleanerResult,
  ProjectMemoryRetrievalPackRecord,
} from "./projectMemoryRetrievalPack";

const ENABLED_MARKERS = ["enable", "enabled", "开启", "启用", "true", "yes", "允许"];
const DISABLED_MARKERS = ["disable", "disabled", "关闭", "禁用", "false", "no", "禁止"];

function compactText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function buildSearchText(record: ProjectMemoryRetrievalPackRecord) {
  return [
    record.title,
    record.summary,
    record.userInput,
    record.assistantThinkingSummary,
    record.assistantResponse,
    record.detail,
  ]
    .map((value) => compactText(value))
    .filter(Boolean)
    .join(" ");
}

function scoreRecord(record: ProjectMemoryRetrievalPackRecord, queryTerms: string[]) {
  if (queryTerms.length === 0) {
    return 1;
  }
  const recordTerms = new Set(normalizeQueryTerms(buildSearchText(record)));
  let hits = 0;
  for (const term of queryTerms) {
    if (recordTerms.has(term)) {
      hits += 1;
    }
  }
  return hits / queryTerms.length;
}

function resolveFactText(record: ProjectMemoryRetrievalPackRecord) {
  return (
    compactText(record.assistantResponse) ||
    compactText(record.detail) ||
    compactText(record.assistantThinkingSummary) ||
    compactText(record.summary) ||
    compactText(record.userInput) ||
    compactText(record.title)
  );
}

function detectPolarity(text: string) {
  const normalized = text.toLowerCase();
  return {
    enabled: ENABLED_MARKERS.some((marker) => normalized.includes(marker)),
    disabled: DISABLED_MARKERS.some((marker) => normalized.includes(marker)),
  };
}

function detectConflicts(records: ProjectMemoryRetrievalPackRecord[]) {
  const conflicts: string[] = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex];
      const right = records[rightIndex];
      if (!left || !right) {
        continue;
      }
      const leftPolarity = detectPolarity(buildSearchText(left));
      const rightPolarity = detectPolarity(buildSearchText(right));
      const polarityConflict =
        (leftPolarity.enabled && rightPolarity.disabled) ||
        (leftPolarity.disabled && rightPolarity.enabled);
      if (polarityConflict) {
        conflicts.push(`${left.index} conflicts with ${right.index}: ${left.title} / ${right.title}`);
      }
    }
  }
  return conflicts;
}

function resolveConfidence(relevantCount: number, totalCount: number) {
  if (totalCount === 0 || relevantCount === 0) {
    return "low";
  }
  if (relevantCount === totalCount) {
    return "high";
  }
  return "medium";
}

export function cleanProjectMemoryRecordsForRequest(params: {
  userText: string;
  records: ProjectMemoryRetrievalPackRecord[];
}): ProjectMemoryRetrievalPackCleanerResult {
  const queryTerms = normalizeQueryTerms(params.userText);
  const relevantFacts: string[] = [];
  const irrelevantRecords: ProjectMemoryRetrievalPackCleanerResult["irrelevantRecords"] = [];

  for (const record of params.records) {
    const score = scoreRecord(record, queryTerms);
    const isRelevant = queryTerms.length === 0 || score > 0;
    if (!isRelevant) {
      irrelevantRecords.push({
        index: record.index,
        reason: "No lexical overlap with the visible user request.",
      });
      continue;
    }
    const factText = resolveFactText(record);
    if (factText) {
      relevantFacts.push(`${record.index} ${factText}`);
    }
  }

  const conflicts = detectConflicts(params.records);
  const cleanedContextText =
    relevantFacts.length > 0
      ? relevantFacts.map((fact) => `- ${fact}`).join("\n")
      : "- No relevant facts found. Use source records only if the user explicitly asks about them.";

  return {
    cleanedContextText,
    relevantFacts,
    irrelevantRecords,
    conflicts,
    confidence: resolveConfidence(relevantFacts.length, params.records.length),
    status: relevantFacts.length > 0 ? "cleaned" : "source_records_only",
  };
}

export function buildProjectMemoryCleanerFailureResult(params: {
  status: "timeout" | "error";
  records: ProjectMemoryRetrievalPackRecord[];
}): ProjectMemoryRetrievalPackCleanerResult {
  return {
    cleanedContextText: "- Memory Cleaner unavailable. Use source records only if relevant.",
    relevantFacts: [],
    irrelevantRecords: [],
    conflicts: [],
    confidence: params.records.length > 0 ? "low" : "low",
    status: params.status,
  };
}
