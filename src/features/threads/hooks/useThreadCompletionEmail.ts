import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  ConversationItem,
  DebugEntry,
  EmailSendError,
} from "../../../types";
import i18n from "../../../i18n";
import { sendConversationCompletionEmail } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import {
  buildConversationCompletionEmail,
  type ConversationCompletionEmailMetadata,
} from "../utils/conversationCompletionEmail";
import { resolveCompletionEmailIntentThreadId } from "../utils/completionEmailIntent";

const COMPLETION_EMAIL_POST_SETTLEMENT_DELAY_MS = 0;

type CompletionEmailIntentStatus = "armed" | "sending";
type CompletionEmailTerminalStatus = "completed" | "error" | "stalled";

export type CompletionEmailIntent = {
  targetTurnId: string | null;
  armedAt: number;
  status: CompletionEmailIntentStatus;
};

type UseThreadCompletionEmailOptions = {
  activeThreadId: string | null;
  activeTurnIdByThreadRef: MutableRefObject<Record<string, string | null>>;
  itemsByThreadRef: MutableRefObject<Record<string, ConversationItem[]>>;
  resolveCanonicalThreadId: (threadId: string) => string;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  getCompletionEmailMetadata: (
    workspaceId: string,
    threadId: string,
    turnId: string,
  ) => ConversationCompletionEmailMetadata;
  onDebug?: (entry: DebugEntry) => void;
};

function isEmailSendError(error: unknown): error is EmailSendError {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    typeof (error as EmailSendError).code === "string" &&
    typeof (error as EmailSendError).userMessage === "string"
  );
}

function completionEmailKey(threadId: string, turnId: string) {
  return `${threadId}:${turnId}`;
}

