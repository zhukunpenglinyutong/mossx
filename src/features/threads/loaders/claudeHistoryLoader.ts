import type { ConversationItem } from "../../../types";
import type { HistoryLoader } from "../contracts/conversationCurtainContracts";
import { normalizeHistorySnapshot } from "../contracts/conversationCurtainContracts";
import { computeDiff } from "../../messages/utils/diffUtils";
import { asString } from "./historyLoaderUtils";

type ClaudeHistoryLoaderOptions = {
  workspaceId: string;
  workspacePath: string | null;
  loadClaudeSession: (
    workspacePath: string,
    sessionId: string,
  ) => Promise<unknown>;
};

function compactComparableReasoningText(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/[！!]/g, "!")
    .replace(/[？?]/g, "?")
    .replace(/[，,]/g, ",")
    .replace(/[。．.]/g, ".");
}

function isReasoningSnapshotDuplicate(previous: string, incoming: string) {
  const previousCompact = compactComparableReasoningText(previous);
  const incomingCompact = compactComparableReasoningText(incoming);
  if (!previousCompact || !incomingCompact) {
    return false;
  }
  if (previousCompact === incomingCompact) {
    return true;
  }
  if (previousCompact.length >= 16 && incomingCompact.includes(previousCompact)) {
    return true;
  }
  if (incomingCompact.length >= 16 && previousCompact.includes(incomingCompact)) {
    return true;
  }
  return false;
}

function preferLongerReasoningText(previous: string, incoming: string) {
  const previousCompactLength = compactComparableReasoningText(previous).length;
  const incomingCompactLength = compactComparableReasoningText(incoming).length;
  return incomingCompactLength >= previousCompactLength ? incoming : previous;
}

function getClaudeToolName(message: Record<string, unknown>) {
  return asString(message.tool_name ?? message.toolName ?? message.title ?? "Tool");
}

function getClaudeToolInputText(message: Record<string, unknown>) {
  const toolInput = getClaudeToolInputRecord(message);
  if (toolInput && Object.keys(toolInput).length > 0) {
    return JSON.stringify(toolInput);
  }
  return "";
}

function getClaudeToolOutputText(message: Record<string, unknown>) {
  const toolOutput = getClaudeToolOutputRecord(message);
  return asString(
    toolOutput?.output ??
      toolOutput?.stdout ??
      toolOutput?.stderr ??
      message.text ??
      "",
  );
}

function getClaudeSourceToolId(message: Record<string, unknown>) {
  const directCandidates = [
    message.source_tool_id,
    message.sourceToolId,
    message.source_tool_call_id,
    message.sourceToolCallId,
    message.tool_use_id,
    message.toolUseId,
    message.call_id,
    message.callId,
    message.parent_tool_id,
    message.parentToolId,
    message.parent_id,
    message.parentId,
  ];
  for (const candidate of directCandidates) {
    const resolved = asString(candidate).trim();
    if (resolved) {
      return resolved;
    }
  }

  const nestedSources = [
    message.tool_output,
    message.output,
    message.result,
    message.meta,
    message.metadata,
  ];
  for (const source of nestedSources) {
    if (!source || typeof source !== "object") {
      continue;
    }
    const record = source as Record<string, unknown>;
    const nestedCandidates = [
      record.source_tool_id,
      record.sourceToolId,
      record.source_tool_call_id,
      record.sourceToolCallId,
      record.tool_use_id,
      record.toolUseId,
      record.call_id,
      record.callId,
      record.parent_tool_id,
      record.parentToolId,
      record.parent_id,
      record.parentId,
    ];
    for (const candidate of nestedCandidates) {
      const resolved = asString(candidate).trim();
      if (resolved) {
        return resolved;
      }
    }
  }

  const toolId = asString(message.id ?? "").trim();
  if (!toolId) {
    return "";
  }

  const suffixes = ["-result", ":result", "_result", ".result", "/result"];
  for (const suffix of suffixes) {
    if (toolId.endsWith(suffix) && toolId.length > suffix.length) {
      return toolId.slice(0, -suffix.length);
    }
  }
  return "";
}

