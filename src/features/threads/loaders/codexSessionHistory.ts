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
type PendingCollabToolCall = {
  callId: string;
  tool: string;
  senderThreadId: string;
  receiverThreadIds: string[];
  prompt: string;
  status: string;
};
type PendingGenericToolCall = {
  callId: string;
  tool: string;
  arguments: unknown;
  status: string;
};

const COLLAB_TOOL_CALL_NAMES = new Set([
  "spawn_agent",
  "send_input",
  "wait",
  "resume_agent",
  "close_agent",
]);
const SKIP_GENERIC_TOOL_CALL_NAMES = new Set([
  "exec_command",
  "write_stdin",
  "update_plan",
  "request_user_input",
]);

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

function parseJsonUnknown(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asString(entry).trim())
      .filter(Boolean);
  }
  const normalized = asString(value).trim();
  if (!normalized) {
    return [];
  }
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    const parsed = parseJsonUnknown(normalized);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => asString(entry).trim())
        .filter(Boolean);
    }
  }
  if (normalized.includes(",")) {
    return normalized
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [normalized];
}

function uniqueStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    deduped.push(normalized);
  });
  return deduped;
}

function isCollabToolCall(name: string) {
  return COLLAB_TOOL_CALL_NAMES.has(name.trim());
}

function extractCollabPrompt(argumentsRecord: Record<string, unknown>) {
  return asString(
    argumentsRecord.message ??
      argumentsRecord.prompt ??
      argumentsRecord.instructions ??
      argumentsRecord.instruction ??
      "",
  ).trim();
}

function extractThreadIdsFromRecord(record: Record<string, unknown>): string[] {
  const ids = [
    ...toStringList(
      record.receiverThreadIds ??
        record.receiver_thread_ids ??
        record.newThreadIds ??
        record.new_thread_ids ??
        record.threadIds ??
        record.thread_ids ??
        record.agentIds ??
        record.agent_ids ??
        record.ids,
    ),
    ...toStringList(
      record.receiverThreadId ??
        record.receiver_thread_id ??
        record.newThreadId ??
        record.new_thread_id ??
        record.threadId ??
        record.thread_id ??
        record.agentId ??
        record.agent_id ??
        record.id,
    ),
  ];
  return uniqueStringList(ids);
}

function extractThreadIdsFromStatusRecords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStringList(
    value
      .map((entry) => asRecord(entry))
      .flatMap((entry) => extractThreadIdsFromRecord(entry)),
  );
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

