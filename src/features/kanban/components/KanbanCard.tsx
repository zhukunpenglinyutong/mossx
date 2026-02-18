import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Draggable } from "@hello-pangea/dnd";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { KanbanTask } from "../types";
import type { EngineType } from "../../../types";
import { EngineIcon } from "../../engine/components/EngineIcon";

type KanbanCardProps = {
  task: KanbanTask;
  index: number;
  isSelected?: boolean;
  isProcessing?: boolean;
  processingStartedAt?: number | null;
  onSelect: () => void;
  onDelete: () => void;
  onEdit?: () => void;
};

const ENGINE_NAMES: Record<EngineType, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes.toString().padStart(2, "0")}m`;
}

export function KanbanCard({ task, index, isSelected, isProcessing, processingStartedAt, onSelect, onDelete, onEdit }: KanbanCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDragHint, setShowDragHint] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState("");

  const updateElapsed = useCallback(() => {
    if (isProcessing && processingStartedAt) {
      setElapsed(formatElapsed(Date.now() - processingStartedAt));
    }
  }, [isProcessing, processingStartedAt]);

  useEffect(() => {
    if (!isProcessing || !processingStartedAt) {
      setElapsed("");
      return;
    }
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [isProcessing, processingStartedAt, updateElapsed]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (dragHintTimerRef.current) clearTimeout(dragHintTimerRef.current);
    };
  }, []);

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          className={`kanban-card${snapshot.isDragging ? " is-dragging" : ""}${isSelected ? " is-selected" : ""}`}
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => {
            if (task.status === "todo") {
              setShowDragHint(true);
              if (dragHintTimerRef.current) clearTimeout(dragHintTimerRef.current);
              dragHintTimerRef.current = setTimeout(() => setShowDragHint(false), 3000);
            } else {
              onSelect();
            }
          }}
        >
          {showDragHint && task.status === "todo" && (
            <div className="kanban-card-drag-hint">
              {t("kanban.task.dragToStart")}
            </div>
          )}
          <div className="kanban-card-header">
            <span
              className="kanban-card-engine"
              title={ENGINE_NAMES[task.engineType] ?? task.engineType}
            >
              <EngineIcon engine={task.engineType} size={15} />
            </span>
            <span className="kanban-card-title">{task.title}</span>
            <div className="kanban-card-menu" ref={menuRef}>
              <button
                className="kanban-icon-btn kanban-card-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                aria-label={t("kanban.task.menu")}
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <div className="kanban-dropdown-menu">
                  {task.status === "todo" && onEdit && (
                    <button
                      className="kanban-dropdown-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onEdit();
                      }}
                    >
                      <Pencil size={14} />
                      {t("kanban.task.edit")}
                    </button>
                  )}
                  <button
                    className="kanban-dropdown-item kanban-dropdown-item-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Trash2 size={14} />
                    {t("kanban.task.delete")}
                  </button>
                </div>
              )}
            </div>
          </div>
          {task.description && (
            <p className="kanban-card-desc">{task.description}</p>
          )}
          {isProcessing && (
            <div className="kanban-card-status-row">
              <span className="kanban-card-spinner" />
              <span className="kanban-card-processing-text">
                {t("kanban.task.processing")}
              </span>
              {elapsed && (
                <span className="kanban-card-elapsed">{elapsed}</span>
              )}
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
