import { useMemo } from "react";
import type { ConversationItem } from "../../../types";
import type {
  TodoItem,
  SubagentInfo,
  FileChangeSummary,
  CommandSummary,
  SubagentNavigationTarget,
} from "../types";
import {
  extractToolName,
  parseToolArgs,
  resolveToolStatus,
} from "../../messages/components/toolBlocks/toolConstants";
import {
  extractCommandSummaries,
  extractFileChangeSummaries,
} from "../../operation-facts/operationFacts";
import {
  normalizeCollabAgentStatusMap,
  parseCollabFallbackLink,
} from "../../../utils/collabToolParsing";

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

type ThreadStatusSnapshot = {
  isProcessing?: boolean;
};

interface StatusPanelDataOptions {
  isCodexEngine?: boolean;
  activeThreadId?: string | null;
  activeTurnId?: string | null;
  itemsByThread?: Record<string, ConversationItem[]>;
  threadParentById?: Record<string, string>;
  threadStatusById?: Record<string, ThreadStatusSnapshot | undefined>;
}

type ToolItem = Extract<ConversationItem, { kind: "tool" }>;

type SubagentAccumulator = SubagentInfo & {
  statusPriority: number;
};

const COLLAB_ACTION_NAMES = new Set([
  "spawn agent",
  "send input",
  "wait",
  "wait agent",
  "resume agent",
  "close agent",
]);

const STATUS_WEIGHT: Record<SubagentInfo["status"], number> = {
  running: 0,
  error: 1,
  completed: 2,
};

/**
 * 从 ConversationItem[] 中提取 StatusPanel 所需数据。
 *
 * - todos: 取最后一个 TodoWrite 工具的 detail JSON
 * - subagents: 聚合 task/agent/collab 子代理事实
 * - fileChanges: 取所有有 changes 字段的 Edit/Write 工具
 */
