import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import { Button } from "../../../components/ui/button";
import { ensureRuntimeReady } from "../../../services/tauri";
import {
  normalizeRuntimeReconnectErrorMessage,
  type RuntimeReconnectHint,
} from "./runtimeReconnect";

type RuntimeReconnectCardProps = {
  hint: RuntimeReconnectHint;
  workspaceId?: string | null;
  threadId?: string | null;
  onRecoverThreadRuntime?: (
    workspaceId: string,
    threadId: string,
  ) => Promise<string | null | void> | string | null | void;
};

export function RuntimeReconnectCard({
  hint,
  workspaceId = null,
  threadId = null,
  onRecoverThreadRuntime,
}: RuntimeReconnectCardProps) {
  const { t } = useTranslation();
  const [isReconnectRunning, setIsReconnectRunning] = useState(false);
  const [reconnectStatus, setReconnectStatus] = useState<"idle" | "success" | "error">("idle");
  const [reconnectErrorDetail, setReconnectErrorDetail] = useState<string | null>(null);
  const requiresThreadRecovery = hint.reason === "thread-not-found";
  const reconnectUnavailable = requiresThreadRecovery
    ? !workspaceId || !threadId || !onRecoverThreadRuntime
    : !workspaceId;

  useEffect(() => {
    setIsReconnectRunning(false);
    setReconnectStatus("idle");
    setReconnectErrorDetail(null);
  }, [hint.rawMessage, threadId, workspaceId]);

  const handleReconnectRuntime = useCallback(async () => {
    if (!workspaceId || isReconnectRunning) {
      return;
    }
    setIsReconnectRunning(true);
    setReconnectStatus("idle");
    setReconnectErrorDetail(null);
    try {
      if (requiresThreadRecovery) {
        if (!threadId || !onRecoverThreadRuntime) {
          setReconnectStatus("error");
          setReconnectErrorDetail(
            t("messages.threadRecoveryUnavailable"),
          );
          return;
        }
        const recoveredThreadId = await onRecoverThreadRuntime(workspaceId, threadId);
        if (recoveredThreadId === null) {
          setReconnectStatus("error");
          setReconnectErrorDetail(t("messages.threadRecoveryRecoverFailed"));
          return;
        }
        setReconnectStatus("success");
        return;
      }
      await ensureRuntimeReady(workspaceId);
      if (threadId && onRecoverThreadRuntime) {
        const recoveredThreadId = await onRecoverThreadRuntime(workspaceId, threadId);
        if (recoveredThreadId === null) {
          setReconnectStatus("error");
          setReconnectErrorDetail(t("messages.runtimeReconnectRecoverFailed"));
          return;
        }
      }
      setReconnectStatus("success");
    } catch (error) {
      setReconnectStatus("error");
      setReconnectErrorDetail(normalizeRuntimeReconnectErrorMessage(error));
    } finally {
      setIsReconnectRunning(false);
    }
  }, [isReconnectRunning, onRecoverThreadRuntime, requiresThreadRecovery, t, threadId, workspaceId]);

  const description = requiresThreadRecovery
    ? t("messages.threadRecoveryThreadNotFound")
    : hint.reason === "broken-pipe"
      ? t("messages.runtimeReconnectBrokenPipe")
      : t("messages.runtimeReconnectWorkspaceNotConnected");
  const title = requiresThreadRecovery
    ? t("messages.threadRecoveryTitle")
    : t("messages.runtimeReconnectTitle");
  const actionLabel = isReconnectRunning
    ? requiresThreadRecovery
      ? t("messages.threadRecoveryRunning")
      : t("messages.runtimeReconnectRunning")
    : requiresThreadRecovery
      ? t("messages.threadRecoveryAction")
      : t("messages.runtimeReconnectAction");
  const unavailableLabel = requiresThreadRecovery
    ? t("messages.threadRecoveryUnavailable")
    : t("messages.runtimeReconnectUnavailable");
  const successLabel = requiresThreadRecovery
    ? t("messages.threadRecoverySuccess")
    : t("messages.runtimeReconnectSuccess");
  const failedLabel = requiresThreadRecovery
    ? t("messages.threadRecoveryFailed")
    : t("messages.runtimeReconnectFailed");

  return (
    <div className="message-runtime-recovery-card" role="group" aria-label={title}>
      <div className="message-runtime-recovery-header">
        <Terminal className="message-runtime-recovery-icon" size={15} aria-hidden />
        <div className="message-runtime-recovery-copy">
          <div className="message-runtime-recovery-title">{title}</div>
          <div className="message-runtime-recovery-description">{description}</div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="message-runtime-recovery-button"
          onClick={() => {
            void handleReconnectRuntime();
          }}
          disabled={reconnectUnavailable || isReconnectRunning}
        >
          {actionLabel}
        </Button>
      </div>
      <div className="message-runtime-recovery-detail">{hint.rawMessage}</div>
      {reconnectUnavailable ? (
        <div className="message-runtime-recovery-status is-error">
          {unavailableLabel}
        </div>
      ) : null}
      {reconnectStatus === "success" ? (
        <div className="message-runtime-recovery-status is-success">{successLabel}</div>
      ) : null}
      {reconnectStatus === "error" ? (
        <>
          <div className="message-runtime-recovery-status is-error">{failedLabel}</div>
          {reconnectErrorDetail ? (
            <div className="message-runtime-recovery-detail">{reconnectErrorDetail}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
