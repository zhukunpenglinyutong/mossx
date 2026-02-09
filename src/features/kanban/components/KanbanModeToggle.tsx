import { useTranslation } from "react-i18next";
import { MessageSquare, LayoutGrid } from "lucide-react";
import type { AppMode } from "../../../types";

type KanbanModeToggleProps = {
  appMode: AppMode;
  onAppModeChange: (mode: AppMode) => void;
};

export function KanbanModeToggle({
  appMode,
  onAppModeChange,
}: KanbanModeToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="kanban-mode-toggle">
      <button
        className={`kanban-mode-btn ${appMode === "chat" ? "is-active" : ""}`}
        onClick={() => onAppModeChange("chat")}
        title={t("kanban.mode.chat")}
        aria-label={t("kanban.mode.chat")}
        data-tauri-drag-region="false"
      >
        <span className="kanban-mode-label">{t("kanban.mode.chatShort")}</span>
        <MessageSquare size={13} />
      </button>
      <button
        className={`kanban-mode-btn ${appMode === "kanban" ? "is-active" : ""}`}
        onClick={() => onAppModeChange("kanban")}
        title={t("kanban.mode.kanban")}
        aria-label={t("kanban.mode.kanban")}
        data-tauri-drag-region="false"
      >
        <span className="kanban-mode-label">{t("kanban.mode.kanbanShort")}</span>
        <LayoutGrid size={13} />
      </button>
    </div>
  );
}
