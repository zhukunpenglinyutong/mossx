import type { ConversationItem } from "../../types";
import {
  inferFileChangesFromCommandExecutionArtifacts,
  inferFileChangesFromPayload,
} from "../../utils/threadItemsFileChanges";
import {
  buildCommandSummary,
  extractToolName,
  getFileName,
  getFirstStringField,
  isBashTool,
  parseToolArgs,
  resolveToolStatus,
} from "../messages/components/toolBlocks/toolConstants";

export type OperationCommandSummary = {
  id: string;
  command: string;
  status: "running" | "completed" | "error";
};

export type OperationFileChangeSummary = {
  filePath: string;
  fileName: string;
  status: "A" | "D" | "R" | "M";
  additions: number;
  deletions: number;
  diff?: string;
};

export type OperationFileChangeEventSummary = {
  summary: string;
  filePath?: string;
  fileCount: number;
  additions: number;
  deletions: number;
  statusLetter?: "A" | "D" | "R" | "M";
};

export type OperationFileChangeEventDetails = OperationFileChangeEventSummary & {
  entries: OperationFileChangeSummary[];
};

const FILE_CHANGE_TOOL_HINTS = [
  "replace",
  "edit",
  "write",
  "patch",
  "apply",
  "delete",
  "remove",
  "unlink",
];
const FILE_CHANGE_PATH_KEYS = [
  "file_path",
  "filePath",
  "filepath",
  "path",
  "target_file",
  "targetFile",
  "filename",
  "file",
];
const MAX_FILE_PATH_INFERENCE_DEPTH = 6;

export function extractCommandSummaries(
  items: ConversationItem[],
  options: { isCodexEngine?: boolean } = {},
): OperationCommandSummary[] {
  const { isCodexEngine = false } = options;
  const result: OperationCommandSummary[] = [];
  for (const item of items) {
    if (item.kind !== "tool") {
      continue;
    }
    const toolName = extractToolName(item.title);
    if (item.toolType !== "commandExecution" && !isBashTool(toolName)) {
      continue;
    }
    const summaryCommand = buildCommandSummary(item, { includeDetail: false });
    const command = isCodexEngine
      ? summaryCommand
      : summaryCommand || item.detail.trim();
    const resolved = resolveToolStatus(item.status, Boolean(item.output));
    result.push({
      id: item.id,
      command,
      status:
        resolved === "failed"
          ? "error"
          : resolved === "completed"
            ? "completed"
            : "running",
    });
  }
  return result;
}

export function extractFileChangeSummaries(items: ConversationItem[]): OperationFileChangeSummary[] {
  const seen = new Map<string, OperationFileChangeSummary>();
  for (const item of items) {
    if (item.kind !== "tool") {
      continue;
    }
    for (const change of extractFileChangeEntriesFromToolItem(item)) {
      const normalizedKey = toFileChangePathKey(change.filePath);
      const existing = seen.get(normalizedKey);
      if (!existing) {
        seen.set(normalizedKey, { ...change });
        continue;
      }
      existing.additions += change.additions;
      existing.deletions += change.deletions;
      existing.status = mergeFileStatus(existing.status, change.status);
      existing.diff = mergeDiffFragments(existing.diff, change.diff);
    }
  }
  return Array.from(seen.values());
}

