import { useCallback } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type { ApprovalRequest } from "../../../types";
import { getApprovalTurnId } from "../../../utils/approvalBatching";
import {
  getApprovalCommandInfo,
  matchesCommandPrefix,
} from "../../../utils/approvalRules";
import { respondToServerRequest } from "../../../services/tauri";
import type { ThreadAction } from "./useThreadsReducer";

const FILE_APPROVAL_PATH_KEYS = [
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
] as const;

type UseThreadApprovalEventsOptions = {
  dispatch: Dispatch<ThreadAction>;
  approvalAllowlistRef: MutableRefObject<Record<string, string[][]>>;
  markProcessing: (threadId: string, processing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
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
  for (const key of FILE_APPROVAL_PATH_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function useThreadApprovalEvents({
  dispatch,
  approvalAllowlistRef,
  markProcessing,
  setActiveTurnId,
  resolveClaudeContinuationThreadId,
}: UseThreadApprovalEventsOptions) {
  return useCallback(
    (approval: ApprovalRequest) => {
      const rawThreadId = String(
        approval.params?.threadId ?? approval.params?.thread_id ?? "",
      ).trim();
      const turnId = getApprovalTurnId(approval);
      const threadId =
        (rawThreadId
          ? resolveClaudeContinuationThreadId?.(
              approval.workspace_id,
              rawThreadId,
              turnId,
            )
          : null) ?? rawThreadId;
      if (threadId) {
        markProcessing(threadId, false);
        setActiveTurnId(threadId, null);
      }

      if (threadId && approval.method.includes("fileChange")) {
        const params = approval.params ?? {};
        const input = getApprovalInputRecord(params);
        const filePath = getApprovalPath(input) ?? getApprovalPath(params);
        dispatch({
          type: "upsertItem",
          workspaceId: approval.workspace_id,
          threadId,
          item: {
            id: String(approval.request_id),
            kind: "tool",
            toolType: "fileChange",
            title: "Pending file approval",
            detail: JSON.stringify(input),
            status: "pending",
            output:
              "Waiting for approval. This file change has not been executed.",
            changes: filePath ? [{ path: filePath }] : undefined,
          },
        });
      }

      const commandInfo = getApprovalCommandInfo(approval.params ?? {});
      const allowlist =
        approvalAllowlistRef.current[approval.workspace_id] ?? [];
      if (commandInfo && matchesCommandPrefix(commandInfo.tokens, allowlist)) {
        void respondToServerRequest(
          approval.workspace_id,
          approval.request_id,
          "accept",
        );
        return;
      }
      const normalizedApproval =
        threadId && rawThreadId && threadId !== rawThreadId
          ? {
              ...approval,
              params: {
                ...approval.params,
                threadId,
                thread_id: threadId,
              },
            }
          : approval;
      dispatch({ type: "addApproval", approval: normalizedApproval });
    },
    [
      approvalAllowlistRef,
      dispatch,
      markProcessing,
      resolveClaudeContinuationThreadId,
      setActiveTurnId,
    ],
  );
}
