import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { AppMode, WorkspaceInfo } from "../../../types";
import type { KanbanTask } from "../types";
import { ProjectCard } from "./ProjectCard";
import { KanbanModeToggle } from "./KanbanModeToggle";

type ProjectListProps = {
  workspaces: WorkspaceInfo[];
  tasks: KanbanTask[];
  onSelectWorkspace: (workspaceId: string) => void;
  onAddWorkspace: () => void;
  onAppModeChange: (mode: AppMode) => void;
};

export function ProjectList({
  workspaces,
  tasks,
  onSelectWorkspace,
  onAddWorkspace,
  onAppModeChange,
}: ProjectListProps) {
  const { t } = useTranslation();

  // Only show main workspaces (not worktrees)
  const mainWorkspaces = workspaces.filter((w) => w.kind !== "worktree");

  return (
    <div className="kanban-projects">
      <div className="kanban-projects-topbar">
        <KanbanModeToggle appMode="kanban" onAppModeChange={onAppModeChange} />
      </div>
      <div className="kanban-projects-content">
        <div className="kanban-projects-header">
          <div>
            <h1 className="kanban-projects-title">
              {t("kanban.projects.title")}
            </h1>
            <p className="kanban-projects-subtitle">
              {t("kanban.projects.subtitle")}
            </p>
          </div>
          <button
            className="kanban-btn kanban-btn-primary"
            onClick={onAddWorkspace}
          >
            <Plus size={16} />
            {t("sidebar.addWorkspace")}
          </button>
        </div>

        {mainWorkspaces.length === 0 ? (
          <div className="kanban-empty">
            <p>{t("kanban.projects.empty")}</p>
            <button
              className="kanban-btn kanban-btn-primary"
              onClick={onAddWorkspace}
            >
              <Plus size={16} />
              {t("sidebar.addWorkspace")}
            </button>
          </div>
        ) : (
          <div className="kanban-projects-grid">
            {mainWorkspaces.map((workspace) => (
              <ProjectCard
                key={workspace.id}
                workspace={workspace}
                taskCount={
                  tasks.filter((t) => t.workspaceId === workspace.path).length
                }
                onSelect={() => onSelectWorkspace(workspace.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
