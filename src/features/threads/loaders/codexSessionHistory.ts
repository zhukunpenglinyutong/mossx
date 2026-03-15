import type { ConversationItem } from "../../../types";
import { buildConversationItemFromThreadItem } from "../../../utils/threadItems";
import { asRecord, asString } from "./historyLoaderUtils";

type CodexSessionEntry = Record<string, unknown>;
type PendingCommandExecution = {
  callId: string;
  command: string;
  cwd: string;
  description: string;
};
type PendingApplyPatch = {
  callId: string;
  input: string;
  status: string;
};

function compactComparableReasoningSnapshotText(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/[！!]/g, "!")
    .replace(/[？?]/g, "?")
    .replace(/[，,]/g, ",")
    .replace(/[。．.]/g, ".");
}

function isReasoningSnapshotDuplicate(previous: string, incoming: string) {
  const previousCompact = compactComparableReasoningSnapshotText(previous);
  const incomingCompact = compactComparableReasoningSnapshotText(incoming);
  if (!previousCompact || !incomingCompact) {
    return false;
  }
  if (previousCompact === incomingCompact) {
    return true;
  }
  if (previousCompact.length >= 8 && incomingCompact.includes(previousCompact)) {
    return true;
  }
  if (incomingCompact.length >= 8 && previousCompact.includes(incomingCompact)) {
    return true;
  }
  const max = Math.min(previousCompact.length, incomingCompact.length);
  let sharedPrefix = 0;
  while (
    sharedPrefix < max &&
    previousCompact[sharedPrefix] === incomingCompact[sharedPrefix]
  ) {
    sharedPrefix += 1;
  }
  return sharedPrefix >= 8 && sharedPrefix >= Math.floor(max * 0.72);
}

function findDuplicateReasoningIndex(
  items: ConversationItem[],
  incoming: Extract<ConversationItem, { kind: "reasoning" }>,
) {
  const incomingText = (incoming.content || incoming.summary || "").trim();
  if (!incomingText) {
    return -1;
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (candidate.kind !== "reasoning") {
      continue;
    }
    const candidateText = (candidate.content || candidate.summary || "").trim();
    if (!candidateText) {
      continue;
    }
    if (isReasoningSnapshotDuplicate(candidateText, incomingText)) {
      return index;
    }
  }
  return -1;
}

function mergeReasoningSnapshot(
  existing: Extract<ConversationItem, { kind: "reasoning" }>,
  incoming: Extract<ConversationItem, { kind: "reasoning" }>,
): Extract<ConversationItem, { kind: "reasoning" }> {
  const existingSummary = existing.summary.trim();
  const incomingSummary = incoming.summary.trim();
  const existingContent = existing.content.trim();
  const incomingContent = incoming.content.trim();
  return {
    ...existing,
    id: incoming.id,
    summary: incomingSummary.length >= existingSummary.length ? incomingSummary : existingSummary,
    content: incomingContent.length >= existingContent.length ? incomingContent : existingContent,
  };
}

function appendCodexHistoryItem(items: ConversationItem[], item: ConversationItem) {
  if (item.kind !== "reasoning") {
    items.push(item);
    return;
  }
  const duplicateIndex = findDuplicateReasoningIndex(items, item);
  if (duplicateIndex < 0 || items[duplicateIndex]?.kind !== "reasoning") {
    items.push(item);
    return;
  }
  items[duplicateIndex] = mergeReasoningSnapshot(
    items[duplicateIndex] as Extract<ConversationItem, { kind: "reasoning" }>,
    item,
  );
}