function getClaudeToolInputRecord(message: Record<string, unknown>) {
  const toolInput = message.toolInput ?? message.tool_input;
  return toolInput && typeof toolInput === "object"
    ? (toolInput as Record<string, unknown>)
    : null;
}

function getClaudeToolOutputRecord(message: Record<string, unknown>) {
  const toolOutput = message.toolOutput ?? message.tool_output;
  return toolOutput && typeof toolOutput === "object"
    ? (toolOutput as Record<string, unknown>)
    : null;
}

function normalizeClaudeToolName(toolName: string) {
  return toolName.trim().toLowerCase();
}

function buildUnifiedDiff(oldText: string, newText: string) {
  const diff = computeDiff(oldText, newText);
  const oldLines = oldText ? oldText.split("\n").length : 0;
  const newLines = newText ? newText.split("\n").length : 0;
  const header = `@@ -1,${oldLines} +1,${newLines} @@`;
  const body = diff.lines
    .map((line) => {
      if (line.type === "added") {
        return `+${line.content}`;
      }
      if (line.type === "deleted") {
        return `-${line.content}`;
      }
      return ` ${line.content}`;
    })
    .join("\n");
  return body ? `${header}\n${body}` : header;
}

function inferClaudeFileChange(
  toolName: string,
  message: Record<string, unknown>,
): { toolType: string; changes: NonNullable<Extract<ConversationItem, { kind: "tool" }>["changes"]> } | null {
  const normalizedToolName = normalizeClaudeToolName(toolName);
  if (normalizedToolName !== "write" && normalizedToolName !== "edit") {
    return null;
  }

  const toolInput = getClaudeToolInputRecord(message);
  const toolOutput = getClaudeToolOutputRecord(message);
  const filePath = asString(
    toolOutput?.filePath ??
      toolOutput?.file_path ??
      toolInput?.file_path ??
      toolInput?.filePath ??
      "",
  ).trim();
  if (!filePath) {
    return null;
  }

  if (normalizedToolName === "write") {
    const content = asString(toolOutput?.content ?? toolInput?.content ?? "");
    const diff = content ? buildUnifiedDiff("", content) : "";
    return {
      toolType: "fileChange",
      changes: [{ path: filePath, kind: "add", diff }],
    };
  }

  const oldText = asString(
    toolOutput?.oldString ?? toolOutput?.originalFile ?? toolInput?.old_string ?? "",
  );
  const newText = asString(toolOutput?.newString ?? toolInput?.new_string ?? "");
  const diff = oldText || newText ? buildUnifiedDiff(oldText, newText) : "";
  return {
    toolType: "fileChange",
    changes: [{ path: filePath, kind: "modified", diff }],
  };
}

function findLatestPendingToolIndex(items: ConversationItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const entry = items[index];
    if (entry?.kind !== "tool") {
      continue;
    }
    if (entry.status === "completed" || entry.status === "failed") {
      continue;
    }
    return index;
  }
  return -1;
}

function mergeReasoningSnapshot(
  items: ConversationItem[],
  id: string,
  text: string,
) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return;
  }
  const byIdIndex = items.findIndex(
    (item) => item.kind === "reasoning" && item.id === id,
  );
  if (byIdIndex >= 0) {
    const existing = items[byIdIndex];
    if (existing.kind === "reasoning") {
      const nextText = preferLongerReasoningText(existing.content, normalizedText);
      items[byIdIndex] = {
        ...existing,
        summary: nextText.slice(0, 100),
        content: nextText,
      };
    }
    return;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (candidate.kind === "message" && candidate.role === "user") {
      break;
    }
    if (candidate.kind !== "reasoning") {
      continue;
    }
    if (!isReasoningSnapshotDuplicate(candidate.content, normalizedText)) {
      continue;
    }
    const nextText = preferLongerReasoningText(candidate.content, normalizedText);
    items[index] = {
      ...candidate,
      summary: nextText.slice(0, 100),
      content: nextText,
    };
    return;
  }
  items.push({
    id,
    kind: "reasoning",
    summary: normalizedText.slice(0, 100),
    content: normalizedText,
  });
}

