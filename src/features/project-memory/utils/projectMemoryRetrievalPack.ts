import type { ProjectMemoryItem } from "../../../services/tauri";
import {
  resolveProjectMemoryCompactSummary,
  resolveProjectMemoryCompactTitle,
  resolveProjectMemoryDetailText,
} from "./projectMemoryDisplay";

export type ProjectMemoryRetrievalPackSource = "manual-selection" | "memory-scout";

export type ProjectMemoryRetrievalPackRecord = {
  index: string;
  memoryId: string;
  title: string;
  recordKind: string;
  sourceType: string;
  threadId: string | null;
  turnId: string | null;
  engine: string | null;
  updatedAt: number;
  userInput: string | null;
  assistantResponse: string | null;
  assistantThinkingSummary: string | null;
  detail: string | null;
  summary: string;
  truncatedFields: string[];
};

export type ProjectMemoryRetrievalPackCleanerResult = {
  cleanedContextText: string;
  relevantFacts: string[];
  irrelevantRecords: Array<{ index: string; reason: string }>;
  conflicts: string[];
  confidence: "high" | "medium" | "low";
  status: "cleaned" | "source_records_only" | "timeout" | "error";
};

export type ProjectMemoryRetrievalPack = {
  source: ProjectMemoryRetrievalPackSource;
  records: ProjectMemoryRetrievalPackRecord[];
  cleaner: ProjectMemoryRetrievalPackCleanerResult | null;
  truncated: boolean;
  diagnostics: {
    recordCount: number;
    injectedChars: number;
    truncatedRecordIndexes: string[];
  };
};

export type ParsedProjectMemoryPackSummary = {
  source: string;
  count: number;
  cleaned: boolean;
  truncated: boolean;
  cleanedContext: string;
  preview: string;
  lines: string[];
  rawPayload: string;
  records: Array<{ index: string; memoryId: string; title: string }>;
};

export const PROJECT_MEMORY_PACK_OPEN_TAG = "project-memory-pack";
export const DEFAULT_PACK_FIELD_CHAR_LIMIT = 1600;
export const DEFAULT_PACK_TOTAL_CHAR_LIMIT = 9000;

const PROJECT_MEMORY_PACK_PREFIX_REGEX =
  /^<project-memory-pack\b([^>]*)>([\s\S]*?)<\/project-memory-pack>\s*/i;

function stripUnsupportedControlChars(value: string) {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    const isUnsupportedControlChar =
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127;
    return isUnsupportedControlChar ? "" : character;
  }).join("");
}

function normalizeText(value: string | null | undefined) {
  return stripUnsupportedControlChars(value ?? "").trim();
}

function sanitizePackText(value: string) {
  return stripUnsupportedControlChars(value)
    .replace(/<\/project-memory-pack>/gi, "[project-memory-pack-close]")
    .replace(/<\/project-memory>/gi, "[project-memory-close]");
}

function resolveRecordKind(memory: ProjectMemoryItem) {
  return memory.recordKind ?? (
    memory.source === "conversation_turn" || memory.turnId ? "conversation_turn" : "legacy"
  );
}

function resolveDetailedFallback(memory: ProjectMemoryItem) {
  if (memory.userInput?.trim() || memory.assistantResponse?.trim()) {
    return null;
  }
  const detail = resolveProjectMemoryDetailText(memory);
  return normalizeText(detail) || null;
}

function truncateField(
  value: string | null,
  fieldName: string,
  maxChars: number,
  truncatedFields: string[],
) {
  if (!value) {
    return null;
  }
  if (value.length <= maxChars) {
    return value;
  }
  truncatedFields.push(fieldName);
  return `${value.slice(0, Math.max(0, maxChars - 24))}\n[truncated:${fieldName}]`;
}

function buildRecord(params: {
  memory: ProjectMemoryItem;
  index: string;
  fieldCharLimit: number;
}): ProjectMemoryRetrievalPackRecord {
  const truncatedFields: string[] = [];
  const memory = params.memory;
  const userInput = normalizeText(memory.userInput) || null;
  const assistantResponse = normalizeText(memory.assistantResponse) || null;
  const assistantThinkingSummary = normalizeText(memory.assistantThinkingSummary) || null;
  const detail = resolveDetailedFallback(memory);

  return {
    index: params.index,
    memoryId: memory.id,
    title: normalizeText(resolveProjectMemoryCompactTitle(memory)),
    recordKind: resolveRecordKind(memory),
    sourceType: memory.source,
    threadId: normalizeText(memory.threadId) || null,
    turnId: normalizeText(memory.turnId) || null,
    engine: normalizeText(memory.engine) || null,
    updatedAt: memory.updatedAt,
    userInput: truncateField(userInput, "userInput", params.fieldCharLimit, truncatedFields),
    assistantResponse: truncateField(
      assistantResponse,
      "assistantResponse",
      params.fieldCharLimit,
      truncatedFields,
    ),
    assistantThinkingSummary: truncateField(
      assistantThinkingSummary,
      "assistantThinkingSummary",
      Math.floor(params.fieldCharLimit / 2),
      truncatedFields,
    ),
    detail: truncateField(detail, "detail", params.fieldCharLimit, truncatedFields),
    summary: normalizeText(resolveProjectMemoryCompactSummary(memory)),
    truncatedFields,
  };
}

