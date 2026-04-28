import type { ConversationItem, ThreadSummary } from "../../../types";
import { prepareThreadItems } from "../../../utils/threadItems";
import { appendEvent as appendNormalizedRealtimeEvent } from "../assembly/conversationAssembler";
import type { NormalizedThreadEvent } from "../contracts/conversationCurtainContracts";
import type { ThreadAction, ThreadState } from "./useThreadsReducer";

type ApplyNormalizedRealtimeEventAction = Extract<
  ThreadAction,
  { type: "applyNormalizedRealtimeEvent" }
>;

type RenameThreadsByAssistant = (input: {
  workspaceId: string;
  threadId: string;
  items: ConversationItem[];
  itemId?: string;
  hasCustomName: boolean;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
}) => Record<string, ThreadSummary[]>;

function applyAssistantCompletionMetadata(
  items: ConversationItem[],
  itemId: string,
  completedAt: number,
  durationMs: number | null,
) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (
      !candidate ||
      candidate.kind !== "message" ||
      candidate.role !== "assistant" ||
      candidate.id !== itemId
    ) {
      continue;
    }
    const next = [...items];
    next[index] = {
      ...candidate,
      isFinal: true,
      finalCompletedAt: Math.max(candidate.finalCompletedAt ?? 0, completedAt) || completedAt,
      ...(typeof candidate.finalDurationMs === "number"
        ? { finalDurationMs: candidate.finalDurationMs }
        : durationMs !== null
          ? { finalDurationMs: durationMs }
          : {}),
    };
    return next;
  }
  return items;
}

function shouldPrepareNormalizedRealtimeItems(event: NormalizedThreadEvent) {
  if (event.item.kind === "message") {
    return event.item.role === "user";
  }
  return (
    event.item.kind === "tool" ||
    event.item.kind === "generatedImage" ||
    event.item.kind === "review" ||
    event.item.kind === "explore" ||
    event.item.kind === "diff"
  );
}

export function reduceNormalizedRealtimeEvent(
  state: ThreadState,
  action: ApplyNormalizedRealtimeEventAction,
  renameThreadsByAssistant: RenameThreadsByAssistant,
): ThreadState {
  const assembled = appendNormalizedRealtimeEvent(
    {
      items: state.itemsByThread[action.threadId] ?? [],
      plan: state.planByThread[action.threadId] ?? null,
      userInputQueue: [],
      meta: {
        workspaceId: action.workspaceId,
        threadId: action.threadId,
        engine: action.event.engine,
        activeTurnId: state.activeTurnIdByThread[action.threadId] ?? null,
        isThinking: state.threadStatusById[action.threadId]?.isProcessing ?? false,
        heartbeatPulse: state.threadStatusById[action.threadId]?.heartbeatPulse ?? null,
        historyRestoredAtMs: null,
      },
    },
    action.event,
  );

  const status = state.threadStatusById[action.threadId];
  const completedAt = Date.now();
  const durationMs =
    typeof status?.lastDurationMs === "number"
      ? Math.max(0, status.lastDurationMs)
      : status?.processingStartedAt
        ? Math.max(0, completedAt - status.processingStartedAt)
        : null;

  let updatedItems = assembled.items;
  if (
    action.event.operation === "completeAgentMessage" &&
    action.event.item.kind === "message" &&
    action.event.item.role === "assistant"
  ) {
    updatedItems = applyAssistantCompletionMetadata(
      updatedItems,
      action.event.item.id,
      completedAt,
      durationMs,
    );
  }
  if (shouldPrepareNormalizedRealtimeItems(action.event)) {
    updatedItems = prepareThreadItems(updatedItems);
  }

  if (updatedItems === (state.itemsByThread[action.threadId] ?? [])) {
    return state;
  }

  const isAssistantMessageEvent =
    action.event.item.kind === "message" && action.event.item.role === "assistant";
  const nextThreadsByWorkspace = isAssistantMessageEvent
    ? renameThreadsByAssistant({
        workspaceId: action.workspaceId,
        threadId: action.threadId,
        items: updatedItems,
        itemId: action.event.item.id,
        hasCustomName: action.hasCustomName,
        threadsByWorkspace: state.threadsByWorkspace,
      })
    : state.threadsByWorkspace;

  return {
    ...state,
    itemsByThread: {
      ...state.itemsByThread,
      [action.threadId]: updatedItems,
    },
    threadsByWorkspace: nextThreadsByWorkspace,
  };
}
