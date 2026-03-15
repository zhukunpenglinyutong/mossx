import { buildItemsFromThread, mergeThreadItems } from "../../../utils/threadItems";
import type { ConversationItem } from "../../../types";
import type { HistoryLoader } from "../contracts/conversationCurtainContracts";
import { normalizeHistorySnapshot } from "../contracts/conversationCurtainContracts";
import { parseCodexSessionHistory } from "./codexSessionHistory";
import { asRecord } from "./historyLoaderUtils";
import { extractLatestTurnPlan } from "./historyLoaderUtils";
import { extractUserInputQueueFromThread } from "./historyLoaderUtils";

type CodexHistoryLoaderOptions = {
  workspaceId: string;
  resumeThread: (
    workspaceId: string,
    threadId: string,
  ) => Promise<Record<string, unknown> | null>;
  loadCodexSession?: (workspaceId: string, threadId: string) => Promise<unknown>;
};

function appendUniqueItems(
  target: ConversationItem[],
  seenIds: Set<string>,
  items: ConversationItem[],
) {
  items.forEach((item) => {
    if (seenIds.has(item.id)) {
      return;
    }
    seenIds.add(item.id);
    target.push(item);
  });
}

function mergeCodexHistoryPreservingTurns(
  historyItems: ConversationItem[],
  fallbackItems: ConversationItem[],
) {
  if (!historyItems.length) {
    return fallbackItems;
  }

  const remoteMessageCount = historyItems.filter((item) => item.kind === "message").length;
  const fallbackUserTurns: ConversationItem[][] = [];
  const leadingStructuredItems: ConversationItem[] = [];
  let currentTurnBucket: ConversationItem[] | null = null;

  fallbackItems.forEach((item) => {
    if (item.kind === "message" && item.role === "user") {
      currentTurnBucket = [];
      fallbackUserTurns.push(currentTurnBucket);
      return;
    }
    if (item.kind === "message") {
      return;
    }
    if (currentTurnBucket) {
      currentTurnBucket.push(item);
      return;
    }
    leadingStructuredItems.push(item);
  });

  if (fallbackUserTurns.length === 0 || remoteMessageCount === 0) {
    return mergeThreadItems(historyItems, fallbackItems.filter((item) => item.kind !== "message"));
  }

  const merged: ConversationItem[] = [];
  const seenIds = new Set<string>();
  let turnIndex = 0;

  appendUniqueItems(merged, seenIds, leadingStructuredItems);

  historyItems.forEach((item) => {
    appendUniqueItems(merged, seenIds, [item]);
    if (item.kind === "message" && item.role === "user") {
      const bucket = fallbackUserTurns[turnIndex] ?? [];
      appendUniqueItems(merged, seenIds, bucket);
      turnIndex += 1;
    }
  });

  for (; turnIndex < fallbackUserTurns.length; turnIndex += 1) {
    appendUniqueItems(merged, seenIds, fallbackUserTurns[turnIndex] ?? []);
  }

  return merged;
}

export function createCodexHistoryLoader({
  workspaceId,
  resumeThread,
  loadCodexSession,
}: CodexHistoryLoaderOptions): HistoryLoader {
  return {
    engine: "codex",
    async load(threadId: string) {
      const response = await resumeThread(workspaceId, threadId);
      const result = asRecord(response?.result ?? response);
      const thread = asRecord(result.thread ?? response?.thread);
      const hasThread = Object.keys(thread).length > 0;
      const historyItems = hasThread ? buildItemsFromThread(thread) : [];
      let items = historyItems;

      if (loadCodexSession) {
        try {
          const fallbackHistory = await loadCodexSession(workspaceId, threadId);
          const fallbackItems = parseCodexSessionHistory(fallbackHistory);
          items = mergeCodexHistoryPreservingTurns(historyItems, fallbackItems);
        } catch (error) {
          console.warn("Failed to load Codex local history fallback", {
            workspaceId,
            threadId,
            error,
          });
        }
      }

      return normalizeHistorySnapshot({
        engine: "codex",
        workspaceId,
        threadId,
        items,
        plan: hasThread ? extractLatestTurnPlan(thread) : undefined,
        userInputQueue: hasThread
          ? extractUserInputQueueFromThread(thread, workspaceId, threadId)
          : [],
        meta: {
          workspaceId,
          threadId,
          engine: "codex",
          activeTurnId: null,
          isThinking: false,
          heartbeatPulse: null,
          historyRestoredAtMs: Date.now(),
        },
      });
    },
  };
}