export function buildProjectMemorySourceRecords(params: {
  memories: ProjectMemoryItem[];
  startIndex?: number;
  fieldCharLimit?: number;
}): ProjectMemoryRetrievalPackRecord[] {
  const startIndex = params.startIndex ?? 1;
  const fieldCharLimit = params.fieldCharLimit ?? DEFAULT_PACK_FIELD_CHAR_LIMIT;
  return params.memories.map((memory, offset) =>
    buildRecord({
      memory,
      index: `[M${startIndex + offset}]`,
      fieldCharLimit,
    }),
  );
}

function formatRecord(record: ProjectMemoryRetrievalPackRecord) {
  const metadata = [
    `${record.index} memoryId=${sanitizePackText(record.memoryId)}`,
    `title=${sanitizePackText(record.title)}`,
    `recordKind=${sanitizePackText(record.recordKind)}`,
    `sourceType=${sanitizePackText(record.sourceType)}`,
    `threadId=${sanitizePackText(record.threadId ?? "null")}`,
    `turnId=${sanitizePackText(record.turnId ?? "null")}`,
    `engine=${sanitizePackText(record.engine ?? "null")}`,
    `updatedAt=${record.updatedAt}`,
  ];
  const lines = [metadata.join(" ")];
  if (record.truncatedFields.length > 0) {
    lines.push(`truncatedFields=${record.truncatedFields.join(",")}`);
  }
  if (record.summary) {
    lines.push("Summary:");
    lines.push(sanitizePackText(record.summary));
  }
  if (record.userInput) {
    lines.push("Original user input:");
    lines.push(sanitizePackText(record.userInput));
  }
  if (record.assistantThinkingSummary) {
    lines.push("Original assistant thinking summary:");
    lines.push(sanitizePackText(record.assistantThinkingSummary));
  }
  if (record.assistantResponse) {
    lines.push("Original assistant response:");
    lines.push(sanitizePackText(record.assistantResponse));
  }
  if (record.detail) {
    lines.push("Original memory detail:");
    lines.push(sanitizePackText(record.detail));
  }
  return lines.join("\n");
}

function formatCleanedContext(cleaner: ProjectMemoryRetrievalPackCleanerResult | null) {
  if (!cleaner || !cleaner.cleanedContextText.trim()) {
    return "- source records only";
  }
  return sanitizePackText(cleaner.cleanedContextText);
}

function formatConflicts(cleaner: ProjectMemoryRetrievalPackCleanerResult | null) {
  if (!cleaner || cleaner.conflicts.length === 0) {
    return "- none";
  }
  return cleaner.conflicts.map((conflict) => `- ${sanitizePackText(conflict)}`).join("\n");
}

function formatIrrelevantRecords(cleaner: ProjectMemoryRetrievalPackCleanerResult | null) {
  if (!cleaner || cleaner.irrelevantRecords.length === 0) {
    return "- none";
  }
  return cleaner.irrelevantRecords
    .map((record) => `- ${record.index}: ${sanitizePackText(record.reason)}`)
    .join("\n");
}

function extractMemoryIndexes(value: string) {
  return value.match(/\[M\d+\]/g) ?? [];
}

function isIndexScopedTextAccepted(value: string, acceptedIndexes: Set<string>) {
  const indexes = extractMemoryIndexes(value);
  return indexes.length === 0 || indexes.every((index) => acceptedIndexes.has(index));
}

function filterCleanerForRecords(
  cleaner: ProjectMemoryRetrievalPackCleanerResult | null | undefined,
  records: ProjectMemoryRetrievalPackRecord[],
): ProjectMemoryRetrievalPackCleanerResult | null {
  if (!cleaner) {
    return null;
  }
  const acceptedIndexes = new Set(records.map((record) => record.index));
  const relevantFacts = cleaner.relevantFacts.filter((fact) =>
    isIndexScopedTextAccepted(fact, acceptedIndexes),
  );
  const irrelevantRecords = cleaner.irrelevantRecords.filter((record) =>
    acceptedIndexes.has(record.index),
  );
  const conflicts = cleaner.conflicts.filter((conflict) =>
    isIndexScopedTextAccepted(conflict, acceptedIndexes),
  );
  const cleanedContextText = relevantFacts.length > 0
    ? relevantFacts.map((fact) => `- ${fact}`).join("\n")
    : cleaner.status === "cleaned"
      ? "- No relevant facts found in retained source records. Use source records only if relevant."
      : cleaner.cleanedContextText;
  return {
    ...cleaner,
    cleanedContextText,
    relevantFacts,
    irrelevantRecords,
    conflicts,
    confidence: relevantFacts.length > 0 ? cleaner.confidence : "low",
    status: cleaner.status === "cleaned" && relevantFacts.length === 0
      ? "source_records_only"
      : cleaner.status,
  };
}

