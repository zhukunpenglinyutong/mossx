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
};

export function RuntimeReconnectCard({
  hint,
  workspaceId = null,
}: RuntimeReconnectCardProps) {
  const { t } = useTranslation();
  const [isReconnectRunning, setIsReconnectRunning] = useState(false);
  const [reconnectStatus, setReconnectStatus] = useState<"idle" | "success" | "error">("idle");
  const [reconnectErrorDetail, setReconnectErrorDetail] = useState<string | null>(null);
  const reconnectUnavailable = !workspaceId;

  useEffect(() => {
    setIsReconnectRunning(false);
    setReconnectStatus("idle");
    setReconnectErrorDetail(null);
  }, [hint.rawMessage, workspaceId]);

  const handleReconnectRuntime = useCallback(async () => {
    if (!workspaceId || isReconnectRunning) {
      return;
    }
    setIsReconnectRunning(true);
    setReconnectStatus("idle");
    setReconnectErrorDetail(null);
    try {
      await ensureRuntimeReady(workspaceId);
      setReconnectStatus("success");
    } catch (error) {
      setReconnectStatus("error");
      setReconnectErrorDetail(normalizeRuntimeReconnectErrorMessage(error));
    } finally {
      setIsReconnectRunning(false);
    }
  }, [isReconnectRunning, workspaceId]);

  return (
    <div className="message-runtime-recovery-card" role="group" aria-label={t("messages.runtimeReconnectTitle")}>
      <div className="message-runtime-recovery-header">
        <Terminal className="message-runtime-recovery-icon" size={15} aria-hidden />
        <div className="message-runtime-recovery-copy">
          <div className="message-runtime-recovery-title">{t("messages.runtimeReconnectTitle")}</div>
          <div className="message-runtime-recovery-description">
            {hint.reason === "broken-pipe"
              ? t("messages.runtimeReconnectBrokenPipe")
              : t("messages.runtimeReconnectWorkspaceNotConnected")}
          </div>
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
          {isReconnectRunning
            ? t("messages.runtimeReconnectRunning")
            : t("messages.runtimeReconnectAction")}
        </Button>
      </div>
      <div className="message-runtime-recovery-detail">{hint.rawMessage}</div>
      {reconnectUnavailable ? (
        <div className="message-runtime-recovery-status is-error">
          {t("messages.runtimeReconnectUnavailable")}
        </div>
      ) : null}
      {reconnectStatus === "success" ? (
        <div className="message-runtime-recovery-status is-success">{t("messages.runtimeReconnectSuccess")}</div>
      ) : null}
      {reconnectStatus === "error" ? (
        <>
          <div className="message-runtime-recovery-status is-error">{t("messages.runtimeReconnectFailed")}</div>
          {reconnectErrorDetail ? (
            <div className="message-runtime-recovery-detail">{reconnectErrorDetail}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
