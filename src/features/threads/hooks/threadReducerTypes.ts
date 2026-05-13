import type {
  AccountSnapshot,
  ApprovalRequest,
  ConversationItem,
  RateLimitSnapshot,
  RequestUserInputRequest,
  ThreadSummary,
  ThreadTokenUsage,
  TurnPlan,
} from "../../../types";
import type { NormalizedThreadEvent } from "../contracts/conversationCurtainContracts";
import type {
  CodexAcceptedTurnFact,
  CodexAcceptedTurnRecord,
} from "../utils/codexConversationLiveness";

export type CodexCompactionSource = "auto" | "manual";
export type CodexCompactionLifecycleState = "idle" | "compacting" | "completed";

export type ThreadActivityStatus = {
  isProcessing: boolean;
  hasUnread: boolean;
  isReviewing: boolean;
  isContextCompacting?: boolean;
  processingStartedAt: number | null;
  lastDurationMs: number | null;
  heartbeatPulse?: number;
  continuationPulse?: number;
  terminalPulse?: number;
  codexCompactionSource?: CodexCompactionSource | null;
  codexCompactionLifecycleState?: CodexCompactionLifecycleState;
  codexCompactionCompletedAt?: number | null;
  lastTokenUsageUpdatedAt?: number | null;
};

export type ThreadBackgroundActivityProjection = {
  threadId: string;
  isRunning: boolean;
  lastActivityAt: number | null;
  bufferedOutputCount: number;
  hasUnread: boolean;
  needsApproval: boolean;
  latestErrorSummary: string | null;
};

export type ThreadState = {
  activeThreadIdByWorkspace: Record<string, string | null>;
  itemsByThread: Record<string, ConversationItem[]>;
  historyRestoredAtMsByThread: Record<string, number | null>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  hiddenThreadIdsByWorkspace: Record<string, Record<string, true>>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<string, ThreadActivityStatus>;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  activeTurnIdByThread: Record<string, string | null>;
  codexAcceptedTurnByThread: Record<string, CodexAcceptedTurnRecord>;
  approvals: ApprovalRequest[];
  userInputRequests: RequestUserInputRequest[];
  tokenUsageByThread: Record<string, ThreadTokenUsage>;
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null>;
  accountByWorkspace: Record<string, AccountSnapshot | null>;
  planByThread: Record<string, TurnPlan | null>;
  lastAgentMessageByThread: Record<string, { text: string; timestamp: number }>;
  agentSegmentByThread: Record<string, number>;
};