export function useThreadCompletionEmail({
  activeThreadId,
  activeTurnIdByThreadRef,
  itemsByThreadRef,
  resolveCanonicalThreadId,
  setActiveTurnId,
  getCompletionEmailMetadata,
  onDebug,
}: UseThreadCompletionEmailOptions) {
  const [completionEmailIntentByThread, setCompletionEmailIntentByThread] = useState<
    Record<string, CompletionEmailIntent>
  >({});
  const completionEmailIntentByThreadRef = useRef(completionEmailIntentByThread);
  const sentCompletionEmailKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    completionEmailIntentByThreadRef.current = completionEmailIntentByThread;
  }, [completionEmailIntentByThread]);

  const clearCompletionEmailIntent = useCallback(
    (threadId: string, turnId?: string | null) => {
      setCompletionEmailIntentByThread((prev) => {
        const current = prev[threadId];
        if (!current) {
          return prev;
        }
        if (turnId && current.targetTurnId && current.targetTurnId !== turnId) {
          return prev;
        }
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
    },
    [],
  );

  const toggleCompletionEmailIntent = useCallback(
    (threadId?: string | null) => {
      const targetThreadId = threadId ?? activeThreadId;
      if (!targetThreadId) {
        return;
      }
      const activeTurnId = activeTurnIdByThreadRef.current[targetThreadId] ?? null;
      setCompletionEmailIntentByThread((prev) => {
        if (prev[targetThreadId]) {
          const next = { ...prev };
          delete next[targetThreadId];
          return next;
        }
        return {
          ...prev,
          [targetThreadId]: {
            targetTurnId: activeTurnId,
            armedAt: Date.now(),
            status: "armed",
          },
        };
      });
    },
    [activeThreadId, activeTurnIdByThreadRef],
  );

  const bindCompletionEmailIntentToTurn = useCallback(
    (threadId: string, turnId: string | null | undefined) => {
      const normalizedTurnId = turnId?.trim() ?? "";
      if (!normalizedTurnId) {
        return;
      }
      setCompletionEmailIntentByThread((prev) => {
        const current = prev[threadId];
        if (!current || current.status === "sending" || current.targetTurnId) {
          return prev;
        }
        return {
          ...prev,
          [threadId]: {
            ...current,
            targetTurnId: normalizedTurnId,
          },
        };
      });
    },
    [],
  );

  const setActiveTurnIdWithCompletionEmail = useCallback(
    (threadId: string, turnId: string | null) => {
      setActiveTurnId(threadId, turnId);
      if (turnId) {
        bindCompletionEmailIntentToTurn(threadId, turnId);
      }
    },
    [bindCompletionEmailIntentToTurn, setActiveTurnId],
  );

  const renameCompletionEmailIntentThread = useCallback(
    (oldThreadId: string, newThreadId: string) => {
      if (oldThreadId === newThreadId) {
        return;
      }
      setCompletionEmailIntentByThread((prev) => {
        const current = prev[oldThreadId];
        if (!current) {
          return prev;
        }
        const next = { ...prev };
        delete next[oldThreadId];
        next[newThreadId] = current;
        return next;
      });
    },
    [],
  );

  const sendCompletionEmailForTurn = useCallback(
    async (workspaceId: string, threadId: string, turnId: string) => {
      const resolvedThreadId = resolveCompletionEmailIntentThreadId(
        threadId,
        completionEmailIntentByThreadRef.current,
        resolveCanonicalThreadId,
      );
      const key = completionEmailKey(resolvedThreadId, turnId);
      const currentIntent = completionEmailIntentByThreadRef.current[resolvedThreadId];
      if (!currentIntent) {
        return;
      }
      const matchesTarget =
        currentIntent.targetTurnId === turnId ||
        (
          currentIntent.targetTurnId === null &&
          activeTurnIdByThreadRef.current[resolvedThreadId] === turnId
        );
      if (!matchesTarget) {
        return;
      }
      if (sentCompletionEmailKeysRef.current.has(key)) {
        clearCompletionEmailIntent(resolvedThreadId, turnId);
        return;
      }
      setCompletionEmailIntentByThread((prev) => {
        const current = prev[resolvedThreadId];
        if (!current || (current.targetTurnId && current.targetTurnId !== turnId)) {
          return prev;
        }
        return {
          ...prev,
          [resolvedThreadId]: {
            ...current,
            targetTurnId: turnId,
            status: "sending",
          },
        };
      });

      const buildResult = buildConversationCompletionEmail(
        itemsByThreadRef.current[resolvedThreadId] ?? [],
        getCompletionEmailMetadata(workspaceId, resolvedThreadId, turnId),
      );
      if (buildResult.status === "skipped") {
        onDebug?.({
          id: `${Date.now()}-completion-email-skipped`,
          timestamp: Date.now(),
          source: "client",
          label: "completion-email/skipped",
          payload: {
            workspaceId,
            threadId: resolvedThreadId,
            turnId,
            reason: buildResult.reason,
          },
        });
        pushErrorToast({
          title: i18n.t("common.warning"),
          message: i18n.t("threads.completionEmailSkipped"),
          variant: "info",
          durationMs: 3600,
        });
        clearCompletionEmailIntent(resolvedThreadId, turnId);
        return;
      }

      try {
        sentCompletionEmailKeysRef.current.add(key);
        const result = await sendConversationCompletionEmail(buildResult.request);
        onDebug?.({
          id: `${Date.now()}-completion-email-sent`,
          timestamp: Date.now(),
          source: "client",
          label: "completion-email/sent",
          payload: {
            workspaceId,
            threadId: resolvedThreadId,
            turnId,
            provider: result.provider,
            acceptedRecipientCount: result.acceptedRecipients.length,
            durationMs: result.durationMs,
          },
        });
        pushErrorToast({
          title: i18n.t("common.success"),
          message: i18n.t("threads.completionEmailSent"),
          variant: "success",
          durationMs: 3200,
        });
      } catch (error) {
        const message = isEmailSendError(error)
          ? i18n.t(`settings.emailError.${error.code}`, {
              defaultValue: error.userMessage,
            })
          : error instanceof Error
            ? error.message
            : String(error);
        onDebug?.({
          id: `${Date.now()}-completion-email-failed`,
          timestamp: Date.now(),
          source: "error",
          label: "completion-email/failed",
          payload: {
            workspaceId,
            threadId: resolvedThreadId,
            turnId,
            code: isEmailSendError(error) ? error.code : "unknown",
            retryable: isEmailSendError(error) ? error.retryable : false,
          },
        });
        pushErrorToast({
          title: i18n.t("threads.completionEmailFailedTitle"),
          message,
          variant: "error",
          durationMs: 5200,
        });
        sentCompletionEmailKeysRef.current.delete(key);
      } finally {
        clearCompletionEmailIntent(resolvedThreadId, turnId);
      }
    },
    [
      activeTurnIdByThreadRef,
      clearCompletionEmailIntent,
      getCompletionEmailMetadata,
      itemsByThreadRef,
      onDebug,
      resolveCanonicalThreadId,
    ],
  );

  const scheduleCompletionEmailForTurn = useCallback(
    (workspaceId: string, threadId: string, turnId: string) => {
      if (typeof window === "undefined") {
        void sendCompletionEmailForTurn(workspaceId, threadId, turnId);
        return;
      }
      window.setTimeout(() => {
        void sendCompletionEmailForTurn(workspaceId, threadId, turnId);
      }, COMPLETION_EMAIL_POST_SETTLEMENT_DELAY_MS);
    },
    [sendCompletionEmailForTurn],
  );

  const settleCompletionEmailIntent = useCallback(
    (
      workspaceId: string,
      threadId: string,
      turnId: string,
      status: CompletionEmailTerminalStatus,
    ) => {
      const resolvedThreadId = resolveCompletionEmailIntentThreadId(
        threadId,
        completionEmailIntentByThreadRef.current,
        resolveCanonicalThreadId,
      );
      const currentIntent = completionEmailIntentByThreadRef.current[resolvedThreadId];
      const normalizedTurnId = turnId.trim();
      if (status === "completed") {
        if (!normalizedTurnId) {
          if (currentIntent) {
            onDebug?.({
              id: `${Date.now()}-completion-email-missed-terminal`,
              timestamp: Date.now(),
              source: "client",
              label: "completion-email/missed-terminal",
              payload: {
                workspaceId,
                threadId: resolvedThreadId,
                requestedThreadId: threadId,
                targetTurnId: currentIntent.targetTurnId,
                reason: "missing_turn_id",
              },
            });
            clearCompletionEmailIntent(resolvedThreadId);
          }
          return;
        }
        scheduleCompletionEmailForTurn(workspaceId, resolvedThreadId, normalizedTurnId);
        return;
      }
      clearCompletionEmailIntent(resolvedThreadId, normalizedTurnId);
    },
    [
      clearCompletionEmailIntent,
      onDebug,
      resolveCanonicalThreadId,
      scheduleCompletionEmailForTurn,
    ],
  );

  return {
    completionEmailIntentByThread,
    clearCompletionEmailIntent,
    toggleCompletionEmailIntent,
    setActiveTurnIdWithCompletionEmail,
    renameCompletionEmailIntentThread,
    settleCompletionEmailIntent,
  };
}
