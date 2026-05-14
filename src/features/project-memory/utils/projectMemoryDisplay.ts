import type { ProjectMemoryItem } from "../../../services/tauri";
import type { MemoryContextInjectionMode } from "../../../types";
import {
  resolveProjectMemoryReviewState,
  type ProjectMemoryHealthState,
  type ProjectMemoryReviewState,
} from "./projectMemoryHealth";

export type ProjectMemoryDisplayRecordKind =
  | "conversation_turn"
  | "manual_note"
  | "legacy";

export { deriveProjectMemoryHealthState } from "./projectMemoryHealth";
export type { ProjectMemoryHealthState, ProjectMemoryReviewState };

export type ProjectMemorySourceLocator = {
  available: boolean;
  threadId: string | null;
  turnId: string | null;
  engine: string | null;
};

export type ConversationTurnLabels = {
  userInput: string;
  assistantResponse: string;
  assistantThinkingSummary: string;
  threadId: string;
  turnId: string;
  engine: string;
};

const DEFAULT_CONVERSATION_TURN_LABELS: ConversationTurnLabels = {
  userInput: "用户输入",
  assistantResponse: "AI 回复",
  assistantThinkingSummary: "AI 思考摘要",
  threadId: "threadId",
  turnId: "turnId",
  engine: "engine",
};

export function getProjectMemoryDisplayRecordKind(
  memory: Partial<
    Pick<ProjectMemoryItem, "recordKind" | "source" | "turnId" | "userInput" | "assistantResponse">
  >,
): ProjectMemoryDisplayRecordKind {
  if (
    memory.recordKind === "conversation_turn" ||
    memory.source === "conversation_turn" ||
    Boolean(memory.turnId && (memory.userInput || memory.assistantResponse))
  ) {
    return "conversation_turn";
  }
  if (memory.recordKind === "manual_note" || memory.source === "manual") {
    return "manual_note";
  }
  return "legacy";
}

export function isConversationTurnMemory(
  memory: Partial<
    Pick<ProjectMemoryItem, "recordKind" | "source" | "turnId" | "userInput" | "assistantResponse">
  >,
) {
  return getProjectMemoryDisplayRecordKind(memory) === "conversation_turn";
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  return values.map((value) => compactWhitespace(value ?? "")).find(Boolean) ?? "";
}

export function resolveProjectMemoryCompactTitle(
  memory: Partial<Pick<ProjectMemoryItem, "title" | "summary" | "kind">>,
) {
  return firstNonEmpty(memory.title, memory.summary, memory.kind) || "Untitled memory";
}

export function resolveProjectMemoryCompactSummary(
  memory: Partial<Pick<
    ProjectMemoryItem,
    | "summary"
    | "cleanText"
    | "detail"
    | "userInput"
    | "assistantThinkingSummary"
    | "title"
  >>,
) {
  return (
    firstNonEmpty(
      memory.summary,
      memory.userInput,
      memory.assistantThinkingSummary,
      memory.cleanText,
      memory.detail,
      memory.title,
    ) || "No summary available."
  );
}

export function deriveProjectMemoryReviewState(
  memory: Partial<
    Pick<
      ProjectMemoryItem,
      | "reviewState"
      | "recordKind"
      | "source"
      | "turnId"
      | "userInput"
      | "assistantResponse"
    >
  >,
): ProjectMemoryReviewState {
  return resolveProjectMemoryReviewState(memory);
}

export function resolveProjectMemorySourceLocator(
  memory: Partial<Pick<ProjectMemoryItem, "threadId" | "turnId" | "engine">>,
): ProjectMemorySourceLocator {
  const threadId = memory.threadId?.trim() || null;
  const turnId = memory.turnId?.trim() || null;
  const engine = memory.engine?.trim() || null;
  return {
    available: Boolean(threadId && turnId),
    threadId,
    turnId,
    engine,
  };
}

export function buildConversationTurnMarkdown(
  memory: Partial<Pick<
    ProjectMemoryItem,
    | "userInput"
    | "assistantResponse"
    | "assistantThinkingSummary"
    | "threadId"
    | "turnId"
    | "engine"
  >>,
  labels: Partial<ConversationTurnLabels> = {},
) {
  const mergedLabels = {
    ...DEFAULT_CONVERSATION_TURN_LABELS,
    ...labels,
  };
  const sections: string[] = [];
  const metadata: string[] = [];
  if (memory.threadId?.trim()) {
    metadata.push(`${mergedLabels.threadId}: ${memory.threadId.trim()}`);
  }
  if (memory.turnId?.trim()) {
    metadata.push(`${mergedLabels.turnId}: ${memory.turnId.trim()}`);
  }
  if (memory.engine?.trim()) {
    metadata.push(`${mergedLabels.engine}: ${memory.engine.trim()}`);
  }
  if (metadata.length > 0) {
    sections.push(metadata.join("\n"));
  }
  if (memory.userInput?.trim()) {
    sections.push(`${mergedLabels.userInput}:\n${memory.userInput.trim()}`);
  }
  if (memory.assistantThinkingSummary?.trim()) {
    sections.push(
      `${mergedLabels.assistantThinkingSummary}:\n${memory.assistantThinkingSummary.trim()}`,
    );
  }
  if (memory.assistantResponse?.trim()) {
    sections.push(
      `${mergedLabels.assistantResponse}:\n${memory.assistantResponse.trim()}`,
    );
  }
  return sections.join("\n\n");
}

export function resolveProjectMemoryDetailText(
  memory: Partial<Pick<
    ProjectMemoryItem,
    | "recordKind"
    | "source"
    | "turnId"
    | "userInput"
    | "assistantResponse"
    | "assistantThinkingSummary"
    | "threadId"
    | "engine"
    | "detail"
    | "cleanText"
    | "summary"
    | "title"
  >>,
  labels?: Partial<ConversationTurnLabels>,
) {
  if (isConversationTurnMemory(memory)) {
    const conversationText = buildConversationTurnMarkdown(memory, labels);
    if (conversationText.trim()) {
      return conversationText;
    }
  }
  return (
    memory.detail?.trim() ||
    memory.cleanText?.trim() ||
    memory.summary?.trim() ||
    memory.title?.trim() ||
    ""
  );
}

export function resolveProjectMemoryInjectionText(
  memory: Partial<Pick<
    ProjectMemoryItem,
    | "recordKind"
    | "source"
    | "turnId"
    | "userInput"
    | "assistantResponse"
    | "assistantThinkingSummary"
    | "threadId"
    | "engine"
    | "detail"
    | "cleanText"
    | "summary"
    | "title"
  >>,
  mode: MemoryContextInjectionMode,
) {
  const summary = memory.summary?.trim() ?? "";
  if (mode === "summary") {
    return summary || memory.title?.trim() || memory.cleanText?.trim() || "";
  }
  return resolveProjectMemoryDetailText(memory);
}