export function extractFileChangeEntriesFromToolItem(
  item: Extract<ConversationItem, { kind: "tool" }>,
): OperationFileChangeSummary[] {
  if (shouldIgnoreReadOnlyToolFileChanges(item)) {
    return [];
  }
  const seen = new Map<string, OperationFileChangeSummary>();
  const changes = item.changes ?? [];
  const parsedArgs = parseToolArgs(item.detail);
  const inputArgs = asRecord(parsedArgs?.input);
  const nestedArgs = asRecord(parsedArgs?.arguments);
  const candidateArgs = [parsedArgs, inputArgs, nestedArgs].filter(
    (entry): entry is Record<string, unknown> => Boolean(entry),
  );
  if (changes.length === 0) {
    const isCommandTool = shouldInferCommandToolChanges(item);
    const commandSummary = isCommandTool
      ? buildCommandSummary(
          { title: item.title, detail: item.detail, toolType: "commandExecution" },
          { includeDetail: false },
        )
      : "";
    const commandInferredChanges = isCommandTool
      ? inferFileChangesFromCommandExecutionArtifacts(
          commandSummary,
          item.output ?? "",
        )
      : [];
    const payloadInferredChanges = isCommandTool
      ? []
      : inferFileChangesFromPayload([
          parsedArgs,
          inputArgs,
          nestedArgs,
          item.detail,
          item.output ?? "",
        ]);
    const inferredChanges = mergeInferredChangesByPath(
      payloadInferredChanges,
      commandInferredChanges,
    );
    if (inferredChanges.length > 0) {
      for (const inferredChange of inferredChanges) {
        const filePath = normalizeFileChangePath(inferredChange.path);
        if (!filePath || (isCommandTool && !isReliableCommandInferredChange(inferredChange))) {
          continue;
        }
        const contextStatus = inferStatusLetterFromToolContext(item.title);
        const entryStatus = normalizeFileStatus(inferredChange.kind);
        const status =
          (entryStatus === "M" && contextStatus && contextStatus !== "M"
            ? contextStatus
            : entryStatus) ??
          contextStatus ??
          "M";
        const stats = collectDiffStats(inferredChange.diff);
        mergeOperationFileChangeEntry(seen, {
          filePath,
          fileName: getFileName(filePath),
          status,
          additions: stats.additions,
          deletions: stats.deletions,
          diff: inferredChange.diff?.trim() || undefined,
        });
      }
      return Array.from(seen.values());
    }
    if (isCommandTool) {
      return [];
    }
    const deepArgPathHint = getFirstPathFromSources(candidateArgs);
    const titlePathHint = extractLikelyPathFromTitle(item.title);
    const payloadPathHint =
      getFirstPathFromUnknown(item.detail, 0, true) ||
      getFirstPathFromUnknown(item.output ?? "", 0, true);
    const fallbackPath =
      getFirstStringFieldFromSources(candidateArgs, FILE_CHANGE_PATH_KEYS) ||
      deepArgPathHint ||
      titlePathHint ||
      payloadPathHint ||
      "";
    if (!fallbackPath) {
      return [];
    }
    let additions = 0;
    let deletions = 0;
    for (const args of candidateArgs) {
      const stats = collectDiffStatsFromArgs(args);
      additions += stats.additions;
      deletions += stats.deletions;
      if (additions > 0 || deletions > 0) {
        break;
      }
    }
    if (additions === 0 && deletions === 0) {
      const fallback = collectDiffStats(item.output);
      additions = fallback.additions;
      deletions = fallback.deletions;
    }
    mergeOperationFileChangeEntry(seen, {
      filePath: normalizeFileChangePath(fallbackPath),
      fileName: getFileName(fallbackPath),
      status: inferStatusLetterFromToolContext(item.title) ?? "M",
      additions,
      deletions,
    });
    return Array.from(seen.values());
  }

  for (const change of changes) {
    const filePath = normalizeFileChangePath(change.path);
    if (!filePath) {
      continue;
    }
    const directStats = collectDiffStats(change.diff);
    const fallbackStats =
      directStats.additions === 0 &&
      directStats.deletions === 0 &&
      changes.length === 1
        ? collectSingleChangeFallbackStats(candidateArgs, filePath, item.output)
        : { additions: 0, deletions: 0 };
    const additions =
      directStats.additions === 0 && directStats.deletions === 0
        ? fallbackStats.additions
        : directStats.additions;
    const deletions =
      directStats.additions === 0 && directStats.deletions === 0
        ? fallbackStats.deletions
        : directStats.deletions;
    mergeOperationFileChangeEntry(seen, {
      filePath,
      fileName: getFileName(filePath),
      status:
        normalizeFileStatus(change.kind) ??
        inferStatusLetterFromToolContext(item.title) ??
        "M",
      additions,
      deletions,
      diff: change.diff?.trim() || undefined,
    });
  }
  return Array.from(seen.values());
}