export function useStatusPanelData(
  items: ConversationItem[],
  options: StatusPanelDataOptions = {},
): StatusPanelData {
  const {
    isCodexEngine = false,
    activeThreadId,
    activeTurnId,
    itemsByThread,
    threadParentById,
    threadStatusById,
  } = options;

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
          activeForm:
            typeof (t as Record<string, unknown>).activeForm === "string"
              ? ((t as Record<string, unknown>).activeForm as string)
              : undefined,
        }));
    }
    return lastTodos;
  }, [items]);

  const scopedToolEntries = useMemo(
    () =>
      collectScopedToolEntries(items, {
        activeThreadId,
        activeTurnId,
        itemsByThread,
        threadParentById,
      }),
    [activeThreadId, activeTurnId, items, itemsByThread, threadParentById],
  );

  const subagents = useMemo(() => {
    const result = new Map<string, SubagentAccumulator>();

    scopedToolEntries.entries.forEach(({ threadId, item }) => {
      const toolName = extractToolName(item.title).trim().toLowerCase();
      const taskLike = isTaskLikeSubagentTool(item, toolName);
      if (taskLike) {
        const args = parseToolArgs(item.detail);
        const resolved = resolveToolStatus(item.status, Boolean(item.output));
        const taskStatus =
          resolved === "failed"
            ? "error"
            : resolved === "completed"
              ? "completed"
              : "running";
        const threadScopedStatus =
          scopedToolEntries.rootThreadId && threadId !== scopedToolEntries.rootThreadId
            ? resolveThreadScopedSubagentStatus(
                threadId,
                threadStatusById,
                itemsByThread,
              )
            : undefined;
        const taskDescription = extractTaskDescription(args, item);
        const taskType = extractTaskType(args, toolName);
        const subagentId =
          scopedToolEntries.rootThreadId && threadId !== scopedToolEntries.rootThreadId
            ? threadId
            : item.id;
        const subagentType =
          scopedToolEntries.rootThreadId && threadId !== scopedToolEntries.rootThreadId
            ? threadId
            : taskType;
        upsertSubagent(result, {
          id: subagentId,
          type: subagentType,
          description: taskDescription,
          status: threadScopedStatus ?? taskStatus,
          statusPriority: threadScopedStatus ? 5 : 2,
          navigationTarget:
            scopedToolEntries.rootThreadId && threadId !== scopedToolEntries.rootThreadId
              ? { kind: "thread", threadId }
              : buildTaskLikeNavigationTarget(item, args),
        });
      }

      if (item.toolType !== "collabToolCall") {
        return;
      }

      const collabActionName = extractCollabActionName(item.title);
      if (!COLLAB_ACTION_NAMES.has(collabActionName)) {
        return;
      }

      const fallbackLink = parseCollabFallbackLink(item.detail, threadId);
      const structuredStatuses = collectStructuredAgentStatuses(item.agentStatus);
      const textStatuses = collectTextAgentStatuses(item.output);
      const agentIds = uniqueStringList([
        ...(item.receiverThreadIds ?? []),
        ...(fallbackLink?.receivers ?? []),
        ...Object.keys(structuredStatuses),
        ...Object.keys(textStatuses),
      ]);
      if (agentIds.length === 0) {
        return;
      }

      const collabDescription = extractCollabDescription(item.output);
      agentIds.forEach((agentId) => {
        const threadScopedStatus = resolveThreadScopedSubagentStatus(
          agentId,
          threadStatusById,
          itemsByThread,
        );
        const explicitStatus = structuredStatuses[agentId] ?? textStatuses[agentId];
        const genericStatus = inferCollabRuntimeStatus(collabActionName, item.status);
        const resolvedStatus = threadScopedStatus ?? explicitStatus ?? genericStatus;
        if (!resolvedStatus) {
          return;
        }
        upsertSubagent(result, {
          id: agentId,
          type: agentId,
          description: collabDescription,
          status: resolvedStatus,
          statusPriority: threadScopedStatus
            ? 5
            : explicitStatus
              ? 4
              : collabActionName === "wait" ||
                  collabActionName === "wait agent" ||
                  collabActionName === "close agent"
                ? 3
                : 1,
          navigationTarget: { kind: "thread", threadId: agentId },
        });
      });
    });

    return Array.from(result.values())
      .map(({ statusPriority: _statusPriority, ...subagent }) => subagent)
      .sort((left, right) => {
        const weightDiff = STATUS_WEIGHT[left.status] - STATUS_WEIGHT[right.status];
        if (weightDiff !== 0) {
          return weightDiff;
        }
        return left.type.localeCompare(right.type);
      });
  }, [
    itemsByThread,
    scopedToolEntries,
    threadStatusById,
  ]);

  const fileChanges = useMemo(() => {
    return extractFileChangeSummaries(
      scopedToolEntries.entries.map(({ item }) => item),
    ) as FileChangeSummary[];
  }, [scopedToolEntries]);

  const commands = useMemo(() => {
    return extractCommandSummaries(
      scopedToolEntries.entries.map(({ item }) => item),
      { isCodexEngine },
    ) as CommandSummary[];
  }, [isCodexEngine, scopedToolEntries]);

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

function collectScopedToolEntries(
  items: ConversationItem[],
  options: Pick<
    StatusPanelDataOptions,
    "activeThreadId" | "activeTurnId" | "itemsByThread" | "threadParentById"
  >,
) {
  const currentThreadId = options.activeThreadId ?? "current-thread";
  const currentTurnId = options.activeTurnId?.trim() || null;
  const filterEntriesForTurn = (
    entries: Array<{ threadId: string; item: ToolItem }>,
  ) => {
    if (!currentTurnId) {
      return entries;
    }
    const matchingTurnEntries = entries.filter(
      ({ item }) => (item.turnId?.trim() || null) === currentTurnId,
    );
    return matchingTurnEntries.length > 0 ? matchingTurnEntries : entries;
  };
  if (!options.activeThreadId || !options.itemsByThread) {
    return {
      rootThreadId: null,
      entries: filterEntriesForTurn(
        items
          .filter((item): item is ToolItem => item.kind === "tool")
          .map((item) => ({ threadId: currentThreadId, item })),
      ),
    };
  }

  const fallbackParentById = buildFallbackParentById(options.itemsByThread);
  const rootThreadId = resolveRootThreadId(
    options.activeThreadId,
    options.threadParentById ?? {},
    fallbackParentById,
  );
  const candidateThreadIds = new Set<string>([
    options.activeThreadId,
    rootThreadId,
    ...Object.keys(options.itemsByThread),
    ...Object.keys(options.threadParentById ?? {}),
    ...Object.values(options.threadParentById ?? {}),
    ...Object.keys(fallbackParentById),
    ...Object.values(fallbackParentById),
  ]);

  const relevantThreadIds = Array.from(candidateThreadIds).filter(
    (threadId) =>
      threadId &&
      isDescendantOfRoot(
        threadId,
        rootThreadId,
        options.threadParentById ?? {},
        fallbackParentById,
      ),
  );

  return {
    rootThreadId,
    entries: filterEntriesForTurn(
      relevantThreadIds.flatMap((threadId) =>
        (options.itemsByThread?.[threadId] ?? [])
          .filter((item): item is ToolItem => item.kind === "tool")
          .map((item) => ({ threadId, item })),
      ),
    ),
  };
}

