import type { ConversationItem } from "../../types";
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
};

export type OperationFileChangeEventSummary = {
  summary: string;
  filePath?: string;
  fileCount: number;
  additions: number;
  deletions: number;
  statusLetter?: "A" | "D" | "R" | "M";
};

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
    const changes = item.changes;
    if (!changes || changes.length === 0) {
      continue;
    }
    const parsedArgs = parseToolArgs(item.detail);
    const fallbackPath = parsedArgs
      ? getFirstStringField(parsedArgs, ["file_path", "path", "target_file", "filename"])
      : "";
    const fallbackStats = parsedArgs
      ? collectDiffStatsFromArgs(parsedArgs)
      : { additions: 0, deletions: 0 };
    for (const change of changes) {
      const filePath = change.path;
      if (!filePath) {
        continue;
      }
      const fileName = getFileName(filePath);
      const directStats = collectDiffStats(change.diff);
      const canUseFallback =
        directStats.additions === 0 &&
        directStats.deletions === 0 &&
        changes.length === 1 &&
        fallbackPath === filePath;
      const additions = canUseFallback ? fallbackStats.additions : directStats.additions;
      const deletions = canUseFallback ? fallbackStats.deletions : directStats.deletions;
      const status = normalizeFileStatus(change.kind);
      const existing = seen.get(filePath);
      if (!existing) {
        seen.set(filePath, {
          filePath,
          fileName,
          status,
          additions,
          deletions,
        });
        continue;
      }
      existing.additions += additions;
      existing.deletions += deletions;
      if (status === "A") {
        existing.status = "A";
      }
    }
  }
  return Array.from(seen.values());
}

export function summarizeFileChangeItem(
  item: Extract<ConversationItem, { kind: "tool" }>,
): OperationFileChangeEventSummary | null {
  const changes = item.changes ?? [];
  if (changes.length === 0 && item.toolType !== "fileChange") {
    return null;
  }
  const primaryPath = changes[0]?.path ?? "";
  const fileName = getFileName(primaryPath) || primaryPath || "Pending changes";
  let additions = 0;
  let deletions = 0;
  for (const change of changes) {
    const stats = collectDiffStats(change.diff);
    additions += stats.additions;
    deletions += stats.deletions;
  }
  const extraCount = Math.max(0, changes.length - 1);
  const summaryBase = extraCount > 0 ? `${fileName} +${extraCount}` : fileName;
  return {
    summary: `File change · ${summaryBase}`,
    filePath: primaryPath || undefined,
    fileCount: changes.length || 1,
    additions,
    deletions,
    statusLetter: normalizeFileStatus(changes[0]?.kind),
  };
}

function normalizeFileStatus(kind?: string): "A" | "D" | "R" | "M" {
  const normalized = (kind ?? "").toLowerCase();
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

function collectDiffStatsFromArgs(args: Record<string, unknown>) {
  const oldString = typeof args.old_string === "string" ? args.old_string : "";
  const newString = typeof args.new_string === "string" ? args.new_string : "";
  if (oldString || newString) {
    return computeLineDelta(oldString, newString);
  }
  const content = typeof args.content === "string" ? args.content : "";
  if (content) {
    return { additions: content.split("\n").length, deletions: 0 };
  }
  return { additions: 0, deletions: 0 };
}

function computeLineDelta(oldString: string, newString: string) {
  const oldCount = oldString.split("\n").length;
  const newCount = newString.split("\n").length;
  if (oldCount === 0 && newCount === 0) {
    return { additions: 0, deletions: 0 };
  }
  if (oldCount === 0) {
    return { additions: newCount, deletions: 0 };
  }
  if (newCount === 0) {
    return { additions: 0, deletions: oldCount };
  }
  const diff = newCount - oldCount;
  if (diff >= 0) {
    return { additions: diff || 1, deletions: 0 };
  }
  return { additions: 0, deletions: -diff };
}
