import type { useThreads } from "../features/threads/hooks/useThreads";
import type { WorkspaceInfo } from "../types";

type ThreadsController = ReturnType<typeof useThreads>;

export type RuntimeThreadShellBoundary = Pick<
  ThreadsController,
  | "activeItems"
  | "activeTurnIdByThread"
  | "completionEmailIntentByThread"
  | "handleFusionStalled"
  | "historyLoadingByThreadId"
  | "historyRestoredAtMsByThread"
  | "interruptTurn"
  | "listThreadsForWorkspace"
  | "loadOlderThreadsForWorkspace"
  | "rateLimitsByWorkspace"
  | "refreshAccountInfo"
  | "refreshAccountRateLimits"
  | "refreshThread"
  | "resetWorkspaceThreads"
  | "resolveCanonicalThreadId"
  | "sendUserMessage"
  | "sendUserMessageToThread"
  | "setActiveThreadId"
  | "startSharedSessionForWorkspace"
  | "startThreadForWorkspace"
  | "threadItemsByThread"
  | "threadListCursorByWorkspace"
  | "threadListLoadingByWorkspace"
  | "threadListPagingByWorkspace"
  | "threadParentById"
  | "threadStatusById"
  | "threadsByWorkspace"
  | "tokenUsageByThread"
  | "toggleCompletionEmailIntent"
  | "updateSharedSessionEngineSelection"
> & {
  activeThreadId: string | null;
  activeTurnId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  activeWorkspaceId: string | null;
  canInterrupt: boolean;
  isProcessing: boolean;
  isReviewing: boolean;
};

export function defineRuntimeThreadShellBoundary(
  boundary: RuntimeThreadShellBoundary,
): RuntimeThreadShellBoundary {
  return boundary;
}