function buildFallbackParentById(itemsByThread: Record<string, ConversationItem[]>) {
  const fallbackParentById: Record<string, string> = {};
  Object.entries(itemsByThread).forEach(([threadId, entries]) => {
    entries.forEach((item) => {
      if (item.kind !== "tool" || item.toolType !== "collabToolCall") {
        return;
      }
      const parsed = parseCollabFallbackLink(item.detail, threadId);
      if (!parsed) {
        return;
      }
      parsed.receivers.forEach((receiverId) => {
        if (!fallbackParentById[receiverId]) {
          fallbackParentById[receiverId] = parsed.parentId;
        }
      });
    });
  });
  return fallbackParentById;
}

function resolveRootThreadId(
  activeThreadId: string,
  threadParentById: Record<string, string>,
  fallbackParentById: Record<string, string>,
) {
  const visited = new Set<string>();
  let current = activeThreadId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const nextParent = threadParentById[current] ?? fallbackParentById[current];
    if (!nextParent) {
      return current;
    }
    current = nextParent;
  }
  return activeThreadId;
}

function isDescendantOfRoot(
  threadId: string,
  rootThreadId: string,
  threadParentById: Record<string, string>,
  fallbackParentById: Record<string, string>,
) {
  if (threadId === rootThreadId) {
    return true;
  }
  const visited = new Set<string>();
  let current: string | undefined = threadId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const nextParent: string | undefined =
      threadParentById[current] ?? fallbackParentById[current];
    if (!nextParent) {
      return false;
    }
    if (nextParent === rootThreadId) {
      return true;
    }
    current = nextParent;
  }
  return false;
}

function isTaskLikeSubagentTool(item: ToolItem, toolName: string) {
  const normalizedToolType = item.toolType.trim().toLowerCase();
  return (
    toolName === "task" ||
    toolName === "agent" ||
    normalizedToolType === "task" ||
    normalizedToolType === "agent"
  );
}

function extractTaskDescription(args: Record<string, unknown> | null, item: ToolItem) {
  return (
    (args && typeof args.description === "string" ? args.description : "") ||
    (args && typeof args.prompt === "string" ? args.prompt : "") ||
    (args && typeof args.query === "string" ? args.query : "") ||
    (args && typeof args.task === "string" ? args.task : "") ||
    item.output?.split(/\r?\n/, 1)[0]?.trim() ||
    item.title.replace(/^Tool:\s*/i, "").trim() ||
    "Subagent"
  )
    .trim()
    .slice(0, 120);
}

function extractTaskType(args: Record<string, unknown> | null, fallbackToolName: string) {
  const rawSubagentType =
    args && typeof args.subagent_type === "string"
      ? args.subagent_type
      : args && typeof args.agent === "string"
        ? args.agent
        : args && typeof args.type === "string"
          ? args.type
          : args && typeof args.name === "string"
            ? args.name
            : args && typeof args.tool === "string"
              ? args.tool
              : "";
  const normalizedType = rawSubagentType.trim();
  return normalizedType.length > 0 ? normalizedType : fallbackToolName || "task";
}