function buildCollabToolCallItem(pending: PendingCollabToolCall) {
  if (!pending.callId.trim() || !pending.tool.trim()) {
    return null;
  }
  return buildConversationItem({
    id: pending.callId,
    type: "collabToolCall",
    tool: pending.tool,
    status: pending.status,
    senderThreadId: pending.senderThreadId,
    receiverThreadIds: pending.receiverThreadIds,
    prompt: pending.prompt,
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

function stageCollabToolCall(
  payload: Record<string, unknown>,
  pendingCollabToolCalls: Map<string, PendingCollabToolCall>,
) {
  const tool = asString(payload.name).trim();
  if (!isCollabToolCall(tool)) {
    return false;
  }
  const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
  if (!callId) {
    return true;
  }
  const argumentsRecord = parseJsonRecord(payload.arguments);
  pendingCollabToolCalls.set(callId, {
    callId,
    tool,
    senderThreadId: asString(
      argumentsRecord.senderThreadId ??
        argumentsRecord.sender_thread_id ??
        argumentsRecord.parentThreadId ??
        argumentsRecord.parent_thread_id ??
        "",
    ).trim(),
    receiverThreadIds: extractThreadIdsFromRecord(argumentsRecord),
    prompt: extractCollabPrompt(argumentsRecord),
    status: asString(payload.status ?? "completed").trim() || "completed",
  });
  return true;
}

function extractCollabOutputRecord(payload: Record<string, unknown>) {
  const parsedOutput = parseJsonUnknown(payload.output ?? payload.result ?? payload.response);
  const outputRecord = asRecord(parsedOutput);
  if (Object.keys(outputRecord).length > 0) {
    return outputRecord;
  }
  return parseJsonRecord(payload.data);
}

function flushCollabToolCallOutput(
  payload: Record<string, unknown>,
  pendingCollabToolCalls: Map<string, PendingCollabToolCall>,
) {
  const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
  if (!callId) {
    return null;
  }
  const pending = pendingCollabToolCalls.get(callId);
  if (!pending) {
    return null;
  }
  pendingCollabToolCalls.delete(callId);
  const outputRecord = extractCollabOutputRecord(payload);
  const mergedReceiverThreadIds = uniqueStringList([
    ...pending.receiverThreadIds,
    ...extractThreadIdsFromRecord(outputRecord),
    ...extractThreadIdsFromStatusRecords(outputRecord.statuses ?? outputRecord.results),
    ...extractThreadIdsFromRecord(asRecord(outputRecord.agent)),
  ]);
  return buildCollabToolCallItem({
    ...pending,
    status: asString(payload.status ?? pending.status ?? "completed").trim() || "completed",
    receiverThreadIds: mergedReceiverThreadIds,
  });
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

function shouldRecoverAsGenericToolCall(name: string) {
  const normalized = name.trim();
  if (!normalized) {
    return false;
  }
  if (isCollabToolCall(normalized)) {
    return false;
  }
  if (SKIP_GENERIC_TOOL_CALL_NAMES.has(normalized)) {
    return false;
  }
  return true;
}

function stageGenericToolCall(
  payload: Record<string, unknown>,
  pendingGenericToolCalls: Map<string, PendingGenericToolCall>,
) {
  const tool = asString(payload.name).trim();
  if (!shouldRecoverAsGenericToolCall(tool)) {
    return false;
  }
  const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
  if (!callId) {
    return true;
  }
  pendingGenericToolCalls.set(callId, {
    callId,
    tool,
    arguments: parseJsonUnknown(payload.arguments),
    status: asString(payload.status ?? "completed").trim() || "completed",
  });
  return true;
}

function buildGenericToolCallItem({
  callId,
  tool,
  status,
  output,
  argumentsPayload,
}: {
  callId: string;
  tool: string;
  status: string;
  output: string;
  argumentsPayload: unknown;
}) {
  if (!callId.trim() || !tool.trim()) {
    return null;
  }
  return buildConversationItem({
    id: callId,
    type: "mcpToolCall",
    server: "codex",
    tool,
    status,
    arguments: argumentsPayload,
    output,
  });
}

function flushGenericToolCallOutput(
  payload: Record<string, unknown>,
  pendingGenericToolCalls: Map<string, PendingGenericToolCall>,
) {
  const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
  if (!callId) {
    return null;
  }
  const pending = pendingGenericToolCalls.get(callId);
  if (!pending) {
    return null;
  }
  pendingGenericToolCalls.delete(callId);
  const outputValue =
    payload.output ??
    payload.result ??
    payload.response ??
    payload.data ??
    "";
  const output = unwrapToolOutputEnvelope(stringifyUnknown(parseJsonUnknown(outputValue)));
  return buildGenericToolCallItem({
    callId,
    tool: pending.tool,
    status: asString(payload.status ?? pending.status ?? "completed").trim() || "completed",
    output,
    argumentsPayload: pending.arguments,
  });
}

function normalizeWebSearchToolName(actionType: string) {
  const normalized = actionType.trim().toLowerCase();
  if (
    normalized === "search" ||
    normalized === "web_search" ||
    normalized === "search_query" ||
    normalized === "open_page" ||
    normalized === "open_url" ||
    normalized === "open_link" ||
    normalized === "open" ||
    normalized === "find_in_page" ||
    normalized === "find" ||
    normalized === "click" ||
    normalized === "click_link" ||
    normalized === "follow_link"
  ) {
    return "search_query";
  }
  return normalized || "search_query";
}

function resolveWebSearchQueryHint(action: Record<string, unknown>) {
  const actionType = asString(action.type ?? "").trim().toLowerCase();
  const query = asString(action.query ?? "").trim();
  if (query) {
    return query;
  }
  const url = asString(action.url ?? action.page_url ?? action.pageUrl ?? "").trim();
  const pattern = asString(action.pattern ?? action.selector ?? "").trim();
  if (actionType === "find_in_page") {
    if (pattern && url) {
      return `'${pattern}' in ${url}`;
    }
    if (pattern) {
      return pattern;
    }
  }
  if (url) {
    return url;
  }
  return pattern;
}

function normalizeWebSearchArguments(action: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...action };
  const queries = Array.isArray(action.queries)
    ? action.queries
        .map((entry) => asString(entry).trim())
        .filter(Boolean)
    : [];
  if (
    queries.length > 0 &&
    !Array.isArray(normalized.search_query) &&
    !Array.isArray(normalized.searchQuery)
  ) {
    normalized.search_query = queries.map((query) => ({ q: query }));
  }
  const queryHint = resolveWebSearchQueryHint(action);
  if (queryHint) {
    if (!asString(normalized.q).trim()) {
      normalized.q = queryHint;
    }
    if (!asString(normalized.query).trim()) {
      normalized.query = queryHint;
    }
  }
  return normalized;
}

function buildWebSearchCallItem(payload: Record<string, unknown>, fallbackId: string) {
  const actionRecord = parseJsonRecord(payload.action);
  if (Object.keys(actionRecord).length === 0) {
    return null;
  }
  const actionType = asString(
    actionRecord.type ?? payload.action_type ?? payload.actionType ?? "",
  ).trim();
  const tool = normalizeWebSearchToolName(actionType);
  const callId =
    asString(payload.call_id ?? payload.callId ?? payload.id ?? "").trim() ||
    fallbackId;
  const outputValue =
    payload.output ??
    payload.result ??
    payload.response ??
    payload.data ??
    "";
  const explicitOutput = unwrapToolOutputEnvelope(
    stringifyUnknown(parseJsonUnknown(outputValue)),
  );
  const output = explicitOutput || stringifyUnknown(actionRecord).trim();
  return buildGenericToolCallItem({
    callId,
    tool,
    status: asString(payload.status ?? "completed").trim() || "completed",
    output,
    argumentsPayload: normalizeWebSearchArguments(actionRecord),
  });
}

export function parseCodexSessionHistory(input: unknown): ConversationItem[] {
  const entries = toEntryList(input);
  const items: ConversationItem[] = [];
  const pendingCommands = new Map<string, PendingCommandExecution>();
  const pendingApplyPatches = new Map<string, PendingApplyPatch>();
  const pendingCollabToolCalls = new Map<string, PendingCollabToolCall>();
  const pendingGenericToolCalls = new Map<string, PendingGenericToolCall>();

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

      if (payloadType === "function_call") {
        const functionName = asString(payload.name).trim();
        if (functionName === "exec_command") {
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
        if (stageCollabToolCall(payload, pendingCollabToolCalls)) {
          return;
        }
        if (stageGenericToolCall(payload, pendingGenericToolCalls)) {
          return;
        }
      }

      if (payloadType === "function_call_output") {
        const callId = asString(payload.call_id ?? payload.callId ?? "").trim();
        const pending = pendingCommands.get(callId);
        if (pending) {
          const command = buildCommandExecutionItem(pending, payload);
          pendingCommands.delete(callId);
          if (command) {
            items.push(command);
          }
          return;
        }
        const collabToolCall = flushCollabToolCallOutput(payload, pendingCollabToolCalls);
        if (collabToolCall) {
          items.push(collabToolCall);
          return;
        }
        const genericToolCall = flushGenericToolCallOutput(payload, pendingGenericToolCalls);
        if (genericToolCall) {
          items.push(genericToolCall);
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

      if (payloadType === "web_search_call") {
        const webSearchToolCall = buildWebSearchCallItem(
          payload,
          `codex-web-search-${index + 1}`,
        );
        if (webSearchToolCall) {
          items.push(webSearchToolCall);
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

  pendingCollabToolCalls.forEach((pending) => {
    const collabToolCall = buildCollabToolCallItem({
      ...pending,
      status: pending.status || "started",
    });
    if (collabToolCall) {
      items.push(collabToolCall);
    }
  });

  pendingGenericToolCalls.forEach((pending) => {
    const genericToolCall = buildGenericToolCallItem({
      callId: pending.callId,
      tool: pending.tool,
      status: pending.status || "started",
      output: "",
      argumentsPayload: pending.arguments,
    });
    if (genericToolCall) {
      items.push(genericToolCall);
    }
  });

  return items;
}
