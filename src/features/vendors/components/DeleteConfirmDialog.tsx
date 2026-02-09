import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  providerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({
  isOpen,
  providerName,
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
      };
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="vendor-dialog-overlay" onClick={onCancel}>
      <div
        className="vendor-dialog vendor-dialog-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vendor-dialog-header">
          <h3>{t("settings.vendor.deleteConfirm.title")}</h3>
        </div>
        <div className="vendor-dialog-body">
          <p>
            {t("settings.vendor.deleteConfirm.message", {
              name: providerName,
            })}
          </p>
        </div>
        <div className="vendor-dialog-footer">
          <button type="button" className="vendor-btn-cancel" onClick={onCancel}>
            {t("settings.vendor.cancel")}
          </button>
          <button
            type="button"
            className="vendor-btn-danger-solid"
            onClick={onConfirm}
          >
            {t("settings.vendor.deleteConfirm.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
