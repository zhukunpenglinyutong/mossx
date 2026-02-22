import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Check from "lucide-react/dist/esm/icons/check";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert";
import Copy from "lucide-react/dist/esm/icons/copy";

type WorktreeCreateResultDialogProps = {
  result: {
    kind: "info" | "warning";
    createdMessage: string;
    statusMessage: string | null;
    errorMessage: string | null;
    retryCommand: string | null;
  };
  onClose: () => void;
};

export function WorktreeCreateResultDialog({
  result,
  onClose,
}: WorktreeCreateResultDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const isWarning = result.kind === "warning";

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current != null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleCopy = async () => {
    if (!result.retryCommand) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.retryCommand);
      setCopied(true);
      if (copyTimeoutRef.current != null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      // Ignore clipboard failures.
    }
  };

  return (
    <div className="worktree-result-modal" role="dialog" aria-modal="true">
      <div className="worktree-result-modal-backdrop" onClick={onClose} />
      <div className="worktree-result-modal-card">
        <header className="worktree-result-modal-header">
          <div className={`worktree-result-modal-icon ${isWarning ? "is-warning" : "is-success"}`}>
            {isWarning ? <AlertTriangle size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}
          </div>
          <div className="worktree-result-modal-header-main">
            <h3>{t("workspace.worktreeCreateResultTitle")}</h3>
            <p>{isWarning ? t("workspace.worktreeResultWarningSubtitle") : t("workspace.worktreeResultSuccessSubtitle")}</p>
          </div>
        </header>

        <div className="worktree-result-modal-success">
          <CheckCircle2 size={16} aria-hidden />
          <span>{result.createdMessage}</span>
        </div>

        {result.errorMessage && (
          <section className="worktree-result-modal-warning">
            <div className="worktree-result-modal-warning-title">
              <AlertTriangle size={15} aria-hidden />
              <span>{t("workspace.worktreeResultErrorTitle")}</span>
            </div>
            <p>{result.errorMessage}</p>
          </section>
        )}

        {result.statusMessage && <p className="worktree-result-modal-status">{result.statusMessage}</p>}

        {result.retryCommand && (
          <section className="worktree-result-modal-retry">
            <div className="worktree-result-modal-retry-head">
              <span>{t("workspace.worktreePublishRetryCommandLabel")}</span>
              <button
                type="button"
                className={`ghost worktree-result-copy-button${copied ? " is-copied" : ""}`}
                onClick={() => {
                  void handleCopy();
                }}
              >
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                <span>{copied ? t("messages.copied") : t("workspace.copyCommand")}</span>
              </button>
            </div>
            <code>{result.retryCommand}</code>
          </section>
        )}

        <footer className="worktree-result-modal-actions">
          <button type="button" className="primary worktree-result-ok-button" onClick={onClose}>
            {t("common.ok")}
          </button>
        </footer>
      </div>
    </div>
  );
}
