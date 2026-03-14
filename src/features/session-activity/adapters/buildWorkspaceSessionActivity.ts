import type { ConversationItem, ThreadSummary } from "../../../types";
import {
  extractToolName,
  getFirstStringField,
  isBashTool,
  isReadTool,
  isSearchTool,
  isWebTool,
  parseToolArgs,
  resolveToolStatus,
} from "../../messages/components/toolBlocks/toolConstants";
import {
  extractCommandSummaries,
  summarizeFileChangeItem,
} from "../../operation-facts/operationFacts";
import {
  findPrimaryGitMarkerLine,
  parseLineMarkersFromDiff,
} from "../../files/utils/gitLineMarkers";
import { getThreadTimestamp } from "../../../utils/threadItems";
import type {
  SessionActivityEvent,
  SessionActivityEventStatus,
  SessionActivityRelationshipSource,
  SessionActivitySessionSummary,
  WorkspaceSessionActivityViewModel,
} from "../types";

type ThreadStatusSnapshot = {
  isProcessing?: boolean;
};

type BuildWorkspaceSessionActivityOptions = {
  activeThreadId: string | null;
  threads: ThreadSummary[];
  itemsByThread: Record<string, ConversationItem[]>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<string, ThreadStatusSnapshot | undefined>;
};

function resolveEventStatus(
  status: string | undefined,
  hasOutput: boolean,
  threadIsProcessing: boolean,
): SessionActivityEventStatus {
  const resolved = resolveToolStatus(status, hasOutput);
  if (resolved === "failed") {
    return "failed";
  }
  if (resolved === "completed") {
    return "completed";
  }
  if (!threadIsProcessing) {
    return "completed";
  }
  return "running";
}

function resolveExploreEventStatus(
  status: "exploring" | "explored" | undefined,
  threadIsProcessing: boolean,
): SessionActivityEventStatus {
  if (status === "explored" || !threadIsProcessing) {
    return "completed";
  }
  return "running";
}

function extractCommandOutputWindow(output: string | undefined) {
  if (!output) {
    return "";
  }
  const lines = output.split(/\r?\n/);
  if (lines.length === 0) {
    return "";
  }
  const tail = lines.slice(-80).join("\n").trim();
  if (!tail) {
    return "";
  }
  return tail.slice(-4_000);
}

function normalizeCommandValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function extractCommandMetadata(item: Extract<ConversationItem, { kind: "tool" }>) {
  const detailArgs = parseToolArgs(item.detail);
  const inputArgs =
    detailArgs && typeof detailArgs.input === "object" && detailArgs.input
      ? (detailArgs.input as Record<string, unknown>)
      : null;
  const nestedArgs =
    detailArgs && typeof detailArgs.arguments === "object" && detailArgs.arguments
      ? (detailArgs.arguments as Record<string, unknown>)
      : null;
  const commandKeys = ["command", "cmd", "script", "shell_command", "bash", "argv"];
  const descriptionKeys = ["description", "summary", "label", "title", "task"];
  const cwdKeys = ["cwd", "workdir", "working_directory", "workingDirectory"];

  const command =
    normalizeCommandValue(
      detailArgs
        ? commandKeys.map((key) => detailArgs[key]).find((value) => normalizeCommandValue(value))
        : undefined,
    ) ||
    normalizeCommandValue(
      inputArgs
        ? commandKeys.map((key) => inputArgs[key]).find((value) => normalizeCommandValue(value))
        : undefined,
    ) ||
    normalizeCommandValue(
      nestedArgs
        ? commandKeys.map((key) => nestedArgs[key]).find((value) => normalizeCommandValue(value))
        : undefined,
    );

  const description =
    getFirstStringField(detailArgs, descriptionKeys) ||
    getFirstStringField(inputArgs, descriptionKeys) ||
    getFirstStringField(nestedArgs, descriptionKeys) ||
    "";

  const cwd =
    getFirstStringField(detailArgs, cwdKeys) ||
    getFirstStringField(inputArgs, cwdKeys) ||
    getFirstStringField(nestedArgs, cwdKeys) ||
    "";

  const fallbackSummary = extractCommandSummaries([item])[0]?.command || item.title || "Command";

  return {
    commandText: command || fallbackSummary,
    commandDescription: description,
    commandWorkingDirectory: cwd,
    summary: command || fallbackSummary,
  };
}

