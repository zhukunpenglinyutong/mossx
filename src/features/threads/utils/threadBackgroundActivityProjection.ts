import type {
  ApprovalRequest,
} from "../../../types";
import type {
  ThreadActivityStatus,
  ThreadBackgroundActivityProjection,
} from "../hooks/threadReducerTypes";

export type BuildThreadBackgroundActivityProjectionInput = {
  threadId: string;
  status?: ThreadActivityStatus | null;
  approvals?: ApprovalRequest[];
  bufferedOutputCount?: number;
  latestErrorSummary?: string | null;
};

export function buildThreadBackgroundActivityProjection({
  threadId,
  status,
  approvals = [],
  bufferedOutputCount = 0,
  latestErrorSummary = null,
}: BuildThreadBackgroundActivityProjectionInput): ThreadBackgroundActivityProjection {
  const needsApproval = approvals.some(
    (approval) => approval.params.thread_id === threadId,
  );
  const isRunning = Boolean(
    status?.isProcessing ||
      status?.isReviewing ||
      status?.isContextCompacting ||
      needsApproval,
  );
  const lastActivityAt =
    status?.processingStartedAt ??
    status?.codexCompactionCompletedAt ??
    status?.lastTokenUsageUpdatedAt ??
    null;

  return {
    threadId,
    isRunning,
    lastActivityAt,
    bufferedOutputCount: Math.max(0, Math.trunc(bufferedOutputCount)),
    hasUnread: Boolean(status?.hasUnread),
    needsApproval,
    latestErrorSummary: latestErrorSummary?.trim() || null,
  };
}
