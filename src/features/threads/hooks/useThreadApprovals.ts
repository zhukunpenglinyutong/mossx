import { useCallback, useRef } from "react";
import type { Dispatch } from "react";
import type { ApprovalRequest, DebugEntry } from "../../../types";
import i18n from "../../../i18n";
import {
  getApprovalThreadId,
  getApprovalTurnId,
} from "../../../utils/approvalBatching";
import { normalizeCommandTokens } from "../../../utils/approvalRules";
import {
  rememberApprovalRule,
  respondToServerRequest,
} from "../../../services/tauri";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadApprovalsOptions = {
  dispatch: Dispatch<ThreadAction>;
  onDebug?: (entry: DebugEntry) => void;
  resolveClaudeContinuationThreadId?: (
    workspaceId: string,
    threadId: string,
    turnId?: string | null,
  ) => string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getApprovalInputRecord(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const nestedInput = asRecord(params.input);
  return Object.keys(nestedInput).length > 0 ? nestedInput : params;
}

function getApprovalPath(params: Record<string, unknown>): string | null {
  for (const key of [
    "file_path",
    "filePath",
    "filepath",
    "path",
    "target_file",
    "targetFile",
    "filename",
    "file",
    "notebook_path",
    "notebookPath",
  ]) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isFileChangeApprovalRequest(request: ApprovalRequest): boolean {
  return request.method.includes("fileChange");
}

function buildApprovalRequestKey(request: ApprovalRequest): string {
  return `${request.workspace_id}:${String(request.request_id)}`;
}

export function useThreadApprovals({
  dispatch,
  onDebug,
  resolveClaudeContinuationThreadId,
}: UseThreadApprovalsOptions) {
  const approvalAllowlistRef = useRef<Record<string, string[][]>>({});

  const markApprovalAsApplying = useCallback(
    (request: ApprovalRequest) => {
      const rawThreadId = getApprovalThreadId(request);
      const turnId = getApprovalTurnId(request);
      const threadId =
        (rawThreadId
          ? resolveClaudeContinuationThreadId?.(
              request.workspace_id,
              rawThreadId,
              turnId,
            )
          : null) ?? rawThreadId;
      if (!threadId || !request.method.includes("fileChange")) {
        return;
      }
      dispatch({
        type: "markProcessing",
        threadId,
        isProcessing: true,
        timestamp: Date.now(),
      });
      dispatch({
        type: "setActiveTurnId",
        threadId,
        turnId: getApprovalTurnId(request),
      });
      const params = request.params ?? {};
      const input = getApprovalInputRecord(params);
      const filePath = getApprovalPath(input) ?? getApprovalPath(params);
      dispatch({
        type: "upsertItem",
        workspaceId: request.workspace_id,
        threadId,
        item: {
          id: String(request.request_id),
          kind: "tool",
          toolType: "fileChange",
          title: i18n.t("approval.applyingApprovedFileChange"),
          detail: JSON.stringify(input),
          status: "running",
          output: i18n.t("approval.resumingAfterApproval"),
          changes: filePath ? [{ path: filePath }] : undefined,
        },
      });
    },
    [dispatch, resolveClaudeContinuationThreadId],
  );

  const rememberApprovalPrefix = useCallback((workspaceId: string, command: string[]) => {
    const normalized = normalizeCommandTokens(command);
    if (!normalized.length) {
      return;
    }
    const allowlist = approvalAllowlistRef.current[workspaceId] ?? [];
    const exists = allowlist.some(
      (entry) =>
        entry.length === normalized.length &&
        entry.every((token, index) => token === normalized[index]),
    );
    if (!exists) {
      approvalAllowlistRef.current = {
        ...approvalAllowlistRef.current,
        [workspaceId]: [...allowlist, normalized],
      };
    }
  }, []);

  const handleApprovalDecision = useCallback(
    async (request: ApprovalRequest, decision: "accept" | "decline" | "dismiss") => {
      if (decision === "dismiss") {
        dispatch({
          type: "removeApproval",
          requestId: request.request_id,
          workspaceId: request.workspace_id,
          approval: request,
        });
        onDebug?.({
          id: `${Date.now()}-client-approval-dismissed`,
          timestamp: Date.now(),
          source: "client",
          label: "approval dismissed",
          payload: {
            workspaceId: request.workspace_id,
            requestId: request.request_id,
            method: request.method,
          },
        });
        return;
      }
      if (decision === "accept") {
        markApprovalAsApplying(request);
      }
      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        decision,
      );
      dispatch({
        type: "removeApproval",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
        approval: request,
      });
    },
    [dispatch, markApprovalAsApplying, onDebug],
  );

  const handleApprovalBatchAccept = useCallback(
    async (batch: ApprovalRequest[]) => {
      const seenRequestKeys = new Set<string>();
      const uniqueFileBatch = batch.filter((approval) => {
        if (!isFileChangeApprovalRequest(approval)) {
          return false;
        }
        const requestKey = buildApprovalRequestKey(approval);
        if (seenRequestKeys.has(requestKey)) {
          return false;
        }
        seenRequestKeys.add(requestKey);
        return true;
      });

      for (const approval of uniqueFileBatch) {
        markApprovalAsApplying(approval);
        await respondToServerRequest(
          approval.workspace_id,
          approval.request_id,
          "accept",
        );
        dispatch({
          type: "removeApproval",
          requestId: approval.request_id,
          workspaceId: approval.workspace_id,
          approval,
        });
      }
    },
    [dispatch, markApprovalAsApplying],
  );

  const handleApprovalRemember = useCallback(
    async (request: ApprovalRequest, command: string[]) => {
      try {
        await rememberApprovalRule(request.workspace_id, command);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-approval-rule-error`,
          timestamp: Date.now(),
          source: "error",
          label: "approval rule error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }

      rememberApprovalPrefix(request.workspace_id, command);

      markApprovalAsApplying(request);

      await respondToServerRequest(
        request.workspace_id,
        request.request_id,
        "accept",
      );
      dispatch({
        type: "removeApproval",
        requestId: request.request_id,
        workspaceId: request.workspace_id,
        approval: request,
      });
    },
    [dispatch, markApprovalAsApplying, onDebug, rememberApprovalPrefix],
  );

  return {
    approvalAllowlistRef,
    handleApprovalDecision,
    handleApprovalBatchAccept,
    handleApprovalRemember,
  };
}