function mergeFileStatus(
  current: OperationFileChangeSummary["status"],
  incoming: OperationFileChangeSummary["status"],
): OperationFileChangeSummary["status"] {
  if (incoming === "A") {
    return "A";
  }
  if (incoming === "D") {
    return current === "A" ? current : "D";
  }
  if (incoming === "R") {
    return current === "A" || current === "D" ? current : "R";
  }
  return current;
}

function mergeInferredChangesByPath(
  primary: Array<{ path: string; kind?: string; diff?: string }>,
  secondary: Array<{ path: string; kind?: string; diff?: string }>,
) {
  const mergedByPath = new Map<string, { path: string; kind?: string; diff?: string }>();
  const mergeEntry = (entry: { path: string; kind?: string; diff?: string }) => {
    const normalizedPath = normalizeFileChangePath(entry.path);
    if (!normalizedPath) {
      return;
    }
    const existing = mergedByPath.get(normalizedPath);
    if (!existing) {
      mergedByPath.set(normalizedPath, {
        path: normalizedPath,
        kind: entry.kind,
        diff: entry.diff,
      });
      return;
    }
    const existingStatus = normalizeFileStatus(existing.kind);
    const incomingStatus = normalizeFileStatus(entry.kind);
    if (
      (!existingStatus && incomingStatus) ||
      (existingStatus === "M" && incomingStatus && incomingStatus !== "M")
    ) {
      existing.kind = entry.kind;
    }
    existing.diff = mergeDiffFragments(existing.diff, entry.diff);
  };
  primary.forEach(mergeEntry);
  secondary.forEach(mergeEntry);
  return Array.from(mergedByPath.values());
}

function shouldInferCommandToolChanges(
  item: Extract<ConversationItem, { kind: "tool" }>,
) {
  const normalizedToolType = item.toolType.trim().toLowerCase();
  if (normalizedToolType === "commandexecution") {
    return true;
  }
  if (isBashTool(normalizedToolType)) {
    return true;
  }
  const extractedToolName = extractToolName(item.title);
  return isBashTool(extractedToolName);
}

function shouldIgnoreReadOnlyToolFileChanges(
  item: Extract<ConversationItem, { kind: "tool" }>,
) {
  const normalizedToolType = item.toolType.trim().toLowerCase();
  const normalizedToolName = extractToolName(item.title).trim().toLowerCase();
  const signature = `${normalizedToolType} ${normalizedToolName}`.trim();
  return (
    normalizedToolType.includes("search") ||
    normalizedToolName.includes("search") ||
    normalizedToolType.includes("read") ||
    normalizedToolName.includes("read") ||
    normalizedToolType.includes("glob") ||
    normalizedToolName.includes("glob") ||
    signature.includes("read_file") ||
    signature.includes("read file") ||
    signature.includes("search_query") ||
    signature.includes("search query") ||
    signature.includes("web_search") ||
    signature.includes("glob") ||
    signature.includes("grep") ||
    signature.includes("rg --files")
  );
}

function mergeDiffFragments(primary?: string, secondary?: string): string | undefined {
  const left = primary?.trim() ?? "";
  const right = secondary?.trim() ?? "";
  if (!left) {
    return right || undefined;
  }
  if (!right) {
    return left;
  }
  if (left === right || left.includes(right)) {
    return left;
  }
  if (right.includes(left)) {
    return right;
  }

  const leftParts = splitDiffFragments(left);
  const rightParts = splitDiffFragments(right);
  const mergedPrelude = pickPreferredPrelude(leftParts.prelude, rightParts.prelude);
  const mergedHunks = uniqueStringList([...leftParts.hunks, ...rightParts.hunks]);

  if (mergedHunks.length > 0) {
    return [mergedPrelude, ...mergedHunks].filter(Boolean).join("\n");
  }

  return right.length > left.length ? right : left;
}

