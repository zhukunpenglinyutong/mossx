import { useTranslation } from "react-i18next";

type ThreadDeleteConfirmBubbleProps = {
  threadName: string;
  isDeleting?: boolean;
  title?: string;
  message?: string;
  hint?: string;
  confirmLabel?: string;
  deletingLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ThreadDeleteConfirmBubble({
  threadName,
  isDeleting = false,
  title,
  message,
  hint,
  confirmLabel,
  deletingLabel,
  onCancel,
  onConfirm,
}: ThreadDeleteConfirmBubbleProps) {
  const { t } = useTranslation();
  const dialogTitle = title ?? t("threads.deleteThreadTitle");

  return (
    <div
      className="thread-delete-popover"
      role="dialog"
      aria-modal="false"
      aria-label={dialogTitle}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="thread-delete-popover-title">{dialogTitle}</div>
      <div className="thread-delete-popover-message">
        {message ?? t("threads.deleteThreadMessage", { name: threadName })}
      </div>
      <div className="thread-delete-popover-hint">
        {hint ?? t("threads.deleteThreadHint")}
      </div>
      <div className="thread-delete-popover-actions">
        <button
          type="button"
          className="thread-delete-popover-button thread-delete-popover-button-secondary"
          onClick={onCancel}
          disabled={isDeleting}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="thread-delete-popover-button thread-delete-popover-button-danger"
          onClick={onConfirm}
          disabled={isDeleting}
        >
          {isDeleting
            ? deletingLabel ?? t("common.deleting")
            : confirmLabel ?? t("threads.delete")}
        </button>
      </div>
    </div>
  );
}
