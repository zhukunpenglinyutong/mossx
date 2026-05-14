import type { ProjectMemoryItem } from "../../../services/tauri";
export type ProjectMemoryReviewState =
  | "unreviewed"
  | "kept"
  | "converted"
  | "obsolete"
  | "dismissed";

function getProjectMemoryDisplayRecordKind(
  memory: Partial<
    Pick<ProjectMemoryItem, "recordKind" | "source" | "turnId" | "userInput" | "assistantResponse">
  >,
) {
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

function isConversationTurnMemory(
  memory: Partial<
    Pick<ProjectMemoryItem, "recordKind" | "source" | "turnId" | "userInput" | "assistantResponse">
  >,
) {
  return getProjectMemoryDisplayRecordKind(memory) === "conversation_turn";
}

export type ProjectMemoryHealthState =
  | "complete"
  | "input_only"
  | "assistant_only"
  | "pending_fusion"
  | "capture_failed";

export function deriveProjectMemoryHealthState(
  memory: Partial<
    Pick<
      ProjectMemoryItem,
      "userInput" | "assistantResponse" | "source" | "recordKind" | "turnId" | "createdAt"
    >
  >,
  nowMs = Date.now(),
): ProjectMemoryHealthState {
  if (!isConversationTurnMemory(memory)) {
    return "complete";
  }
  const hasUserInput = Boolean(memory.userInput?.trim());
  const hasAssistantResponse = Boolean(memory.assistantResponse?.trim());
  if (hasUserInput && hasAssistantResponse) {
    return "complete";
  }
  if (hasUserInput) {
    const ageMs = Math.max(0, nowMs - (memory.createdAt ?? nowMs));
    return ageMs < 30_000 ? "pending_fusion" : "input_only";
  }
  if (hasAssistantResponse) {
    return "assistant_only";
  }
  return "capture_failed";
}

export function resolveProjectMemoryReviewState(
  memory: Partial<
    Pick<
      ProjectMemoryItem,
      "reviewState" | "recordKind" | "source" | "turnId" | "userInput" | "assistantResponse"
    >
  >,
): ProjectMemoryReviewState {
  if (memory.reviewState) {
    return memory.reviewState;
  }
  return isConversationTurnMemory(memory) ? "unreviewed" : "kept";
}