function summarizeTask(item: Extract<ConversationItem, { kind: "tool" }>) {
  const toolName = extractToolName(item.title).trim().toLowerCase();
  const args = parseToolArgs(item.detail);
  if (toolName === "task") {
    const description =
      getFirstStringField(args, ["description", "prompt", "query", "task"]) ||
      item.output?.split(/\r?\n/, 1)[0]?.trim() ||
      item.title.replace(/^Tool:\s*/i, "").trim() ||
      "Task";
    return `Task · ${description}`;
  }
  if (toolName === "todowrite" || toolName === "todo_write") {
    const todos = Array.isArray(args?.todos) ? args.todos : [];
    const completed = todos.filter((todo) => {
      if (!todo || typeof todo !== "object") {
        return false;
      }
      return (todo as { status?: string }).status === "completed";
    }).length;
    return `Task · Todo updated ${completed}/${todos.length}`;
  }
  if (item.toolType === "proposed-plan" || item.toolType === "plan-implementation") {
    const firstLine =
      item.output?.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() || "";
    return firstLine
      ? `Task · ${firstLine.slice(0, 80)}`
      : `Task · ${item.title}`;
  }
  return null;
}

function getFirstNonEmptyValue(
  source: Record<string, unknown> | null,
  keys: string[],
) {
  if (!source) {
    return "";
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const parts = value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (parts.length > 0) {
        return parts.join(", ");
      }
    }
  }
  return "";
}

function resolveReadableFilePath(candidate: string | undefined) {
  if (!candidate) {
    return null;
  }
  const normalized = candidate.trim();
  if (!normalized) {
    return null;
  }
  if (normalized === "." || normalized === "..") {
    return null;
  }
  if (normalized.includes("\n") || normalized.includes("\r") || normalized.includes("*")) {
    return null;
  }
  if (/^[a-z]+:\/\//i.test(normalized)) {
    return null;
  }
  return normalized;
}

function extractPrimaryChangeDiff(
  item: Extract<ConversationItem, { kind: "tool" }>,
  filePath: string | undefined,
) {
  if (!filePath) {
    return "";
  }
  const directMatch = item.changes?.find((change) => change.path === filePath);
  return typeof directMatch?.diff === "string" ? directMatch.diff : "";
}

const INSPECTION_PATH_KEYS = [
  "filePath",
  "file_path",
  "filepath",
  "path",
  "paths",
  "file",
  "files",
  "filename",
  "target_file",
  "targetFile",
  "target_path",
  "targetPath",
  "target",
  "directory",
  "dir",
  "cwd",
  "workdir",
  "url",
  "query",
  "pattern",
];

function summarizeInspectionTool(item: Extract<ConversationItem, { kind: "tool" }>) {
  const toolName = extractToolName(item.title).trim().toLowerCase();
  if (!toolName || isBashTool(toolName)) {
    return null;
  }

  const args = parseToolArgs(item.detail);
  const inputArgs =
    args && typeof args.input === "object" && args.input
      ? (args.input as Record<string, unknown>)
      : null;
  const nestedArgs =
    args && typeof args.arguments === "object" && args.arguments
      ? (args.arguments as Record<string, unknown>)
      : null;
  const path =
    getFirstNonEmptyValue(args, INSPECTION_PATH_KEYS) ||
    getFirstNonEmptyValue(inputArgs, INSPECTION_PATH_KEYS) ||
    getFirstNonEmptyValue(nestedArgs, INSPECTION_PATH_KEYS);
  const toolLabel = toolName.replace(/^mcp__[^_]+__/, "").replace(/_/g, " ");

  if (isReadTool(toolName)) {
    const resolvedPath = resolveReadableFilePath(path);
    return {
      summary: `Read · ${resolvedPath || path || toolLabel || "file"}`,
      jumpTarget: resolvedPath
        ? ({ type: "file", path: resolvedPath } as const)
        : undefined,
    };
  }
  if (isSearchTool(toolName)) {
    return { summary: `Search · ${path || toolLabel || "workspace"}` };
  }
  if (isWebTool(toolName)) {
    return { summary: `Web · ${path || toolLabel || "request"}` };
  }
  if (toolName === "skill_mcp" || toolName === "skill") {
    const nestedToolName = getFirstNonEmptyValue(args, ["tool_name", "toolName", "name"]);
    return { summary: `Skill · ${nestedToolName || path || "tool call"}` };
  }
  if (item.toolType === "mcpToolCall") {
    return { summary: `Tool · ${path || toolLabel || "activity"}` };
  }
  return null;
}

