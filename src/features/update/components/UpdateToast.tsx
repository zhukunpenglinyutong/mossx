import { useTranslation } from "react-i18next";
import type { UpdateState } from "../hooks/useUpdater";

type UpdateToastProps = {
  state: UpdateState;
  onUpdate: () => void;
  onDismiss: () => void;
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function UpdateToast({ state, onUpdate, onDismiss }: UpdateToastProps) {
  const { t } = useTranslation();

  if (state.stage === "idle") {
    return null;
  }

  const totalBytes = state.progress?.totalBytes;
  const downloadedBytes = state.progress?.downloadedBytes ?? 0;
  const percent =
    totalBytes && totalBytes > 0
      ? Math.min(100, (downloadedBytes / totalBytes) * 100)
      : null;

  return (
    <div className="update-toasts" role="region" aria-live="polite">
      <div className="update-toast" role="status">
        <div className="update-toast-header">
          <div className="update-toast-title">{t("update.title")}</div>
          {state.version ? (
            <div className="update-toast-version">v{state.version}</div>
          ) : null}
        </div>
        {state.stage === "checking" && (
          <div className="update-toast-body">{t("update.checkingForUpdates")}</div>
        )}
        {state.stage === "available" && (
          <>
            <div className="update-toast-body">
              {t("update.updateAvailable")}
            </div>
            <div className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                {t("common.later")}
              </button>
              <button className="primary" onClick={onUpdate}>
                {t("update.title")}
              </button>
            </div>
          </>
        )}
        {state.stage === "latest" && (
          <div className="update-toast-inline">
            <div className="update-toast-body update-toast-body-inline">
              {t("update.upToDate")}
            </div>
            <button className="secondary" onClick={onDismiss}>
              {t("common.dismiss")}
            </button>
          </div>
        )}
        {state.stage === "downloading" && (
          <>
            <div className="update-toast-body">
              {t("update.downloading")}
            </div>
            <div className="update-toast-progress">
              <div className="update-toast-progress-bar">
                <span
                  className="update-toast-progress-fill"
                  style={{ width: percent ? `${percent}%` : "24%" }}
                />
              </div>
              <div className="update-toast-progress-meta">
                {totalBytes
                  ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
                  : `${formatBytes(downloadedBytes)} ${t("update.downloaded")}`}
              </div>
            </div>
          </>
        )}
        {state.stage === "installing" && (
          <div className="update-toast-body">{t("update.installing")}</div>
        )}
        {state.stage === "restarting" && (
          <div className="update-toast-body">{t("update.restarting")}</div>
        )}
        {state.stage === "error" && (
          <>
            <div className="update-toast-body">{t("update.failed")}</div>
            {state.error ? (
              <div className="update-toast-error">{state.error}</div>
            ) : null}
            <div className="update-toast-actions">
              <button className="secondary" onClick={onDismiss}>
                {t("common.dismiss")}
              </button>
              <button className="primary" onClick={onUpdate}>
                {t("common.retry")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
