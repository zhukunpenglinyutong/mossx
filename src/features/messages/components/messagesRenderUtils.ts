import { convertFileSrc } from "@tauri-apps/api/core";
import type { ConversationItem } from "../../../types";
import type {
  ConversationEngine,
  ConversationState,
} from "../../threads/contracts/conversationCurtainContracts";
import type { PresentationProfile } from "../presentation/presentationProfile";
import { groupToolItems } from "../utils/groupToolItems";
import {
  isAssistantMessageConversationItem,
  isUserMessageConversationItem,
} from "./messageItemPredicates";
import { compactComparableReasoningText, parseReasoning } from "./messagesReasoning";
import { buildCommandSummary, extractToolName, isBashTool } from "./toolBlocks/toolConstants";

export const SCROLL_THRESHOLD_PX = 120;
export const OPENCODE_NON_STREAMING_HINT_DELAY_MS = 12_000;
const MESSAGES_PERF_DEBUG_FLAG_KEY = "ccgui.debug.messages.perf";
const CLAUDE_HIDE_REASONING_MODULE_FLAG_KEY = "ccgui.claude.hideReasoningModule";
const CLAUDE_RENDER_DEBUG_FLAG_KEY = "ccgui.debug.claude.render";
export const MESSAGES_SLOW_RENDER_WARN_MS = 18;
export const MESSAGES_SLOW_ANCHOR_WARN_MS = 8;
export const VISIBLE_MESSAGE_WINDOW = 30;

export type HistoryStickyCandidate = {
  id: string;
  text: string;
};

export type MessagesEngine = "claude" | "codex" | "gemini" | "opencode";

export function isSelectionInsideNode(selection: Selection | null, node: HTMLElement | null) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !node) {
    return false;
  }
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (node.contains(range.commonAncestorContainer)) {
      return true;
    }
  }
  return false;
}

export function normalizeHistoryStickyHeaderText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function isMessagesPerfDebugEnabled(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(MESSAGES_PERF_DEBUG_FLAG_KEY) === "1";
}

export function shouldHideClaudeReasoningModule(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const value = window.localStorage.getItem(CLAUDE_HIDE_REASONING_MODULE_FLAG_KEY);
    if (!value) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return !(normalized === "0" || normalized === "false" || normalized === "off");
  } catch {
    return false;
  }
}

export function isClaudeRenderDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const value = window.localStorage.getItem(CLAUDE_RENDER_DEBUG_FLAG_KEY);
    if (!value) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "on";
  } catch {
    return false;
  }
}

export function logClaudeRender(label: string, payload: Record<string, unknown>) {
  if (!isClaudeRenderDebugEnabled()) {
    return;
  }
  console.info(`[messages][claude-render] ${label}`, payload);
}

export function logMessagesPerf(label: string, payload: Record<string, unknown>): void {
  if (!isMessagesPerfDebugEnabled()) {
    return;
  }
  console.info(`[messages][perf] ${label}`, payload);
}

export function normalizeAgentTaskStatus(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return { label: "agent", tone: "neutral" as const };
  }
  if (/(fail|error|cancel(?:led)?|abort|timeout|timed[_ -]?out)/.test(normalized)) {
    return { label: value?.trim() ?? "error", tone: "error" as const };
  }
  if (/(complete|completed|success|done|finish(?:ed)?)/.test(normalized)) {
    return { label: value?.trim() ?? "completed", tone: "completed" as const };
  }
  if (/(running|processing|started|in[_ -]?progress|queued|pending)/.test(normalized)) {
    return { label: value?.trim() ?? "running", tone: "running" as const };
  }
  return { label: value?.trim() ?? normalized, tone: "neutral" as const };
}

export function basenameFromPath(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return null;
  }
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function resolveAgentTaskDisplaySummary(summary: string | null | undefined) {
  const normalized = (summary ?? "").trim();
  if (!normalized) {
    return {
      title: "Agent result",
      subtitle: null as string | null,
    };
  }
  const match =
    /Agent\s+["“]?([^"”]+)["”]?/i.exec(normalized)
    ?? /智能体\s*["“]?([^"”]+)["”]?/i.exec(normalized);
  const title = match?.[1]?.trim() || normalized;
  return {
    title,
    subtitle: title === normalized ? null : normalized,
  };
}

export function toConversationEngine(engine: MessagesEngine): ConversationEngine {
  if (engine === "claude" || engine === "gemini" || engine === "opencode") {
    return engine;
  }
  return "codex";
}

export function resolveProvenanceEngineLabel(
  engineSource: string | null | undefined,
): string | null {
  const normalized = (engineSource ?? "").trim().toLowerCase();
  if (normalized === "claude") {
    return "Claude";
  }
  if (normalized === "gemini") {
    return "Gemini";
  }
  if (normalized === "opencode") {
    return "OpenCode";
  }
  if (normalized === "codex") {
    return "Codex";
  }
  return null;
}

export function resolveRenderableItems({
  legacyItems,
  legacyThreadId: _legacyThreadId,
  legacyWorkspaceId: _legacyWorkspaceId,
  conversationState,
}: {
  legacyItems: ConversationItem[];
  legacyThreadId: string | null;
  legacyWorkspaceId: string | null;
  conversationState: ConversationState | null;
}) {
  if (!conversationState) {
    return legacyItems;
  }
  return conversationState.items;
}

export function normalizeMessageImageSrc(path: string) {
  if (!path) {
    return "";
  }
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("file://")) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

export function formatDurationMs(durationMs: number) {
  const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const durationHours = Math.floor(durationSeconds / 3600);
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationRemainder = durationSeconds % 60;
  if (durationHours > 0) {
    const remainderMinutes = durationMinutes % 60;
    return `${durationHours}:${String(remainderMinutes).padStart(2, "0")}:${String(durationRemainder).padStart(2, "0")}`;
  }
  return `${durationMinutes}:${String(durationRemainder).padStart(2, "0")}`;
}