function toEntryList(input: unknown): CodexSessionEntry[] {
  if (Array.isArray(input)) {
    return input.map(asRecord).filter((entry) => Object.keys(entry).length > 0);
  }
  const record = asRecord(input);
  const entries = Array.isArray(record.entries) ? record.entries : [];
  return entries.map(asRecord).filter((entry) => Object.keys(entry).length > 0);
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") {
    return asRecord(value);
  }
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function extractMessageText(payload: Record<string, unknown>) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const parts = content
    .map((entry) => {
      const record = asRecord(entry);
      return asString(record.text ?? record.value ?? record.content ?? "").trim();
    })
    .filter(Boolean);
  if (parts.length > 0) {
    return parts.join("\n\n").trim();
  }
  return asString(payload.text ?? payload.message ?? "").trim();
}

function unwrapToolOutputEnvelope(value: string) {
  const marker = "\nOutput:\n";
  const index = value.indexOf(marker);
  if (index < 0) {
    return value.trim();
  }
  return value.slice(index + marker.length).trim();
}

function buildConversationItem(item: Record<string, unknown>): ConversationItem | null {
  return buildConversationItemFromThreadItem(item);
}

function buildReasoningItem(payload: Record<string, unknown>, fallbackId: string) {
  return buildConversationItem({
    id: asString(payload.id ?? fallbackId).trim() || fallbackId,
    type: "reasoning",
    summary: payload.summary ?? "",
    content: payload.content ?? "",
    encrypted_content: payload.encrypted_content ?? payload.encryptedContent ?? "",
  });
}

function buildAssistantMessageItem(payload: Record<string, unknown>, fallbackId: string) {
  const text = extractMessageText(payload);
  if (!text) {
    return null;
  }
  return buildConversationItem({
    id: fallbackId,
    type: "agentMessage",
    text,
  });
}

function buildUserMessageItem(payload: Record<string, unknown>, fallbackId: string) {
  const text = asString(payload.message ?? payload.text ?? "").trim();
  if (!text) {
    return null;
  }
  return buildConversationItem({
    id: fallbackId,
    type: "userMessage",
    content: [{ type: "text", text }],
  });
}

function buildCommandExecutionItem(
  pending: PendingCommandExecution,
  payload: Record<string, unknown>,
) {
  return buildConversationItem({
    id: pending.callId,
    type: "commandExecution",
    command: pending.command,
    cwd: pending.cwd,
    description: pending.description,
    status: "completed",
    aggregatedOutput: unwrapToolOutputEnvelope(asString(payload.output ?? "")),
  });
}

function buildApplyPatchItem({
  callId,
  patch,
  status,
  output,
}: {
  callId: string;
  patch: string;
  status?: string;
  output?: string;
}) {
  if (!callId || !patch) {
    return null;
  }
  return buildConversationItem({
    id: callId.trim(),
    type: "fileChange",
    status: asString(status ?? "completed"),
    input: patch.trim(),
    output: unwrapToolOutputEnvelope(asString(output ?? "")),
  });
}

function stageApplyPatchCall(
  payload: Record<string, unknown>,
  pendingApplyPatches: Map<string, PendingApplyPatch>,
) {
  if (asString(payload.name).trim() !== "apply_patch") {
    return;
  }
  const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
  const input = asString(payload.input ?? "").trim();
  if (!callId || !input) {
    return;
  }
  pendingApplyPatches.set(callId, {
    callId,
    input,
    status: asString(payload.status ?? "completed").trim() || "completed",
  });
}

function flushApplyPatchOutput(
  payload: Record<string, unknown>,
  pendingApplyPatches: Map<string, PendingApplyPatch>,
) {
  const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
  if (!callId) {
    return null;
  }
  const pending = pendingApplyPatches.get(callId);
  if (!pending) {
    return null;
  }
  pendingApplyPatches.delete(callId);
  return buildApplyPatchItem({
    callId,
    patch: pending.input,
    status: pending.status,
    output: asString(payload.output ?? ""),
  });
}

