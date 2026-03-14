const TOOL_SNAPSHOT_TYPES = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "webSearch",
  "imageView",
  "collabToolCall",
  "collabAgentToolCall",
]);

const OUTPUT_CANDIDATE_KEYS = [
  "aggregatedOutput",
  "output",
  "result",
  "response",
  "stdout",
  "stderr",
  "text",
  "message",
  "content",
  "error",
];

function asString(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function extractOutputLikeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const merged = value
      .map((entry) => extractOutputLikeText(entry).trim())
      .filter(Boolean)
      .join("\n");
    return merged;
  }
  if (!value || typeof value !== "object") {
    return stringifyUnknown(value);
  }
  const record = value as Record<string, unknown>;
  for (const key of OUTPUT_CANDIDATE_KEYS) {
    const next = extractOutputLikeText(record[key]);
    if (next.trim()) {
      return next;
    }
  }
  return stringifyUnknown(record);
}

function getFirstToolOutput(source: Record<string, unknown>): string {
  for (const key of OUTPUT_CANDIDATE_KEYS) {
    const output = extractOutputLikeText(source[key]);
    if (output.trim()) {
      return output;
    }
  }
  return "";
}

function isMissingOutput(source: Record<string, unknown>): boolean {
  return getFirstToolOutput(source).trim().length === 0;
}

export function hydrateToolSnapshotWithEventParams(
  item: Record<string, unknown>,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const type = asString(item.type).trim();
  if (!type || !TOOL_SNAPSHOT_TYPES.has(type)) {
    return item;
  }
  if (!isMissingOutput(item)) {
    return item;
  }
  const outputFromParams = getFirstToolOutput(params);
  if (!outputFromParams.trim()) {
    return item;
  }
  if (type === "commandExecution") {
    return {
      ...item,
      aggregatedOutput: outputFromParams,
      output: outputFromParams,
    };
  }
  return {
    ...item,
    output: outputFromParams,
  };
}
