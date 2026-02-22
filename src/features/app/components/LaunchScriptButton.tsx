import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import Play from "lucide-react/dist/esm/icons/play";
import type { LaunchScriptIconId } from "../../../types";
import { LaunchScriptIconPicker } from "./LaunchScriptIconPicker";
import { DEFAULT_LAUNCH_SCRIPT_ICON } from "../utils/launchScriptIcons";

type LaunchScriptButtonProps = {
  launchScript: string | null;
  editorOpen: boolean;
  draftScript: string;
  isSaving: boolean;
  error: string | null;
  onRun: () => void;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  showNew?: boolean;
  newEditorOpen?: boolean;
  newDraftScript?: string;
  newDraftIcon?: LaunchScriptIconId;
  newDraftLabel?: string;
  newError?: string | null;
  onOpenNew?: () => void;
  onCloseNew?: () => void;
  onNewDraftChange?: (value: string) => void;
  onNewDraftIconChange?: (value: LaunchScriptIconId) => void;
  onNewDraftLabelChange?: (value: string) => void;
  onCreateNew?: () => void;
};

export function LaunchScriptButton({
  launchScript,
  editorOpen,
  draftScript,
  isSaving,
  error,
  onRun,
  onOpenEditor,
  onCloseEditor,
  onDraftChange,
  onSave,
  showNew = false,
  newEditorOpen = false,
  newDraftScript = "",
  newDraftIcon = DEFAULT_LAUNCH_SCRIPT_ICON,
  newDraftLabel = "",
  newError = null,
  onOpenNew,
  onCloseNew,
  onNewDraftChange,
  onNewDraftIconChange,
  onNewDraftLabelChange,
  onCreateNew,
}: LaunchScriptButtonProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hasLaunchScript = Boolean(launchScript?.trim());

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const popoverElement = popoverRef.current;
      if (!popoverElement) {
        return;
      }
      if (!(event.target instanceof Node)) {
        return;
      }
      if (popoverElement.contains(event.target)) {
        return;
      }
      onCloseEditor();
      onCloseNew?.();
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [editorOpen, onCloseEditor, onCloseNew]);

  return (
    <div className="launch-script-menu" ref={popoverRef}>
      <div className="launch-script-buttons">
        <button
          type="button"
          className="ghost main-header-action launch-script-run"
          onClick={onRun}
          onContextMenu={(event) => {
            event.preventDefault();
            onOpenEditor();
          }}
          data-tauri-drag-region="false"
          aria-label={hasLaunchScript ? t("composer.runLaunchScript") : t("composer.setLaunchScript")}
          title={hasLaunchScript ? t("composer.runLaunchScript") : t("composer.setLaunchScript")}
        >
          <Play size={14} aria-hidden />
        </button>
      </div>
      {editorOpen && (
        <div
          className="launch-script-popover popover-surface"
          role="dialog"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="launch-script-title">{t("composer.launchScript")}</div>
          <textarea
            className="launch-script-textarea"
            placeholder="例如 npm run dev"
            value={draftScript}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={6}
            data-tauri-drag-region="false"
          />
          {error && <div className="launch-script-error">{error}</div>}
          <div className="launch-script-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onCloseEditor();
                onCloseNew?.();
              }}
              data-tauri-drag-region="false"
            >
              {t("common.cancel")}
            </button>
            {showNew && onOpenNew && (
              <button
                type="button"
                className="ghost"
                onClick={onOpenNew}
                data-tauri-drag-region="false"
              >
                {t("composer.new")}
              </button>
            )}
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={isSaving}
              data-tauri-drag-region="false"
            >
              {isSaving ? t("composer.saving") : t("common.save")}
            </button>
          </div>
          {showNew && newEditorOpen && onNewDraftChange && onNewDraftIconChange && onCreateNew && (
            <div className="launch-script-new">
              <div className="launch-script-title">{t("composer.newLaunchScript")}</div>
              <LaunchScriptIconPicker
                value={newDraftIcon}
                onChange={onNewDraftIconChange}
              />
              <input
                className="launch-script-input"
                type="text"
                placeholder={t("composer.optionalLabel")}
                value={newDraftLabel}
                onChange={(event) => onNewDraftLabelChange?.(event.target.value)}
                data-tauri-drag-region="false"
              />
              <textarea
                className="launch-script-textarea"
                placeholder="例如 npm run dev"
                value={newDraftScript}
                onChange={(event) => onNewDraftChange(event.target.value)}
                rows={5}
                data-tauri-drag-region="false"
              />
              {newError && <div className="launch-script-error">{newError}</div>}
              <div className="launch-script-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={onCloseNew}
                  data-tauri-drag-region="false"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={onCreateNew}
                  disabled={isSaving}
                  data-tauri-drag-region="false"
                >
                  {isSaving ? t("composer.saving") : t("common.create")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