export function summarizeFileChangeItem(
  item: Extract<ConversationItem, { kind: "tool" }>,
): OperationFileChangeEventSummary | null {
  const details = extractFileChangeEventDetails(item);
  if (!details) {
    return null;
  }
  return {
    summary: details.summary,
    filePath: details.filePath,
    fileCount: details.fileCount,
    additions: details.additions,
    deletions: details.deletions,
    statusLetter: details.statusLetter,
  };
}

export function extractFileChangeEventDetails(
  item: Extract<ConversationItem, { kind: "tool" }>,
): OperationFileChangeEventDetails | null {
  const changes = item.changes ?? [];
  const parsedArgs = parseToolArgs(item.detail);
  const inputArgs = asRecord(parsedArgs?.input);
  const nestedArgs = asRecord(parsedArgs?.arguments);
  const candidateArgs = [parsedArgs, inputArgs, nestedArgs].filter(
    (entry): entry is Record<string, unknown> => Boolean(entry),
  );
  const deepArgPathHint = getFirstPathFromSources(candidateArgs);
  const titlePathHint = extractLikelyPathFromTitle(item.title);
  const payloadPathHint =
    getFirstPathFromUnknown(item.detail, 0, true) ||
    getFirstPathFromUnknown(item.output ?? "", 0, true);
  const hasFileChangeArgHints = candidateArgs.some(isLikelyFileChangeArgs);
  const hasToolHint = isLikelyFileChangeTool(item.title);
  const shouldTreatAsFileChange =
    item.toolType === "fileChange" ||
    changes.length > 0 ||
    (hasToolHint &&
      (hasFileChangeArgHints ||
        Boolean(deepArgPathHint) ||
        Boolean(titlePathHint) ||
        Boolean(payloadPathHint)));
  if (!shouldTreatAsFileChange) {
    return null;
  }

  const entries = extractFileChangeEntriesFromToolItem(item);
  const primaryEntry = entries[0];

  const primaryPath =
    primaryEntry?.filePath ||
    changes[0]?.path ||
    getFirstStringFieldFromSources(candidateArgs, FILE_CHANGE_PATH_KEYS) ||
    deepArgPathHint ||
    titlePathHint ||
    payloadPathHint ||
    "";
  const fileName = getFileName(primaryPath) || primaryPath || "Pending changes";
  let additions = 0;
  let deletions = 0;
  if (entries.length > 0) {
    for (const entry of entries) {
      additions += entry.additions;
      deletions += entry.deletions;
    }
  } else {
    if (changes.length > 0) {
      for (const change of changes) {
        const stats = collectDiffStats(change.diff);
        additions += stats.additions;
        deletions += stats.deletions;
      }
      if (additions === 0 && deletions === 0) {
        const fallback = collectSingleChangeFallbackStats(
          candidateArgs,
          changes.length === 1 ? primaryPath : "",
          item.output,
        );
        additions = fallback.additions;
        deletions = fallback.deletions;
      }
    } else {
      for (const args of candidateArgs) {
        const stats = collectDiffStatsFromArgs(args);
        additions += stats.additions;
        deletions += stats.deletions;
        if (additions > 0 || deletions > 0) {
          break;
        }
      }
      if (additions === 0 && deletions === 0) {
        const fallback = collectDiffStats(item.output);
        additions = fallback.additions;
        deletions = fallback.deletions;
      }
    }
  }
  const fileCount = entries.length > 0 ? entries.length : Math.max(changes.length, 1);
  const extraCount = Math.max(0, fileCount - 1);
  const summaryBase = extraCount > 0 ? `${fileName} +${extraCount}` : fileName;
  return {
    summary: `File change · ${summaryBase}`,
    filePath: primaryPath || undefined,
    fileCount,
    additions,
    deletions,
    statusLetter: primaryEntry?.status ??
      normalizeFileStatus(changes[0]?.kind) ??
      inferStatusLetterFromToolContext(item.title) ??
      "M",
    entries,
  };
}

function mergeOperationFileChangeEntry(
  seen: Map<string, OperationFileChangeSummary>,
  entry: OperationFileChangeSummary,
) {
  const normalizedKey = toFileChangePathKey(entry.filePath);
  const existing = seen.get(normalizedKey);
  if (!existing) {
    seen.set(normalizedKey, { ...entry });
    return;
  }
  existing.additions += entry.additions;
  existing.deletions += entry.deletions;
  existing.status = mergeFileStatus(existing.status, entry.status);
  existing.diff = mergeDiffFragments(existing.diff, entry.diff);
}