function parseFallbackLink(detail: string, fallbackParentId: string) {
  const trimmed = detail.trim();
  if (!trimmed.includes("→")) {
    return null;
  }
  const [leftSide, rightSide] = trimmed.split("→", 2).map((part) => part.trim());
  const parentMatch = leftSide.match(/^From\s+(.+)$/i);
  const parentId = parentMatch?.[1]?.trim() || fallbackParentId;
  const receivers = rightSide
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!parentId || receivers.length === 0) {
    return null;
  }
  return { parentId, receivers };
}

function buildFallbackParentById(
  threads: ThreadSummary[],
  itemsByThread: Record<string, ConversationItem[]>,
) {
  const fallbackParentById: Record<string, string> = {};
  for (const thread of threads) {
    const items = itemsByThread[thread.id] ?? [];
    for (const item of items) {
      if (item.kind !== "tool" || item.toolType !== "collabToolCall") {
        continue;
      }
      const parsed = parseFallbackLink(item.detail, thread.id);
      if (!parsed) {
        continue;
      }
      for (const receiverId of parsed.receivers) {
        if (!fallbackParentById[receiverId]) {
          fallbackParentById[receiverId] = parsed.parentId;
        }
      }
    }
  }
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

function resolveRelationshipSource(
  threadId: string,
  rootThreadId: string,
  threadParentById: Record<string, string>,
  fallbackParentById: Record<string, string>,
): SessionActivityRelationshipSource {
  if (threadId === rootThreadId) {
    return "directParent";
  }
  if (threadParentById[threadId]) {
    return "directParent";
  }
  if (fallbackParentById[threadId]) {
    return "fallbackLinking";
  }
  return "directParent";
}

function isClaudeThread(threadId: string) {
  return threadId.startsWith("claude:") || threadId.startsWith("claude-pending-");
}

function splitReasoningSummarySnapshots(summary: string) {
  const lines = summary
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return lines;
  }
  const snapshots: string[] = [];
  for (const line of lines) {
    if (snapshots[snapshots.length - 1] === line) {
      continue;
    }
    snapshots.push(line);
  }
  return snapshots;
}