export type ThreadAction =
  | { type: "setActiveThreadId"; workspaceId: string; threadId: string | null }
  | {
      type: "ensureThread";
      workspaceId: string;
      threadId: string;
      engine?: "codex" | "claude" | "gemini" | "opencode";
      folderId?: string | null;
    }
  | { type: "hideThread"; workspaceId: string; threadId: string }
  | { type: "removeThread"; workspaceId: string; threadId: string }
  | { type: "setThreadParent"; threadId: string; parentId: string }
  | {
      type: "markProcessing";
      threadId: string;
      isProcessing: boolean;
      timestamp: number;
    }
  | {
      type: "markContextCompacting";
      threadId: string;
      isCompacting: boolean;
      timestamp?: number;
      source?: CodexCompactionSource | null;
      completionStatus?: "completed" | "idle";
    }
  | {
      type: "settleCodexCompactionMessage";
      threadId: string;
      text: string;
      fallbackMessageId?: string | null;
      appendIfAlreadyCompleted?: boolean;
    }
  | {
      type: "appendCodexCompactionMessage";
      threadId: string;
      text: string;
    }
  | {
      type: "discardLatestCodexCompactionMessage";
      threadId: string;
      text: string;
    }
  | {
      type: "setThreadHistoryRestoredAt";
      threadId: string;
      timestamp: number | null;
    }
  | { type: "markHeartbeat"; threadId: string; pulse: number }
  | { type: "markContinuationEvidence"; threadId: string }
  | { type: "markTerminalSettlement"; threadId: string }
  | {
      type: "finalizePendingToolStatuses";
      threadId: string;
      status: "completed" | "failed";
    }
  | { type: "markReviewing"; threadId: string; isReviewing: boolean }
  | { type: "markUnread"; threadId: string; hasUnread: boolean }
  | { type: "addAssistantMessage"; threadId: string; text: string }
  | { type: "setThreadName"; workspaceId: string; threadId: string; name: string }
  | {
      type: "setThreadEngine";
      workspaceId: string;
      threadId: string;
      engine: "codex" | "claude" | "gemini" | "opencode";
    }
  | {
      type: "setThreadTimestamp";
      workspaceId: string;
      threadId: string;
      timestamp: number;
    }
  | {
      type: "appendAgentDelta";
      workspaceId: string;
      threadId: string;
      itemId: string;
      delta: string;
      hasCustomName: boolean;
    }
  | {
      type: "completeAgentMessage";
      workspaceId: string;
      threadId: string;
      itemId: string;
      text: string;
      hasCustomName: boolean;
      timestamp?: number;
    }
  | {
      type: "upsertItem";
      workspaceId: string;
      threadId: string;
      item: ConversationItem;
      hasCustomName?: boolean;
    }
  | {
      type: "applyNormalizedRealtimeEvent";
      workspaceId: string;
      threadId: string;
      event: NormalizedThreadEvent;
      hasCustomName: boolean;
    }
  | { type: "clearProcessingGeneratedImages"; threadId: string }
  | { type: "evictThreadItems"; threadIds: string[] }
  | { type: "setThreadItems"; threadId: string; items: ConversationItem[] }
  | {
      type: "appendReasoningSummary";
      threadId: string;
      itemId: string;
      delta: string;
    }
  | {
      type: "appendReasoningSummaryBoundary";
      threadId: string;
      itemId: string;
    }
  | {
      type: "appendContextCompacted";
      threadId: string;
      turnId: string;
    }
  | { type: "appendReasoningContent"; threadId: string; itemId: string; delta: string }
  | { type: "dropReasoningItems"; threadId: string }
  | { type: "appendToolOutput"; threadId: string; itemId: string; delta: string }
  | { type: "setThreads"; workspaceId: string; threads: ThreadSummary[] }
  | {
      type: "setThreadListLoading";
      workspaceId: string;
      isLoading: boolean;
    }
  | {
      type: "setThreadListPaging";
      workspaceId: string;
      isLoading: boolean;
    }
  | {
      type: "setThreadListCursor";
      workspaceId: string;
      cursor: string | null;
    }
  | { type: "addApproval"; approval: ApprovalRequest }
  | {
      type: "removeApproval";
      requestId: number | string;
      workspaceId: string;
      approval?: ApprovalRequest;
    }
  | { type: "addUserInputRequest"; request: RequestUserInputRequest }
  | {
      type: "removeUserInputRequest";
      requestId: number | string;
      workspaceId: string;
    }
  | {
      type: "clearUserInputRequestsForThread";
      workspaceId: string;
      threadId: string;
    }
  | { type: "setThreadTokenUsage"; threadId: string; tokenUsage: ThreadTokenUsage }
  | {
      type: "setRateLimits";
      workspaceId: string;
      rateLimits: RateLimitSnapshot | null;
    }
  | {
      type: "setAccountInfo";
      workspaceId: string;
      account: AccountSnapshot | null;
    }
  | { type: "setActiveTurnId"; threadId: string; turnId: string | null }
  | {
      type: "markCodexAcceptedTurn";
      threadId: string;
      fact: CodexAcceptedTurnFact;
      source: string;
      timestamp: number;
    }
  | { type: "setThreadPlan"; threadId: string; plan: TurnPlan | null }
  | {
      type: "settleThreadPlanInProgress";
      threadId: string;
      targetStatus: "pending" | "completed";
    }
  | { type: "clearThreadPlan"; threadId: string }
  | { type: "incrementAgentSegment"; threadId: string }
  | { type: "resetAgentSegment"; threadId: string }
  | { type: "markLatestAssistantMessageFinal"; threadId: string }
  | {
      type: "setLastAgentMessage";
      threadId: string;
      text: string;
      timestamp: number;
    }
  | {
      type: "renameThreadId";
      workspaceId: string;
      oldThreadId: string;
      newThreadId: string;
    };