function isLikelyFileChangeTool(title: string): boolean {
  const toolName = extractToolName(title).trim().toLowerCase();
  if (!toolName || isBashTool(toolName)) {
    return false;
  }
  if (toolName === "todowrite" || toolName === "todo_write") {
    return false;
  }
  return FILE_CHANGE_TOOL_HINTS.some((hint) => toolName.includes(hint));
}

function inferStatusLetterFromToolContext(title: string): "A" | "D" | "R" | "M" | null {
  const normalized = extractToolName(title).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("delete") ||
    normalized.includes("remove") ||
    normalized.includes("unlink")
  ) {
    return "D";
  }
  if (normalized.includes("rename") || normalized.includes("move")) {
    return "R";
  }
  if (
    normalized.includes("write") ||
    normalized.includes("create") ||
    normalized.includes("add")
  ) {
    return "A";
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("replace") ||
    normalized.includes("patch")
  ) {
    return "M";
  }
  return null;
}

function isLikelyFileChangeArgs(args: Record<string, unknown>) {
  const path =
    getFirstStringFieldCaseInsensitive(args, FILE_CHANGE_PATH_KEYS) ||
    getFirstPathFromUnknown(args);
  if (path) {
    return true;
  }
  if (getFirstStringFieldCaseInsensitive(args, ["old_string", "oldString"])) {
    return true;
  }
  if (getFirstStringFieldCaseInsensitive(args, ["new_string", "newString"])) {
    return true;
  }
  if (getFirstStringFieldCaseInsensitive(args, ["content", "new_content", "newContent"])) {
    return true;
  }
  return false;
}

function getFirstPathFromSources(sources: Record<string, unknown>[]): string {
  for (const source of sources) {
    const path = getFirstPathFromUnknown(source, 0, false);
    if (path) {
      return path;
    }
  }
  return "";
}

function getFirstStringFieldFromSources(
  sources: Record<string, unknown>[],
  keys: string[],
): string {
  for (const source of sources) {
    const direct = getFirstStringField(source, keys);
    if (direct) {
      return direct;
    }
    const ci = getFirstStringFieldCaseInsensitive(source, keys);
    if (ci) {
      return ci;
    }
  }
  return "";
}

function getFirstStringFieldCaseInsensitive(
  source: Record<string, unknown>,
  keys: string[],
): string {
  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(source)) {
    lowered.set(key.toLowerCase(), value);
  }
  for (const key of keys) {
    const value = lowered.get(key.toLowerCase());
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function isPathLikeToken(token: string): boolean {
  const normalized = token.trim();
  if (!normalized) {
    return false;
  }
  if (isStructuredFieldPathToken(normalized)) {
    return false;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)) {
    return false;
  }
  if (
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(normalized) ||
    /\.[A-Za-z0-9]{1,16}$/.test(normalized)
  ) {
    return true;
  }
  return false;
}

function isStructuredFieldPathToken(token: string) {
  if (
    token.includes("/") ||
    token.includes("\\") ||
    token.startsWith("./") ||
    token.startsWith("../") ||
    /^[A-Za-z]:[\\/]/.test(token)
  ) {
    return false;
  }
  if (!token.includes(".")) {
    return false;
  }
  const segments = token.split(".");
  if (segments.length < 2) {
    return false;
  }
  if (!segments.every((segment) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(segment))) {
    return false;
  }
  return segments.some((segment) => /[A-Z_]/.test(segment));
}