function buildThreadEvents(args: {
  thread: ThreadSummary;
  rootThreadId: string;
  items: ConversationItem[];
  relationshipSource: SessionActivityRelationshipSource;
  threadIsProcessing: boolean;
}) {
  const events: SessionActivityEvent[] = [];
  const occurredBase = getThreadTimestamp(args.thread) || 0;
  let latestUserMessageIndex = -1;
  args.items.forEach((item, index) => {
    if (item.kind === "message" && item.role === "user") {
      latestUserMessageIndex = index;
    }
  });
  let currentTurnIndex = 0;
  let currentTurnToken = "bootstrap";
  args.items.forEach((item, index) => {
    if (item.kind === "message" && item.role === "user") {
      currentTurnIndex += 1;
      currentTurnToken = item.id || `turn-${currentTurnIndex}`;
      return;
    }
    const sessionRole = args.thread.id === args.rootThreadId ? "root" : "child";
    const threadName = args.thread.name || args.thread.id;
    const occurredAtBase = occurredBase > 0 ? occurredBase + index : index;
    const turnIndex = currentTurnIndex > 0 ? currentTurnIndex : 1;
    const turnId = `${args.thread.id}:turn:${currentTurnToken}`;

    if (item.kind === "reasoning") {
      const summary = item.summary.trim() || item.content.trim() || "Thinking";
      const reasoningPreview = item.content.trim() || item.summary.trim() || "Thinking";
      const belongsToLatestTurn =
        latestUserMessageIndex >= 0 ? index > latestUserMessageIndex : true;
      const summarySnapshots = isClaudeThread(args.thread.id)
        ? splitReasoningSummarySnapshots(item.summary.trim())
        : [];
      if (summarySnapshots.length > 1) {
        summarySnapshots.forEach((snapshot, snapshotIndex) => {
          const isLatestSnapshot = snapshotIndex === summarySnapshots.length - 1;
          events.push({
            eventId: `reasoning:${item.id}:${snapshotIndex}`,
            threadId: args.thread.id,
            threadName,
            turnId,
            turnIndex,
            sessionRole,
            relationshipSource: args.relationshipSource,
            kind: "reasoning",
            occurredAt: occurredAtBase + snapshotIndex / 1_000,
            summary: `Thinking · ${snapshot}`,
            status:
              args.threadIsProcessing && belongsToLatestTurn && isLatestSnapshot
                ? "running"
                : "completed",
            jumpTarget: { type: "thread", threadId: args.thread.id },
            reasoningPreview,
          });
        });
        return;
      }
      events.push({
        eventId: `reasoning:${item.id}`,
        threadId: args.thread.id,
        threadName,
        turnId,
        turnIndex,
        sessionRole,
        relationshipSource: args.relationshipSource,
        kind: "reasoning",
        occurredAt: occurredAtBase,
        summary: `Thinking · ${summary}`,
        status:
          args.threadIsProcessing && belongsToLatestTurn ? "running" : "completed",
        jumpTarget: { type: "thread", threadId: args.thread.id },
        reasoningPreview,
      });
      return;
    }

    if (item.kind === "explore") {
      const entries = Array.isArray(item.entries) ? item.entries : [];
      const eventStatus = resolveExploreEventStatus(item.status, args.threadIsProcessing);
      entries.forEach((entry, entryIndex) => {
        const label = entry.label.trim();
        const detail = (entry.detail ?? "").trim();
        const occurredAt = occurredAtBase + (entryIndex + 1) / 100;
        if (entry.kind === "run") {
          events.push({
            eventId: `explore:run:${item.id}:${entryIndex}`,
            threadId: args.thread.id,
            threadName,
            turnId,
            turnIndex,
            sessionRole,
            relationshipSource: args.relationshipSource,
            kind: "explore",
            occurredAt,
            summary: label || "Command",
            status: eventStatus,
            commandText: label || "Command",
            commandDescription: detail || undefined,
          });
          return;
        }
        const summaryPrefix =
          entry.kind === "read"
            ? "Read"
            : entry.kind === "search"
              ? "Search"
              : "List";
        events.push({
          eventId: `explore:${entry.kind}:${item.id}:${entryIndex}`,
          threadId: args.thread.id,
          threadName,
          turnId,
          turnIndex,
          sessionRole,
          relationshipSource: args.relationshipSource,
          kind: "explore",
          occurredAt,
          summary: `${summaryPrefix} · ${label || detail || "workspace"}`,
          status: eventStatus,
          jumpTarget:
            entry.kind === "read"
              ? (() => {
                  const resolvedPath = resolveReadableFilePath(label || detail);
                  return resolvedPath
                    ? ({ type: "file", path: resolvedPath } as const)
                    : ({ type: "thread", threadId: args.thread.id } as const);
                })()
              : { type: "thread", threadId: args.thread.id },
        });
      });
      return;
    }

    if (item.kind !== "tool") {
      return;
    }
    const lowerToolName = extractToolName(item.title).trim().toLowerCase();
    const hasOutput = Boolean(item.output) || Boolean(item.changes?.length);
    const eventStatus = resolveEventStatus(item.status, hasOutput, args.threadIsProcessing);
    const occurredAt = occurredAtBase;

    if (item.toolType === "commandExecution" || isBashTool(lowerToolName)) {
      const commandMeta = extractCommandMetadata(item);
      events.push({
        eventId: `command:${item.id}`,
        threadId: args.thread.id,
        threadName,
        turnId,
        turnIndex,
        sessionRole,
        relationshipSource: args.relationshipSource,
        kind: "command",
        occurredAt,
        summary: commandMeta.summary || "Command",
        status: eventStatus,
        commandText: commandMeta.commandText,
        commandDescription: commandMeta.commandDescription || undefined,
        commandWorkingDirectory: commandMeta.commandWorkingDirectory || undefined,
        commandPreview: extractCommandOutputWindow(item.output),
      });
      return;
    }

    const taskSummary = summarizeTask(item);
    if (taskSummary) {
      events.push({
        eventId: `task:${item.id}`,
        threadId: args.thread.id,
        threadName,
        turnId,
        turnIndex,
        sessionRole,
        relationshipSource: args.relationshipSource,
        kind: "task",
        occurredAt,
        summary: taskSummary,
        status: eventStatus,
        jumpTarget: { type: "thread", threadId: args.thread.id },
      });
      return;
    }

    const inspectionSummary = summarizeInspectionTool(item);
    if (inspectionSummary) {
      events.push({
        eventId: `task:${item.id}`,
        threadId: args.thread.id,
        threadName,
        turnId,
        turnIndex,
        sessionRole,
        relationshipSource: args.relationshipSource,
        kind: "task",
        occurredAt,
        summary: inspectionSummary.summary,
        status: eventStatus,
        jumpTarget: inspectionSummary.jumpTarget ?? { type: "thread", threadId: args.thread.id },
      });
      return;
    }

    const fileChangeSummary = summarizeFileChangeItem(item);
    if (fileChangeSummary) {
      const primaryDiff = extractPrimaryChangeDiff(item, fileChangeSummary.filePath);
      const markers = parseLineMarkersFromDiff(primaryDiff);
      const primaryLine = findPrimaryGitMarkerLine(markers) ?? undefined;
      events.push({
        eventId: `file:${item.id}`,
        threadId: args.thread.id,
        threadName,
        turnId,
        turnIndex,
        sessionRole,
        relationshipSource: args.relationshipSource,
        kind: "fileChange",
        occurredAt,
        summary: fileChangeSummary.summary,
        status: eventStatus,
        jumpTarget: fileChangeSummary.filePath
          ? {
              type: "file",
              path: fileChangeSummary.filePath,
              line: primaryLine,
              markers,
            }
          : undefined,
        filePath: fileChangeSummary.filePath,
        fileCount: fileChangeSummary.fileCount,
        additions: fileChangeSummary.additions,
        deletions: fileChangeSummary.deletions,
      });
    }
  });
  return events;
}

