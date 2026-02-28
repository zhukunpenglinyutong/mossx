import { buildItemsFromThread } from "../../../utils/threadItems";
import type { HistoryLoader } from "../contracts/conversationCurtainContracts";
import { normalizeHistorySnapshot } from "../contracts/conversationCurtainContracts";
import { asRecord } from "./historyLoaderUtils";
import { extractLatestTurnPlan } from "./historyLoaderUtils";
import { extractUserInputQueueFromThread } from "./historyLoaderUtils";

type CodexHistoryLoaderOptions = {
  workspaceId: string;
  resumeThread: (
    workspaceId: string,
    threadId: string,
  ) => Promise<Record<string, unknown> | null>;
};

export function createCodexHistoryLoader({
  workspaceId,
  resumeThread,
}: CodexHistoryLoaderOptions): HistoryLoader {
  return {
    engine: "codex",
    async load(threadId: string) {
      const response = await resumeThread(workspaceId, threadId);
      const result = asRecord(response?.result ?? response);
      const thread = asRecord(result.thread ?? response?.thread);
      const hasThread = Object.keys(thread).length > 0;
      return normalizeHistorySnapshot({
        engine: "codex",
        workspaceId,
        threadId,
        items: hasThread ? buildItemsFromThread(thread) : undefined,
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