function buildTaskLikeNavigationTarget(
  item: ToolItem,
  args: Record<string, unknown> | null,
): SubagentNavigationTarget | null {
  const normalizedToolType = item.toolType.trim().toLowerCase();
  const normalizedTitle = extractToolName(item.title).trim().toLowerCase();
  const isClaudeAgentTool =
    normalizedToolType === "agent" || normalizedTitle === "agent";
  if (isClaudeAgentTool) {
    const taskId = resolveTaskLikeTaskId(args);
    return {
      kind: "claude-task",
      taskId,
      toolUseId: item.id,
    };
  }
  return null;
}

function resolveTaskLikeTaskId(args: Record<string, unknown> | null) {
  const rawTaskId =
    typeof args?.task_id === "string"
      ? args.task_id
      : typeof args?.taskId === "string"
        ? args.taskId
        : "";
  const normalized = rawTaskId.trim();
  return normalized.length > 0 ? normalized : null;
}

function extractCollabActionName(title: string) {
  const matched = title.match(/^Collab:\s*(.+)$/i);
  return (matched?.[1] ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function collectStructuredAgentStatuses(
  value: ToolItem["agentStatus"],
): Record<string, SubagentInfo["status"]> {
  const result: Record<string, SubagentInfo["status"]> = {};
  const normalizedStatuses = normalizeCollabAgentStatusMap(value);
  if (!normalizedStatuses) {
    return result;
  }
  Object.entries(normalizedStatuses).forEach(([agentId, state]) => {
    const normalizedStatus = normalizeSubagentStatusValue(state.status);
    if (!normalizedStatus) {
      return;
    }
    result[agentId] = normalizedStatus;
  });
  return result;
}

function collectTextAgentStatuses(output: string | undefined) {
  const result: Record<string, SubagentInfo["status"]> = {};
  if (!output) {
    return result;
  }
  output.split(/\r?\n/).forEach((line) => {
    const parsed = parseTextAgentStatusLine(line);
    if (!parsed) {
      return;
    }
    result[parsed.agentId] = parsed.status;
  });
  return result;
}

function parseTextAgentStatusLine(line: string) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const agentId = line.slice(0, separatorIndex).trim();
  const rawStatus = line.slice(separatorIndex + 1).trim();
  const status = normalizeSubagentStatusValue(rawStatus);
  if (!agentId || !status) {
    return null;
  }
  return { agentId, status };
}

function normalizeSubagentStatusValue(value: unknown): SubagentInfo["status"] | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/(fail|error|cancel(?:led)?|abort|timeout|timed[_ -]?out)/.test(normalized)) {
    return "error";
  }
  if (/(complete|completed|success|succeed(?:ed)?|done|finish(?:ed)?)/.test(normalized)) {
    return "completed";
  }
  if (/(pending|running|processing|started|in[_ -]?progress|inprogress|queued)/.test(normalized)) {
    return "running";
  }
  return null;
}

