import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { KanbanPanel, KanbanTask, KanbanTaskStatus } from "../types";

type PanelCardProps = {
  panel: KanbanPanel;
  tasks: KanbanTask[];
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
};

const STATUS_COLORS: Record<KanbanTaskStatus, string> = {
  todo: "#1a1a1a",
  inprogress: "#3b82f6",
  testing: "#f59e0b",
  done: "#22c55e",
};

export function PanelCard({
  panel,
  tasks,
  onSelect,
  onRename,
  onDelete,
}: PanelCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(panel.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const statusCounts: Record<KanbanTaskStatus, number> = {
    todo: 0,
    inprogress: 0,
    testing: 0,
    done: 0,
  };
  for (const task of tasks) {
    if (statusCounts[task.status] !== undefined) {
      statusCounts[task.status] += 1;
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renaming]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== panel.name) {
      onRename(trimmed);
    }
    setRenaming(false);
  };

  const handleCardClick = () => {
    if (!renaming) {
      onSelect();
    }
  };

  return (
    <div className="kanban-panel-card" onClick={handleCardClick}>
      <div className="kanban-panel-card-header">
        <LayoutGrid size={18} className="kanban-panel-card-icon" />
        {renaming ? (
          <input
            ref={renameRef}
            className="kanban-panel-rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="kanban-panel-card-name">{panel.name}</span>
        )}
        <div className="kanban-panel-card-menu" ref={menuRef}>
          <button
            className="kanban-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            aria-label={t("kanban.panel.menu")}
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="kanban-dropdown-menu">
              <button
                className="kanban-dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setRenameValue(panel.name);
                  setRenaming(true);
                }}
              >
                <Pencil size={14} />
                {t("kanban.panel.rename")}
              </button>
              <button
                className="kanban-dropdown-item kanban-dropdown-item-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Trash2 size={14} />
                {t("kanban.panel.delete")}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="kanban-panel-card-stats">
        {(["todo", "inprogress", "testing", "done"] as KanbanTaskStatus[]).map(
          (status) =>
            statusCounts[status] > 0 && (
              <span key={status} className="kanban-panel-stat">
                <span
                  className="kanban-panel-stat-dot"
                  style={{ background: STATUS_COLORS[status] }}
                />
                {t(`kanban.columns.${status}`)} {statusCounts[status]}
              </span>
            )
        )}
      </div>
      <div className="kanban-panel-card-footer">
        <span className="kanban-panel-card-count">
          {t("kanban.projects.taskCount", { count: tasks.length })}
        </span>
      </div>
    </div>
  );
}
