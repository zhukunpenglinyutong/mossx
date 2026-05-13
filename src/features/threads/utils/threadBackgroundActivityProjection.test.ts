import { describe, expect, it } from "vitest";
import type { ApprovalRequest } from "../../../types";
import type { ThreadActivityStatus } from "../hooks/threadReducerTypes";
import { buildThreadBackgroundActivityProjection } from "./threadBackgroundActivityProjection";

const processingStatus: ThreadActivityStatus = {
  isProcessing: true,
  hasUnread: true,
  isReviewing: false,
  processingStartedAt: 100,
  lastDurationMs: null,
};

describe("buildThreadBackgroundActivityProjection", () => {
  it("projects lightweight running metadata without conversation items", () => {
    expect(
      buildThreadBackgroundActivityProjection({
        threadId: "thread-1",
        status: processingStatus,
        bufferedOutputCount: 4,
        latestErrorSummary: "  slow render  ",
      }),
    ).toEqual({
      threadId: "thread-1",
      isRunning: true,
      lastActivityAt: 100,
      bufferedOutputCount: 4,
      hasUnread: true,
      needsApproval: false,
      latestErrorSummary: "slow render",
    });
  });

  it("treats pending approval as background activity", () => {
    const approval: ApprovalRequest = {
      request_id: "approval-1",
      workspace_id: "workspace-1",
      method: "exec",
      params: {
        thread_id: "thread-1",
        command: ["npm", "test"],
        cwd: "/tmp",
        reason: null,
      },
    };

    expect(
      buildThreadBackgroundActivityProjection({
        threadId: "thread-1",
        status: null,
        approvals: [approval],
      }),
    ).toMatchObject({
      isRunning: true,
      needsApproval: true,
    });
  });
});