export function parseClaudeHistoryMessages(messagesData: unknown): ConversationItem[] {
  const items: ConversationItem[] = [];
  const toolIndexById = new Map<string, number>();
  const messages = Array.isArray(messagesData)
    ? (messagesData as Array<Record<string, unknown>>)
    : [];
  for (const message of messages) {
    const kind = asString(message.kind ?? "");
    if (kind === "message") {
      items.push({
        id: asString(message.id ?? `claude-message-${items.length + 1}`),
        kind: "message",
        role: asString(message.role) === "user" ? "user" : "assistant",
        text: asString(message.text ?? ""),
      });
      continue;
    }
    if (kind === "reasoning") {
      const text = asString(message.text ?? "");
      mergeReasoningSnapshot(
        items,
        asString(message.id ?? `claude-reasoning-${items.length + 1}`),
        text,
      );
      continue;
    }
    if (kind !== "tool") {
      continue;
    }

    const toolId = asString(message.id ?? "");
    const toolType = asString(message.toolType ?? message.tool_name ?? "unknown");
    const isToolResult = toolType === "result" || toolType === "error";
    const status = toolType === "error" ? "failed" : "completed";
    if (isToolResult) {
      const sourceToolId = getClaudeSourceToolId(message);
      const sourceIndex = sourceToolId
        ? toolIndexById.get(sourceToolId)
        : toolId
          ? toolIndexById.get(toolId)
          : undefined;
      if (sourceIndex !== undefined) {
        const existing = items[sourceIndex];
        if (existing?.kind === "tool") {
          items[sourceIndex] = {
            ...existing,
            status,
            output: getClaudeToolOutputText(message) || existing.output,
          };
        }
        continue;
      }
      const pendingToolIndex = findLatestPendingToolIndex(items);
      if (pendingToolIndex >= 0) {
        const existing = items[pendingToolIndex];
        if (existing?.kind === "tool") {
          items[pendingToolIndex] = {
            ...existing,
            status,
            output: getClaudeToolOutputText(message) || existing.output,
          };
          continue;
        }
      }
      const fallbackId = sourceToolId || toolId || `claude-tool-${items.length + 1}`;
      items.push({
        id: fallbackId,
        kind: "tool",
        toolType,
        title: getClaudeToolName(message),
        detail: "",
        status,
        output: getClaudeToolOutputText(message),
      });
      continue;
    }

    items.push({
      id: toolId || `claude-tool-${items.length + 1}`,
      kind: "tool",
      toolType: inferClaudeFileChange(getClaudeToolName(message), message)?.toolType ?? toolType,
      title: getClaudeToolName(message),
      detail: getClaudeToolInputText(message) || asString(message.text ?? ""),
      status: "started",
      changes: inferClaudeFileChange(getClaudeToolName(message), message)?.changes,
    });
    if (toolId) {
      toolIndexById.set(toolId, items.length - 1);
    }
  }
  return items;
}

export function createClaudeHistoryLoader({
  workspaceId,
  workspacePath,
  loadClaudeSession,
}: ClaudeHistoryLoaderOptions): HistoryLoader {
  return {
    engine: "claude",
    async load(threadId: string) {
      const sessionId = threadId.startsWith("claude:")
        ? threadId.slice("claude:".length)
        : threadId;
      if (!workspacePath) {
        return normalizeHistorySnapshot({
          engine: "claude",
          workspaceId,
          threadId,
          meta: {
            workspaceId,
            threadId,
            engine: "claude",
            activeTurnId: null,
            isThinking: false,
            heartbeatPulse: null,
            historyRestoredAtMs: Date.now(),
          },
        });
      }
      const result = await loadClaudeSession(workspacePath, sessionId);
      const record = result as { messages?: unknown };
      const messagesData = record.messages ?? result;
      return normalizeHistorySnapshot({
        engine: "claude",
        workspaceId,
        threadId,
        items: parseClaudeHistoryMessages(messagesData),
        plan: null,
        userInputQueue: [],
        meta: {
          workspaceId,
          threadId,
          engine: "claude",
          activeTurnId: null,
          isThinking: false,
          heartbeatPulse: null,
          historyRestoredAtMs: Date.now(),
        },
      });
    },
  };
}