export function buildProjectMemoryRetrievalPack(params: {
  source: ProjectMemoryRetrievalPackSource;
  records: ProjectMemoryRetrievalPackRecord[];
  cleaner?: ProjectMemoryRetrievalPackCleanerResult | null;
  totalCharLimit?: number;
}): ProjectMemoryRetrievalPack {
  const totalCharLimit = params.totalCharLimit ?? DEFAULT_PACK_TOTAL_CHAR_LIMIT;
  const acceptedRecords: ProjectMemoryRetrievalPackRecord[] = [];
  let usedChars = 0;
  let truncated = false;

  for (const record of params.records) {
    const formatted = formatRecord(record);
    const delta = formatted.length + 2;
    if (acceptedRecords.length > 0 && usedChars + delta > totalCharLimit) {
      truncated = true;
      break;
    }
    acceptedRecords.push(record);
    usedChars += delta;
  }

  if (acceptedRecords.length < params.records.length) {
    truncated = true;
  }
  if (acceptedRecords.some((record) => record.truncatedFields.length > 0)) {
    truncated = true;
  }

  const diagnostics = {
    recordCount: acceptedRecords.length,
    injectedChars: 0,
    truncatedRecordIndexes: acceptedRecords
      .filter((record) => record.truncatedFields.length > 0)
      .map((record) => record.index),
  };
  const pack = {
    source: params.source,
    records: acceptedRecords,
    cleaner: filterCleanerForRecords(params.cleaner, acceptedRecords),
    truncated,
    diagnostics,
  };
  diagnostics.injectedChars = formatProjectMemoryRetrievalPack(pack)?.length ?? 0;
  return pack;
}

export function formatProjectMemoryRetrievalPack(pack: ProjectMemoryRetrievalPack) {
  if (pack.records.length === 0) {
    return null;
  }
  const cleanerStatus = pack.cleaner?.status ?? "source_records_only";
  const cleaned = pack.cleaner?.status === "cleaned";
  return [
    `<project-memory-pack source="${pack.source}" count="${pack.records.length}" cleaned="${cleaned ? "true" : "false"}" cleanerStatus="${cleanerStatus}" truncated="${pack.truncated ? "true" : "false"}">`,
    "Cleaned Context:",
    formatCleanedContext(pack.cleaner),
    "",
    "Conflicts:",
    formatConflicts(pack.cleaner),
    "",
    "Irrelevant Records:",
    formatIrrelevantRecords(pack.cleaner),
    "",
    "Source Records:",
    ...pack.records.map(formatRecord),
    "",
    "Instruction:",
    "Use relevant records as prior project context.",
    "When applying a fact, preserve its [Mx] citation.",
    "If a record is irrelevant, ignore it explicitly.",
    "If records conflict, treat the conflict as uncertain context.",
    "</project-memory-pack>",
  ].join("\n");
}

function parseAttribute(attributes: string, name: string) {
  const match = new RegExp(`${name}="([^"]*)"`, "i").exec(attributes);
  return match?.[1] ?? "";
}

function parseRecordSummaries(body: string) {
  const records: ParsedProjectMemoryPackSummary["records"] = [];
  const recordRegex = /^(\[M\d+\])\s+memoryId=([^\s]+)(?:.*?\btitle=([^\n]+?))?(?:\s+recordKind=|\s+sourceType=|\s+threadId=|\s+turnId=|\s+engine=|\s+updatedAt=|\n)/gim;
  let match = recordRegex.exec(body);
  while (match) {
    records.push({
      index: match[1] ?? "",
      memoryId: match[2] ?? "",
      title: (match[3] ?? "").trim(),
    });
    match = recordRegex.exec(body);
  }
  return records;
}

function extractSection(body: string, heading: string) {
  const pattern = new RegExp(`${heading}:\\n([\\s\\S]*?)(?:\\n\\n[A-Z][A-Za-z ]+:|$)`, "i");
  const match = pattern.exec(body);
  return (match?.[1] ?? "").trim();
}

export function parseProjectMemoryRetrievalPackPrefix(
  text: string,
): { packSummary: ParsedProjectMemoryPackSummary; remainingText: string } | null {
  const normalized = text.trimStart();
  const match = normalized.match(PROJECT_MEMORY_PACK_PREFIX_REGEX);
  if (!match) {
    return null;
  }
  const attributes = match[1] ?? "";
  const body = match[2] ?? "";
  const records = parseRecordSummaries(body);
  const cleanedContext = extractSection(body, "Cleaned Context");
  const sourceLines = records.map((record) =>
    `${record.index} ${record.title || record.memoryId}`.trim(),
  );
  const cleanedLines = cleanedContext
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "- source records only");
  const lines = cleanedLines.length > 0 ? cleanedLines : sourceLines;
  const preview = lines.slice(0, 3).join("；");
  return {
    packSummary: {
      source: parseAttribute(attributes, "source"),
      count: Number.parseInt(parseAttribute(attributes, "count"), 10) || records.length,
      cleaned: parseAttribute(attributes, "cleaned") === "true",
      truncated: parseAttribute(attributes, "truncated") === "true",
      cleanedContext,
      preview,
      lines,
      rawPayload: match[0].trimEnd(),
      records,
    },
    remainingText: normalized.slice(match[0].length).trimStart(),
  };
}