export function formatCompletedTimeMs(timestampMs: number) {
  const date = new Date(timestampMs);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function scrollKeyForItems(items: ConversationItem[]) {
  if (!items.length) {
    return "empty";
  }
  const last = items[items.length - 1];
  if (!last) {
    return "empty";
  }
  switch (last.kind) {
    case "message":
      return `${last.id}-${last.text.length}`;
    case "reasoning":
      return `${last.id}-${last.summary.length}-${last.content.length}`;
    case "explore":
      return `${last.id}-${last.status}-${last.entries.length}`;
    case "generatedImage":
      return `${last.id}-${last.status}-${last.images.length}`;
    case "tool":
      return `${last.id}-${last.status ?? ""}-${last.output?.length ?? 0}`;
    case "diff":
      return `${last.id}-${last.status ?? ""}-${last.diff.length}`;
    case "review":
      return `${last.id}-${last.state}-${last.text.length}`;
    default: {
      const _exhaustive: never = last;
      return _exhaustive;
    }
  }
}

export function resolveCodexCommandActivityLabel(item: Extract<ConversationItem, { kind: "tool" }>) {
  return buildCommandSummary(item, { includeDetail: false });
}

export function shouldHideCodexCanvasCommandCard(
  item: Extract<ConversationItem, { kind: "tool" }>,
  activeEngine: MessagesEngine,
) {
  if (activeEngine !== "codex" && activeEngine !== "claude") {
    return false;
  }
  const normalizedToolName = extractToolName(item.title)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (
    normalizedToolName === "exitplanmode" ||
    normalizedToolName.endsWith("exitplanmode")
  ) {
    return false;
  }
  if (item.toolType === "commandExecution") {
    return true;
  }
  return isBashTool(extractToolName(item.title).toLowerCase());
}

export function isClaudeHistoryTranscriptHeavy(items: ConversationItem[]) {
  let assistantTextCount = 0;
  let reasoningCount = 0;
  let toolCount = 0;

  for (const item of items) {
    if (item.kind === "message" && item.role === "assistant" && item.text.trim()) {
      assistantTextCount += 1;
      continue;
    }
    if (item.kind === "reasoning") {
      reasoningCount += 1;
      continue;
    }
    if (item.kind === "tool") {
      toolCount += 1;
    }
  }

  return toolCount >= 1 && reasoningCount + toolCount >= 3 && assistantTextCount <= 1;
}

export function countRenderableCollapsedEntries(
  items: ConversationItem[],
  activeEngine: MessagesEngine,
) {
  if (items.length === 0) {
    return 0;
  }
  return groupToolItems(items).reduce((count, entry) => {
    if (entry.kind === "bashGroup") {
      return activeEngine === "codex" || activeEngine === "claude" ? count : count + 1;
    }
    if (
      entry.kind === "item" &&
      entry.item.kind === "tool" &&
      shouldHideCodexCanvasCommandCard(entry.item, activeEngine)
    ) {
      return count;
    }
    return count + 1;
  }, 0);
}

export function resolveWorkingActivityLabel(
  item: ConversationItem,
  activeEngine: MessagesEngine = "claude",
  presentationProfile: PresentationProfile | null = null,
) {
  if (item.kind === "reasoning") {
    const parsed = parseReasoning(item);
    return parsed.workingLabel;
  }
  if (item.kind === "explore") {
    const lastEntry = item.entries[item.entries.length - 1];
    if (!lastEntry) {
      return item.status === "exploring" ? "Exploring..." : "Explored";
    }
    return lastEntry.detail ? `${lastEntry.label} (${lastEntry.detail})` : lastEntry.label;
  }
  if (item.kind === "generatedImage") {
    if (item.promptText?.trim()) {
      return item.promptText.trim();
    }
    return item.status === "processing" ? "Generating image..." : "Image ready";
  }
  if (item.kind === "tool") {
    const title = item.title?.trim();
    const detail = item.detail?.trim();
    const preferCommandSummary = presentationProfile
      ? presentationProfile.preferCommandSummary
      : activeEngine === "codex";
    if (preferCommandSummary) {
      const codexCommand = resolveCodexCommandActivityLabel(item);
      if (codexCommand) {
        return codexCommand;
      }
    }
    if (!title) {
      return null;
    }
    if (detail && item.toolType === "commandExecution") {
      return `${title} @ ${detail}`;
    }
    return title;
  }
  if (item.kind === "diff") {
    return item.title?.trim() || null;
  }
  if (item.kind === "review") {
    return item.state === "started" ? "Review started" : "Review completed";
  }
  return null;
}

export function findLastUserMessageIndex(items: ConversationItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (isUserMessageConversationItem(item)) {
      return index;
    }
  }
  return -1;
}

export function findLastAssistantMessageIndex(items: ConversationItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (isAssistantMessageConversationItem(item)) {
      return index;
    }
  }
  return -1;
}

export function shouldDisplayWorkingActivityLabel(
  reasoningLabel: string | null,
  activityLabel: string | null,
) {
  if (!activityLabel) {
    return false;
  }
  if (!reasoningLabel) {
    return true;
  }
  const compactReasoning = compactComparableReasoningText(reasoningLabel);
  const compactActivity = compactComparableReasoningText(activityLabel);
  if (!compactReasoning || !compactActivity) {
    return true;
  }
  if (compactReasoning === compactActivity) {
    return false;
  }
  if (compactReasoning.length >= 12 && compactActivity.includes(compactReasoning)) {
    return false;
  }
  if (compactActivity.length >= 12 && compactReasoning.includes(compactActivity)) {
    return false;
  }
  return true;
}
