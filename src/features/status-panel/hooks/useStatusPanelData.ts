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
      for (const change of changes) {
        const filePath = change.path;
        if (!filePath) continue;
        const fileName = getFileName(filePath);
        const existing = seen.get(filePath);
        if (!existing) {
          seen.set(filePath, {
            filePath,
            fileName,
            status: change.kind === "create" || change.kind === "new" ? "A" : "M",
          });
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
    // 无法精确获取 additions/deletions（需要 diff），使用文件数作为近似
    return {
      totalAdditions: fileChanges.length,
      totalDeletions: 0,
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
