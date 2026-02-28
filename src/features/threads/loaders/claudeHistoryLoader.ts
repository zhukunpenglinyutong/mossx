import type { ConversationItem } from "../../../types";
import type { HistoryLoader } from "../contracts/conversationCurtainContracts";
import { normalizeHistorySnapshot } from "../contracts/conversationCurtainContracts";
import { asString } from "./historyLoaderUtils";

type ClaudeHistoryLoaderOptions = {
  workspaceId: string;
  workspacePath: string | null;
  loadClaudeSession: (
    workspacePath: string,
    sessionId: string,
  ) => Promise<unknown>;
};

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
      items.push({
        id: asString(message.id ?? `claude-reasoning-${items.length + 1}`),
        kind: "reasoning",
        summary: text.slice(0, 100),
        content: text,
      });
      continue;
    }
    if (kind !== "tool") {
      continue;
    }

    const toolId = asString(message.id ?? "");
    const toolType = asString(message.toolType ?? "unknown");
    const isToolResult = toolType === "result" || toolType === "error";
    const status = toolType === "error" ? "failed" : "completed";
    if (isToolResult) {
      const sourceToolId = toolId.endsWith("-result")
        ? toolId.slice(0, -"-result".length)
        : "";
      const sourceIndex = sourceToolId ? toolIndexById.get(sourceToolId) : undefined;
      if (sourceIndex !== undefined) {
        const existing = items[sourceIndex];
        if (existing?.kind === "tool") {
          items[sourceIndex] = {
            ...existing,
            status,
            output: asString(message.text ?? existing.output ?? ""),
          };
        }
        continue;
      }
      const fallbackId = sourceToolId || toolId || `claude-tool-${items.length + 1}`;
      items.push({
        id: fallbackId,
        kind: "tool",
        toolType,
        title: asString(message.title ?? "Tool"),
        detail: "",
        status,
        output: asString(message.text ?? ""),
      });
      continue;
    }

    items.push({
      id: toolId || `claude-tool-${items.length + 1}`,
      kind: "tool",
      toolType,
      title: asString(message.title ?? "Tool"),
      detail: asString(message.text ?? ""),
      status: "started",
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
