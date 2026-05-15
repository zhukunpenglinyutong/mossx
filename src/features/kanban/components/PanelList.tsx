import { useState } from "react";
import { useTranslation } from "react-i18next";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import Plus from "lucide-react/dist/esm/icons/plus";
import type { AppMode, WorkspaceInfo } from "../../../types";
import type { KanbanPanel, KanbanTask } from "../types";
import { PanelCard } from "./PanelCard";
import { KanbanModeToggle } from "./KanbanModeToggle";

type PanelListProps = {
  workspace: WorkspaceInfo;
  panels: KanbanPanel[];
  tasks: KanbanTask[];
  onBack: () => void;
  onSelectPanel: (panelId: string) => void;
  onCreatePanel: (name: string) => void;
  onRenamePanel: (panelId: string, name: string) => void;
  onDeletePanel: (panelId: string) => void;
  onAppModeChange: (mode: AppMode) => void;
};

export function PanelList({
  workspace,
  panels,
  tasks,
  onBack,
  onSelectPanel,
  onCreatePanel,
  onRenamePanel,
  onDeletePanel,
  onAppModeChange,
}: PanelListProps) {
  const { t } = useTranslation();
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newPanelName, setNewPanelName] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const sortedPanels = [...panels].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleCreateSubmit = () => {
    const trimmed = newPanelName.trim();
    if (trimmed) {
      onCreatePanel(trimmed);
      setNewPanelName("");
      setShowCreateInput(false);
    }
  };

  const handleDeleteConfirm = (panelId: string) => {
    onDeletePanel(panelId);
    setDeleteConfirmId(null);
  };

  const panelToDelete = deleteConfirmId
    ? panels.find((p) => p.id === deleteConfirmId)
    : null;
  const deleteTaskCount = deleteConfirmId
    ? tasks.filter((t) => t.panelId === deleteConfirmId).length
    : 0;

  return (
    <div className="kanban-projects">
      <div className="kanban-projects-topbar">
        <KanbanModeToggle appMode="kanban" onAppModeChange={onAppModeChange} />
      </div>
      <div className="kanban-projects-content">
        <div className="kanban-projects-header">
          <div className="kanban-panel-list-title-row">
            <button
              className="kanban-icon-btn"
              onClick={onBack}
              aria-label={t("kanban.board.back")}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="kanban-projects-title">{workspace.name}</h1>
              <p className="kanban-projects-subtitle">
                {t("kanban.panel.subtitle")}
              </p>
            </div>
          </div>
          <button
            className="kanban-btn kanban-btn-primary"
            onClick={() => setShowCreateInput(true)}
          >
            <Plus size={16} />
            {t("kanban.panel.create")}
          </button>
        </div>

        {showCreateInput && (
          <div className="kanban-panel-create-row">
            <input
              className="kanban-input"
              value={newPanelName}
              onChange={(e) => setNewPanelName(e.target.value)}
              placeholder={t("kanban.panel.namePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSubmit();
                if (e.key === "Escape") {
                  setShowCreateInput(false);
                  setNewPanelName("");
                }
              }}
            />
            <button
              className="kanban-btn kanban-btn-primary"
              onClick={handleCreateSubmit}
              disabled={!newPanelName.trim()}
            >
              {t("kanban.task.create")}
            </button>
            <button
              className="kanban-btn"
              onClick={() => {
                setShowCreateInput(false);
                setNewPanelName("");
              }}
            >
              {t("kanban.conversation.close")}
            </button>
          </div>
        )}

        {sortedPanels.length === 0 && !showCreateInput ? (
          <div className="kanban-empty">
            <p>{t("kanban.panel.empty")}</p>
            <button
              className="kanban-btn kanban-btn-primary"
              onClick={() => setShowCreateInput(true)}
            >
              <Plus size={16} />
              {t("kanban.panel.create")}
            </button>
          </div>
        ) : (
          <div className="kanban-projects-grid">
            {sortedPanels.map((panel) => (
              <PanelCard
                key={panel.id}
                panel={panel}
                tasks={tasks.filter((t) => t.panelId === panel.id)}
                onSelect={() => onSelectPanel(panel.id)}
                onRename={(name) => onRenamePanel(panel.id, name)}
                onDelete={() => setDeleteConfirmId(panel.id)}
              />
            ))}
          </div>
        )}
      </div>

      {deleteConfirmId && panelToDelete && (
        <div
          className="kanban-modal-overlay"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="kanban-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="kanban-modal-header">
              <h2>{t("kanban.panel.deleteConfirmTitle")}</h2>
            </div>
            <div className="kanban-modal-body">
              <p>
                {t("kanban.panel.deleteConfirmMessage", {
                  name: panelToDelete.name,
                  count: deleteTaskCount,
                })}
              </p>
            </div>
            <div className="kanban-modal-footer">
              <button
                className="kanban-btn"
                onClick={() => setDeleteConfirmId(null)}
              >
                {t("kanban.panel.cancel")}
              </button>
              <button
                className="kanban-btn kanban-btn-danger"
                onClick={() => handleDeleteConfirm(deleteConfirmId)}
              >
                {t("kanban.panel.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
