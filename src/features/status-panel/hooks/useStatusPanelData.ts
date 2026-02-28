import { useMemo } from "react";
import type { ConversationItem } from "../../../types";
import type {
  TodoItem,
  SubagentInfo,
  FileChangeSummary,
  CommandSummary,
} from "../types";
import {
  extractToolName,
  isBashTool,
  parseToolArgs,
  buildCommandSummary,
  getFileName,
  getFirstStringField,
  resolveToolStatus,
} from "../../messages/components/toolBlocks/toolConstants";

interface StatusPanelData {
  todos: TodoItem[];
  subagents: SubagentInfo[];
  fileChanges: FileChangeSummary[];
  commands: CommandSummary[];
  todoCompleted: number;
  todoTotal: number;
  hasInProgressTodo: boolean;
  subagentCompleted: number;
  subagentTotal: number;
  hasRunningSubagent: boolean;
  commandCompleted: number;
  commandTotal: number;
  hasRunningCommand: boolean;
  totalAdditions: number;
  totalDeletions: number;
}

interface StatusPanelDataOptions {
  isCodexEngine?: boolean;
}

/**
 * 从 ConversationItem[] 中提取 StatusPanel 所需数据。
 *
 * - todos: 取最后一个 TodoWrite 工具的 detail JSON
 * - subagents: 取所有 Task 工具调用
 * - fileChanges: 取所有有 changes 字段的 Edit/Write 工具
 */
export function useStatusPanelData(
  items: ConversationItem[],
  options: StatusPanelDataOptions = {},
): StatusPanelData {
  const { isCodexEngine = false } = options;
  const todos = useMemo(() => {
    let lastTodos: TodoItem[] = [];
    for (const item of items) {
      if (item.kind !== "tool") continue;
      const toolName = extractToolName(item.title).trim().toLowerCase();
      if (toolName !== "todowrite" && toolName !== "todo_write") continue;
      const args = parseToolArgs(item.detail);
      if (!args) continue;
      const raw = args.todos;
      if (!Array.isArray(raw)) continue;
      lastTodos = raw
        .filter(
          (t): t is { content: string; status: string } =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as Record<string, unknown>).content === "string",
        )
        .map((t) => ({
          content: t.content,
          status: normalizeTodoStatus(t.status),
          activeForm: typeof (t as Record<string, unknown>).activeForm === "string"
            ? ((t as Record<string, unknown>).activeForm as string)
            : undefined,
        }));
    }
    return lastTodos;
  }, [items]);

  const subagents = useMemo(() => {
    const result: SubagentInfo[] = [];
    for (const item of items) {
      if (item.kind !== "tool") continue;
      const toolName = extractToolName(item.title).trim().toLowerCase();
      if (toolName !== "task") continue;
      const args = parseToolArgs(item.detail);
      const description =
        (args && typeof args.description === "string" ? args.description : "") ||
        (args && typeof args.prompt === "string"
          ? (args.prompt as string).slice(0, 60)
          : "") ||
        (args && typeof args.query === "string"
          ? (args.query as string).slice(0, 60)
          : "") ||
        (args && typeof args.task === "string"
          ? (args.task as string).slice(0, 60)
          : "");
      const rawSubagentType =
        args && typeof args.subagent_type === "string"
          ? (args.subagent_type as string)
          : args && typeof args.agent === "string"
            ? (args.agent as string)
            : args && typeof args.type === "string"
              ? (args.type as string)
              : args && typeof args.name === "string"
                ? (args.name as string)
                : args && typeof args.tool === "string"
                  ? (args.tool as string)
                  : "";
      const normalizedType = rawSubagentType.trim();
      const subagentType = normalizedType.length > 0 ? normalizedType : "task";
      const resolved = resolveToolStatus(
        item.status,
        Boolean(item.output),
      );
      let status: SubagentInfo["status"];
      if (resolved === "failed") {
        status = "error";
      } else if (resolved === "completed") {
        status = "completed";
      } else {
        status = "running";
      }
      result.push({
        id: item.id,
        type: subagentType,
        description,
        status,
      });
    }
    return result;
  }, [items]);

  const fileChanges = useMemo(() => {
    const seen = new Map<string, FileChangeSummary>();
    for (const item of items) {
      if (item.kind !== "tool") continue;
      const changes = item.changes;
      if (!changes || changes.length === 0) continue;
      const parsedArgs = parseToolArgs(item.detail);
      const fallbackPath = parsedArgs
        ? getFirstStringField(parsedArgs, ["file_path", "path", "target_file", "filename"])
        : "";
      const fallbackStats = parsedArgs
        ? collectDiffStatsFromArgs(parsedArgs)
        : { additions: 0, deletions: 0 };
      for (const change of changes) {
        const filePath = change.path;
        if (!filePath) continue;
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
  }, [items]);

  const commands = useMemo(() => {
    const result: CommandSummary[] = [];
    for (const item of items) {
      if (item.kind !== "tool") continue;
      const toolName = extractToolName(item.title);
      if (item.toolType !== "commandExecution" && !isBashTool(toolName)) {
        continue;
      }
      const summaryCommand = buildCommandSummary(item, { includeDetail: false });
      const command = isCodexEngine
        ? summaryCommand
        : summaryCommand || item.detail.trim();
      const resolved = resolveToolStatus(item.status, Boolean(item.output));
      const status: CommandSummary["status"] =
        resolved === "failed"
          ? "error"
          : resolved === "completed"
            ? "completed"
            : "running";
      result.push({
        id: item.id,
        command,
        status,
      });
    }
    return result;
  }, [items, isCodexEngine]);

  const todoStats = useMemo(() => {
    const completed = todos.filter((t) => t.status === "completed").length;
    const hasInProgress = todos.some((t) => t.status === "in_progress");
    return {
      todoCompleted: completed,
      todoTotal: todos.length,
      hasInProgressTodo: hasInProgress,
    };
  }, [todos]);

  const subagentStats = useMemo(() => {
    const completed = subagents.filter((s) => s.status === "completed").length;
    const hasRunning = subagents.some((s) => s.status === "running");
    return {
      subagentCompleted: completed,
      subagentTotal: subagents.length,
      hasRunningSubagent: hasRunning,
    };
  }, [subagents]);

  const commandStats = useMemo(() => {
    const completed = commands.filter((c) => c.status === "completed").length;
    const hasRunning = commands.some((c) => c.status === "running");
    return {
      commandCompleted: completed,
      commandTotal: commands.length,
      hasRunningCommand: hasRunning,
    };
  }, [commands]);

  const fileStats = useMemo(() => {
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const change of fileChanges) {
      totalAdditions += change.additions;
      totalDeletions += change.deletions;
    }
    return {
      totalAdditions,
      totalDeletions,
    };
  }, [fileChanges]);

  return {
    todos,
    subagents,
    fileChanges,
    commands,
    ...todoStats,
    ...subagentStats,
    ...commandStats,
    ...fileStats,
  };
}

function normalizeFileStatus(kind?: string): "A" | "M" {
  const normalized = (kind ?? "").toLowerCase();
  if (
    normalized.includes("add") ||
    normalized.includes("create") ||
    normalized.includes("new")
  ) {
    return "A";
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

function normalizeTodoStatus(
  status: unknown,
): TodoItem["status"] {
  if (typeof status !== "string") return "pending";
  const lower = status.toLowerCase();
  if (lower === "completed" || lower === "done") return "completed";
  if (lower === "in_progress" || lower === "in-progress" || lower === "inprogress")
    return "in_progress";
  return "pending";
}