function extractCollabDescription(output: string | undefined) {
  if (!output) {
    return "";
  }
  const sections = output
    .split(/\r?\n\s*\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const firstReadableSection = sections.find((section) => {
    const statusLines = section
      .split(/\r?\n/)
      .filter((line) => Boolean(line.trim()))
      .filter((line) => Boolean(parseTextAgentStatusLine(line)));
    return statusLines.length === 0;
  });
  return (firstReadableSection ?? "").slice(0, 120);
}

function inferCollabRuntimeStatus(
  collabActionName: string,
  toolStatus: string | undefined,
): SubagentInfo["status"] | null {
  const resolved = resolveToolStatus(toolStatus, false);
  if (resolved === "failed") {
    return "error";
  }
  if (
    collabActionName === "spawn agent" ||
    collabActionName === "send input" ||
    collabActionName === "resume agent"
  ) {
    return "running";
  }
  if (collabActionName === "close agent") {
    return resolved === "completed" ? "completed" : "running";
  }
  if (collabActionName === "wait" || collabActionName === "wait agent") {
    return resolved === "completed" ? "completed" : "running";
  }
  return null;
}

function resolveThreadScopedSubagentStatus(
  threadId: string,
  threadStatusById: Record<string, ThreadStatusSnapshot | undefined> | undefined,
  itemsByThread: Record<string, ConversationItem[]> | undefined,
): SubagentInfo["status"] | undefined {
  const status = threadStatusById?.[threadId];
  if (status?.isProcessing) {
    return "running";
  }
  const threadItems = itemsByThread?.[threadId] ?? [];
  if (threadItems.length === 0) {
    return undefined;
  }
  return inferHistoricalThreadTerminalStatus(threadItems);
}

function inferHistoricalThreadTerminalStatus(
  items: ConversationItem[],
): SubagentInfo["status"] | undefined {
  const lastMeaningfulItem = findLastMeaningfulThreadHistoryItem(items);
  if (!lastMeaningfulItem) {
    return undefined;
  }

  if (lastMeaningfulItem.kind === "message") {
    return lastMeaningfulItem.role === "assistant" ? "completed" : undefined;
  }

  if (lastMeaningfulItem.kind === "tool") {
    const resolved = resolveToolStatus(
      lastMeaningfulItem.status,
      Boolean(lastMeaningfulItem.output),
    );
    return resolved === "failed" ? "error" : "completed";
  }

  if (lastMeaningfulItem.kind === "diff") {
    return normalizeSubagentStatusValue(lastMeaningfulItem.status) === "error"
      ? "error"
      : "completed";
  }

  return "completed";
}

function findLastMeaningfulThreadHistoryItem(items: ConversationItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item) {
      continue;
    }
    if (item.kind === "message") {
      if (item.role === "user") {
        return item;
      }
      if (
        item.text.trim() ||
        item.isFinal === true ||
        typeof item.finalCompletedAt === "number"
      ) {
        return item;
      }
      continue;
    }
    if (
      item.kind === "reasoning" &&
      !item.summary.trim() &&
      !item.content.trim()
    ) {
      continue;
    }
    return item;
  }
  return undefined;
}

function upsertSubagent(
  target: Map<string, SubagentAccumulator>,
  next: SubagentAccumulator,
) {
  const existing = target.get(next.id);
  if (!existing) {
    target.set(next.id, next);
    return;
  }
  target.set(next.id, {
    ...existing,
    type: choosePreferredSubagentLabel(existing.type, next.type),
    description: choosePreferredDescription(existing.description, next.description),
    navigationTarget: choosePreferredNavigationTarget(
      existing.navigationTarget,
      next.navigationTarget,
    ),
    status:
      next.statusPriority >= existing.statusPriority ? next.status : existing.status,
    statusPriority: Math.max(existing.statusPriority, next.statusPriority),
  });
}

function choosePreferredNavigationTarget(
  current: SubagentNavigationTarget | null | undefined,
  next: SubagentNavigationTarget | null | undefined,
): SubagentNavigationTarget | null {
  if (!current) {
    return next ?? null;
  }
  if (!next) {
    return current;
  }
  if (current.kind !== next.kind) {
    return current;
  }
  if (current.kind === "thread" && next.kind === "thread") {
    return current.threadId ? current : next;
  }
  if (current.kind === "claude-task" && next.kind === "claude-task") {
    const currentScore = Number(Boolean(current.taskId)) + Number(Boolean(current.toolUseId));
    const nextScore = Number(Boolean(next.taskId)) + Number(Boolean(next.toolUseId));
    return nextScore > currentScore ? next : current;
  }
  return current;
}

function choosePreferredSubagentLabel(current: string, next: string) {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  const currentGeneric = /^(task|agent)$/i.test(current);
  const nextGeneric = /^(task|agent)$/i.test(next);
  if (currentGeneric && !nextGeneric) {
    return next;
  }
  return current;
}

function choosePreferredDescription(current: string, next: string) {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return next.length > current.length ? next : current;
}

function uniqueStringList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function normalizeTodoStatus(status: unknown): TodoItem["status"] {
  if (typeof status !== "string") return "pending";
  const lower = status.toLowerCase();
  if (lower === "completed" || lower === "done") return "completed";
  if (
    lower === "in_progress" ||
    lower === "in-progress" ||
    lower === "inprogress"
  ) {
    return "in_progress";
  }
  return "pending";
}
