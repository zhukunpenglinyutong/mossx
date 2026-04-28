// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRequest } from "../../../types";
import i18n from "../../../i18n";
import { respondToServerRequest } from "../../../services/tauri";
import { useThreadApprovals } from "./useThreadApprovals";

vi.mock("../../../services/tauri", () => ({
  rememberApprovalRule: vi.fn(),
  respondToServerRequest: vi.fn(),
}));

describe("useThreadApprovals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approves all approvals in the same turn batch sequentially", async () => {
    const dispatch = vi.fn();
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 1,
        method: "item/fileChange/requestApproval",
        params: { turnId: "turn-1", threadId: "claude:thread-1", file_path: "aaa.txt" },
      },
      {
        workspace_id: "ws-1",
        request_id: 2,
        method: "item/fileChange/requestApproval",
        params: { turnId: "turn-1", threadId: "claude:thread-1", file_path: "bbb.txt" },
      },
      {
        workspace_id: "ws-1",
        request_id: 3,
        method: "item/fileChange/requestApproval",
        params: { turnId: "turn-2", threadId: "claude:thread-1", file_path: "ccc.txt" },
      },
    ];

    const { result } = renderHook(() =>
      useThreadApprovals({
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.handleApprovalBatchAccept([approvals[0]!, approvals[1]!]);
    });

    expect(respondToServerRequest).toHaveBeenNthCalledWith(1, "ws-1", 1, "accept");
    expect(respondToServerRequest).toHaveBeenNthCalledWith(2, "ws-1", 2, "accept");
    expect(respondToServerRequest).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "markProcessing",
      threadId: "claude:thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "setActiveTurnId",
      threadId: "claude:thread-1",
      turnId: "turn-1",
    });
    expect(dispatch).toHaveBeenNthCalledWith(3, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "claude:thread-1",
      item: {
        id: "1",
        kind: "tool",
        toolType: "fileChange",
        title: i18n.t("approval.applyingApprovedFileChange"),
        detail: JSON.stringify({ turnId: "turn-1", threadId: "claude:thread-1", file_path: "aaa.txt" }),
        status: "running",
        output: i18n.t("approval.resumingAfterApproval"),
        changes: [{ path: "aaa.txt" }],
      },
    });
    expect(dispatch).toHaveBeenNthCalledWith(4, {
      type: "removeApproval",
      requestId: 1,
      workspaceId: "ws-1",
      approval: approvals[0],
    });
    expect(dispatch).toHaveBeenNthCalledWith(5, {
      type: "markProcessing",
      threadId: "claude:thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenNthCalledWith(6, {
      type: "setActiveTurnId",
      threadId: "claude:thread-1",
      turnId: "turn-1",
    });
    expect(dispatch).toHaveBeenNthCalledWith(7, {
      type: "upsertItem",
      workspaceId: "ws-1",
      threadId: "claude:thread-1",
      item: {
        id: "2",
        kind: "tool",
        toolType: "fileChange",
        title: i18n.t("approval.applyingApprovedFileChange"),
        detail: JSON.stringify({ turnId: "turn-1", threadId: "claude:thread-1", file_path: "bbb.txt" }),
        status: "running",
        output: i18n.t("approval.resumingAfterApproval"),
        changes: [{ path: "bbb.txt" }],
      },
    });
    expect(dispatch).toHaveBeenNthCalledWith(8, {
      type: "removeApproval",
      requestId: 2,
      workspaceId: "ws-1",
      approval: approvals[1],
    });
  });

  it("approves the provided approval batch even when turn id is missing", async () => {
    const dispatch = vi.fn();
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 1,
        method: "item/fileChange/requestApproval",
        params: { threadId: "claude:thread-1", file_path: "aaa.txt" },
      },
      {
        workspace_id: "ws-1",
        request_id: 2,
        method: "item/fileChange/requestApproval",
        params: { threadId: "claude:thread-1", file_path: "bbb.txt" },
      },
      {
        workspace_id: "ws-1",
        request_id: 3,
        method: "item/fileChange/requestApproval",
        params: { threadId: "claude:thread-2", file_path: "ccc.txt" },
      },
    ];

    const { result } = renderHook(() =>
      useThreadApprovals({
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.handleApprovalBatchAccept([approvals[0]!, approvals[1]!]);
    });

    expect(respondToServerRequest).toHaveBeenNthCalledWith(1, "ws-1", 1, "accept");
    expect(respondToServerRequest).toHaveBeenNthCalledWith(2, "ws-1", 2, "accept");
    expect(respondToServerRequest).toHaveBeenCalledTimes(2);
  });

  it("routes Claude approval state updates to the canonical continuity thread", async () => {
    const dispatch = vi.fn();
    const approval: ApprovalRequest = {
      workspace_id: "ws-1",
      request_id: 1,
      method: "item/fileChange/requestApproval",
      params: {
        turnId: "turn-1",
        threadId: "claude:stale",
        file_path: "aaa.txt",
      },
    };

    const { result } = renderHook(() =>
      useThreadApprovals({
        dispatch,
        resolveClaudeContinuationThreadId: () => "claude:canonical",
      }),
    );

    await act(async () => {
      await result.current.handleApprovalDecision(approval, "accept");
    });

    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: "markProcessing",
      threadId: "claude:canonical",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: "setActiveTurnId",
      threadId: "claude:canonical",
      turnId: "turn-1",
    });
    expect(dispatch).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: "upsertItem",
        workspaceId: "ws-1",
        threadId: "claude:canonical",
      }),
    );
    expect(respondToServerRequest).toHaveBeenCalledWith("ws-1", 1, "accept");
  });

  it("dismisses a stale approval locally without sending a backend decision", async () => {
    const dispatch = vi.fn();
    const approval: ApprovalRequest = {
      workspace_id: "ws-1",
      request_id: "dismiss-1",
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "claude:thread-1",
        file_path: "aaa.txt",
      },
    };

    const { result } = renderHook(() =>
      useThreadApprovals({
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.handleApprovalDecision(approval, "dismiss");
    });

    expect(respondToServerRequest).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "removeApproval",
      requestId: "dismiss-1",
      workspaceId: "ws-1",
      approval,
    });
  });

  it("only approves the requests included in the provided batch", async () => {
    const dispatch = vi.fn();
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 1,
        method: "item/fileChange/requestApproval",
        params: { toolName: "Write", input: { file_path: "aaa.txt" } },
      },
      {
        workspace_id: "ws-1",
        request_id: 2,
        method: "item/fileChange/requestApproval",
        params: { toolName: "Write", input: { file_path: "bbb.txt" } },
      },
      {
        workspace_id: "ws-1",
        request_id: 3,
        method: "item/commandExecution/requestApproval",
        params: { toolName: "Bash", command: ["pwd"] },
      },
    ];

    const { result } = renderHook(() =>
      useThreadApprovals({
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.handleApprovalBatchAccept([approvals[0]!, approvals[1]!]);
    });

    expect(respondToServerRequest).toHaveBeenNthCalledWith(1, "ws-1", 1, "accept");
    expect(respondToServerRequest).toHaveBeenNthCalledWith(2, "ws-1", 2, "accept");
    expect(respondToServerRequest).toHaveBeenCalledTimes(2);
  });

  it("skips duplicate and non-file approvals inside the provided batch", async () => {
    const dispatch = vi.fn();
    const approvals: ApprovalRequest[] = [
      {
        workspace_id: "ws-1",
        request_id: 1,
        method: "item/fileChange/requestApproval",
        params: { toolName: "Write", input: { file_path: "aaa.txt" } },
      },
      {
        workspace_id: "ws-1",
        request_id: 2,
        method: "item/fileChange/requestApproval",
        params: { toolName: "Write", input: { file_path: "bbb.txt" } },
      },
      {
        workspace_id: "ws-1",
        request_id: 3,
        method: "item/commandExecution/requestApproval",
        params: { toolName: "Bash", command: ["pwd"] },
      },
    ];

    const { result } = renderHook(() =>
      useThreadApprovals({
        dispatch,
      }),
    );

    await act(async () => {
      await result.current.handleApprovalBatchAccept([
        approvals[0]!,
        approvals[0]!,
        approvals[2]!,
        approvals[1]!,
      ]);
    });

    expect(respondToServerRequest).toHaveBeenNthCalledWith(1, "ws-1", 1, "accept");
    expect(respondToServerRequest).toHaveBeenNthCalledWith(2, "ws-1", 2, "accept");
    expect(respondToServerRequest).toHaveBeenCalledTimes(2);
  });
});