function getFirstPathFromUnknown(
  value: unknown,
  depth = 0,
  allowLooseStringMatch = false,
): string {
  if (depth > MAX_FILE_PATH_INFERENCE_DEPTH || value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    if (!allowLooseStringMatch) {
      return "";
    }
    const direct = value.trim();
    if (!direct) {
      return "";
    }
    if (isPathLikeToken(direct)) {
      return direct;
    }
    const inferred = extractLikelyPathFromTitle(direct);
    return inferred && isPathLikeToken(inferred) ? inferred : "";
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const fromEntry = getFirstPathFromUnknown(
        entry,
        depth + 1,
        allowLooseStringMatch,
      );
      if (fromEntry) {
        return fromEntry;
      }
    }
    return "";
  }
  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const lowered = new Map<string, unknown>();
  for (const [key, entry] of Object.entries(record)) {
    lowered.set(key.toLowerCase(), entry);
  }
  for (const key of FILE_CHANGE_PATH_KEYS) {
    const candidate = lowered.get(key.toLowerCase());
    const path = getFirstPathFromUnknown(candidate, depth + 1, true);
    if (path) {
      return path;
    }
  }

  for (const entry of Object.values(record)) {
    const path = getFirstPathFromUnknown(entry, depth + 1, false);
    if (path) {
      return path;
    }
  }
  return "";
}