export function parseCodexSessionHistory(input: unknown): ConversationItem[] {
  const entries = toEntryList(input);
  const items: ConversationItem[] = [];
  const pendingCommands = new Map<string, PendingCommandExecution>();
  const pendingApplyPatches = new Map<string, PendingApplyPatch>();

  entries.forEach((entry, index) => {
    const entryType = asString(entry.type).trim();
    const payload = asRecord(entry.payload);
    if (Object.keys(payload).length === 0) {
      return;
    }

    if (entryType === "response_item") {
      const payloadType = asString(payload.type).trim();
      if (payloadType === "reasoning") {
        const reasoning = buildReasoningItem(payload, `codex-reasoning-${index + 1}`);
        if (reasoning) {
          appendCodexHistoryItem(items, reasoning);
        }
        return;
      }

      if (payloadType === "function_call" && asString(payload.name).trim() === "exec_command") {
        const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
        if (!callId) {
          return;
        }
        const argumentsRecord = parseJsonRecord(payload.arguments);
        pendingCommands.set(callId, {
          callId,
          command: asString(
            argumentsRecord.cmd ?? argumentsRecord.command ?? argumentsRecord.argv ?? "",
          ).trim(),
          cwd: asString(
            argumentsRecord.workdir ??
              argumentsRecord.cwd ??
              argumentsRecord.working_directory ??
              "",
          ).trim(),
          description: asString(
            argumentsRecord.justification ?? argumentsRecord.description ?? "",
          ).trim(),
        });
        return;
      }

      if (payloadType === "function_call_output") {
        const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
        const pending = pendingCommands.get(callId);
        if (!pending) {
          return;
        }
        const command = buildCommandExecutionItem(pending, payload);
        pendingCommands.delete(callId);
        if (command) {
          items.push(command);
        }
        return;
      }

      if (payloadType === "custom_tool_call") {
        stageApplyPatchCall(payload, pendingApplyPatches);
        return;
      }

      if (payloadType === "custom_tool_call_output") {
        const fileChange = flushApplyPatchOutput(payload, pendingApplyPatches);
        if (fileChange) {
          items.push(fileChange);
        }
        return;
      }

      if (payloadType === "message" && asString(payload.role).trim() === "assistant") {
        const message = buildAssistantMessageItem(payload, `codex-assistant-${index + 1}`);
        if (message) {
          items.push(message);
        }
      }
      return;
    }

    if (entryType === "event_msg") {
      const payloadType = asString(payload.type).trim();
      if (payloadType === "user_message") {
        const message = buildUserMessageItem(payload, `codex-user-message-${index + 1}`);
        if (message) {
          items.push(message);
        }
        return;
      }
      if (payloadType === "agent_message") {
        const message = buildConversationItem({
          id: `codex-agent-message-${index + 1}`,
          type: "agentMessage",
          text: asString(payload.message ?? "").trim(),
        });
        if (message) {
          items.push(message);
        }
      }
      return;
    }

    if (entryType === "custom_tool_call" && asString(payload.name).trim() === "apply_patch") {
      stageApplyPatchCall(payload, pendingApplyPatches);
      const fileChange = buildApplyPatchItem({
        callId: asString(payload.call_id ?? payload.callId ?? "").trim(),
        patch: asString(payload.input ?? "").trim(),
        status: asString(payload.status ?? "completed"),
        output: asString(payload.output ?? ""),
      });
      if (fileChange) {
        pendingApplyPatches.delete(asString(payload.call_id ?? payload.callId ?? "").trim());
        items.push(fileChange);
      }
    }
  });

  pendingCommands.forEach((pending) => {
    const command = buildConversationItem({
      id: pending.callId,
      type: "commandExecution",
      command: pending.command,
      cwd: pending.cwd,
      description: pending.description,
      status: "started",
      aggregatedOutput: "",
    });
    if (command) {
      items.push(command);
    }
  });

  pendingApplyPatches.forEach((pending) => {
    const fileChange = buildApplyPatchItem({
      callId: pending.callId,
      patch: pending.input,
      status: pending.status,
      output: "",
    });
    if (fileChange) {
      items.push(fileChange);
    }
  });

  return items;
}