export function buildWorkspaceSessionActivity({
  activeThreadId,
  threads,
  itemsByThread,
  threadParentById,
  threadStatusById,
}: BuildWorkspaceSessionActivityOptions): WorkspaceSessionActivityViewModel {
  if (!activeThreadId) {
    return {
      rootThreadId: null,
      rootThreadName: null,
      relevantThreadIds: [],
      timeline: [],
      sessionSummaries: [],
      isProcessing: false,
      emptyState: "idle",
    };
  }

  const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
  const fallbackParentById = buildFallbackParentById(threads, itemsByThread);
  const rootThreadId = resolveRootThreadId(
    activeThreadId,
    threadParentById,
    fallbackParentById,
  );
  const relevantThreads = threads.filter((thread) =>
    isDescendantOfRoot(thread.id, rootThreadId, threadParentById, fallbackParentById),
  );

  if (!threadMap.has(activeThreadId)) {
    const fallbackThread: ThreadSummary = {
      id: activeThreadId,
      name: activeThreadId,
      updatedAt: 0,
    };
    threadMap.set(activeThreadId, fallbackThread);
    if (isDescendantOfRoot(activeThreadId, rootThreadId, threadParentById, fallbackParentById)) {
      relevantThreads.push(fallbackThread);
    }
  }

  const uniqueRelevantThreads = Array.from(
    new Map(relevantThreads.map((thread) => [thread.id, thread])).values(),
  );

  const timeline = uniqueRelevantThreads
    .flatMap((thread) =>
      buildThreadEvents({
        thread,
        rootThreadId,
        items: itemsByThread[thread.id] ?? [],
        relationshipSource: resolveRelationshipSource(
          thread.id,
          rootThreadId,
          threadParentById,
          fallbackParentById,
        ),
        threadIsProcessing: Boolean(threadStatusById[thread.id]?.isProcessing),
      }),
    )
    .sort((left, right) => right.occurredAt - left.occurredAt);

  const sessionSummaries: SessionActivitySessionSummary[] = uniqueRelevantThreads
    .map((thread) => {
      const relationshipSource = resolveRelationshipSource(
        thread.id,
        rootThreadId,
        threadParentById,
        fallbackParentById,
      );
      const sessionRole: SessionActivitySessionSummary["sessionRole"] =
        thread.id === rootThreadId ? "root" : "child";
      return {
        threadId: thread.id,
        threadName: thread.name || thread.id,
        sessionRole,
        relationshipSource,
        eventCount: timeline.filter((event) => event.threadId === thread.id).length,
        isProcessing: Boolean(threadStatusById[thread.id]?.isProcessing),
      };
    })
    .sort((left, right) => {
      if (left.sessionRole !== right.sessionRole) {
        return left.sessionRole === "root" ? -1 : 1;
      }
      return right.eventCount - left.eventCount;
    });

  const rootThread = threadMap.get(rootThreadId) ?? null;
  const isProcessing = uniqueRelevantThreads.some((thread) =>
    Boolean(threadStatusById[thread.id]?.isProcessing),
  );
  const emptyState =
    timeline.length > 0 ? (isProcessing ? "running" : "completed") : isProcessing ? "running" : "idle";

  return {
    rootThreadId,
    rootThreadName: rootThread?.name ?? rootThreadId,
    relevantThreadIds: uniqueRelevantThreads.map((thread) => thread.id),
    timeline,
    sessionSummaries,
    isProcessing,
    emptyState,
  };
}