function extractLikelyPathFromTitle(title: string): string {
  const normalized = title.replace(/^(?:Tool|Command):\s*/i, "").trim();
  if (!normalized) {
    return "";
  }
  const tail = normalized.includes("/") ? normalized.split("/").pop() ?? normalized : normalized;
  const tokens = tail
    .split(/\s+/)
    .map((token) => token.replace(/^[('"`]+|[)'",;:.!?`]+$/g, "").trim())
    .filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (
      token.includes("/") ||
      token.includes("\\") ||
      token.startsWith("./") ||
      token.startsWith("../") ||
      /^[A-Za-z]:[\\/]/.test(token) ||
      /\.[A-Za-z0-9]{1,8}$/.test(token)
    ) {
      return token;
    }
  }
  return "";
}

function normalizeFileStatus(kind?: string): "A" | "D" | "R" | "M" | null {
  const normalized = (kind ?? "").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized.includes("add") ||
    normalized.includes("create") ||
    normalized.includes("new")
  ) {
    return "A";
  }
  if (normalized.includes("delete") || normalized.includes("remove")) {
    return "D";
  }
  if (normalized.includes("rename") || normalized.includes("move")) {
    return "R";
  }
  return "M";
}

function collectDiffStats(diff?: string) {
  if (!diff) {
    return { additions: 0, deletions: 0 };
  }
  let additions = 0;
  let deletions = 0;
  const lines = diff.split("\n");
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }
  return { additions, deletions };
}

function collectSingleChangeFallbackStats(
  candidateArgs: Record<string, unknown>[],
  expectedPath: string,
  output?: string,
) {
  for (const args of candidateArgs) {
    const pathHint =
      getFirstStringField(args, FILE_CHANGE_PATH_KEYS) ||
      getFirstStringFieldCaseInsensitive(args, FILE_CHANGE_PATH_KEYS);
    if (pathHint && expectedPath && !pathHintMatches(pathHint, expectedPath)) {
      continue;
    }
    const stats = collectDiffStatsFromArgs(args);
    if (stats.additions > 0 || stats.deletions > 0) {
      return stats;
    }
  }
  return collectDiffStats(output);
}

function collectDiffStatsFromArgs(args: Record<string, unknown>) {
  const oldString = getFirstStringFieldCaseInsensitive(args, ["old_string", "oldString"]);
  const newString = getFirstStringFieldCaseInsensitive(args, ["new_string", "newString"]);
  if (oldString || newString) {
    return computeLineDelta(oldString, newString);
  }
  const content = getFirstStringFieldCaseInsensitive(args, [
    "content",
    "new_content",
    "newContent",
  ]);
  if (content) {
    return { additions: content.split("\n").length, deletions: 0 };
  }
  const diff = getFirstStringFieldCaseInsensitive(args, ["diff", "patch", "unified_diff"]);
  if (diff) {
    return collectDiffStats(diff);
  }
  return { additions: 0, deletions: 0 };
}

function computeLineDelta(oldString: string, newString: string) {
  const oldCount = countContentLines(oldString);
  const newCount = countContentLines(newString);
  if (oldCount === 0 && newCount === 0) {
    return { additions: 0, deletions: 0 };
  }
  if (oldCount === 0) {
    return { additions: newCount, deletions: 0 };
  }
  if (newCount === 0) {
    return { additions: 0, deletions: oldCount };
  }
  if (oldString !== newString && oldCount === newCount) {
    return { additions: 1, deletions: 1 };
  }
  const diff = newCount - oldCount;
  if (diff >= 0) {
    return { additions: diff || 1, deletions: 0 };
  }
  return { additions: 0, deletions: -diff };
}

function countContentLines(value: string): number {
  if (!value) {
    return 0;
  }
  return value.split("\n").length;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

function normalizeFileChangePath(path: string): string {
  const normalized = normalizePath(path)
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .replace(/\/+$/, "");
  return isPlausibleFileChangePath(normalized) ? normalized : "";
}

function toFileChangePathKey(path: string): string {
  return normalizeFileChangePath(path);
}

function isReliableCommandInferredChange(entry: { path: string; kind?: string; diff?: string }) {
  if (!isPlausibleFileChangePath(entry.path)) {
    return false;
  }
  const normalizedKind = normalizeFileStatus(entry.kind);
  if (entry.diff?.trim()) {
    return true;
  }
  return normalizedKind === "A" || normalizedKind === "D" || normalizedKind === "R";
}

function isPlausibleFileChangePath(path: string) {
  const normalized = path.trim();
  if (!normalized) {
    return false;
  }
  if (
    normalized.includes("|") ||
    normalized.includes("{") ||
    normalized.includes("}") ||
    normalized.includes(",") ||
    normalized.includes("\n") ||
    normalized.includes("\r") ||
    /(^|[\\/])\.\.?$/.test(normalized)
  ) {
    return false;
  }
  if (/^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(normalized)) {
    return false;
  }
  if (/\s(?:cat|grep|rg|find|head|tail|sed|awk|xargs|tee|wc|less|more)\b/i.test(normalized)) {
    return false;
  }
  if (/[()[\]]/.test(normalized)) {
    return false;
  }
  if (/[*?]/.test(normalized)) {
    return false;
  }
  if (/^\*.+["'}]?$/.test(normalized)) {
    return false;
  }
  if (/["'}]$/.test(normalized) && !/\.[A-Za-z0-9]{1,16}$/.test(normalized.replace(/["'}]+$/, ""))) {
    return false;
  }
  return true;
}

function splitDiffFragments(diff: string) {
  const normalized = diff.trim();
  if (!normalized) {
    return { prelude: "", hunks: [] as string[] };
  }
  const lines = normalized.split("\n");
  const firstHunkIndex = lines.findIndex((line) => line.startsWith("@@"));
  if (firstHunkIndex < 0) {
    return { prelude: normalized, hunks: [] as string[] };
  }

  const prelude = lines.slice(0, firstHunkIndex).join("\n").trim();
  const hunks: string[] = [];
  let currentHunk: string[] = [];

  for (let index = firstHunkIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("@@") && currentHunk.length > 0) {
      hunks.push(currentHunk.join("\n").trim());
      currentHunk = [line];
      continue;
    }
    currentHunk.push(line);
  }

  if (currentHunk.length > 0) {
    hunks.push(currentHunk.join("\n").trim());
  }

  return {
    prelude,
    hunks: hunks.filter(Boolean),
  };
}

function pickPreferredPrelude(primary: string, secondary: string) {
  if (!primary) {
    return secondary;
  }
  if (!secondary) {
    return primary;
  }
  return primary.length >= secondary.length ? primary : secondary;
}

function uniqueStringList(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function pathHintMatches(pathHint: string, targetPath: string): boolean {
  const normalizedHint = normalizePath(pathHint);
  const normalizedTarget = normalizePath(targetPath);
  if (!normalizedHint || !normalizedTarget) {
    return true;
  }
  return (
    normalizedHint === normalizedTarget ||
    normalizedHint.endsWith(`/${normalizedTarget}`) ||
    normalizedTarget.endsWith(`/${normalizedHint}`)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
