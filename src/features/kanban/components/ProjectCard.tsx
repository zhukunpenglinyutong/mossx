import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import type { WorkspaceInfo } from "../../../types";

type ProjectCardProps = {
  workspace: WorkspaceInfo;
  taskCount: number;
  onSelect: () => void;
};

/** Shorten absolute path: replace home dir with ~ */
function shortenPath(fullPath: string): string {
  const home =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>).__HOME_DIR__
      : undefined;
  if (typeof home === "string" && fullPath.startsWith(home)) {
    return "~" + fullPath.slice(home.length);
  }
  // Fallback: try common macOS/Linux home prefix
  const match = fullPath.match(/^\/Users\/[^/]+\/(.+)$/);
  if (match) return "~/" + match[1];
  return fullPath;
}

export function ProjectCard({
  workspace,
  taskCount,
  onSelect,
}: ProjectCardProps) {
  const { t } = useTranslation();
  const displayPath = useMemo(
    () => shortenPath(workspace.path),
    [workspace.path],
  );

  return (
    <div className="kanban-project-card" onClick={onSelect}>
      <div className="kanban-project-card-header">
        <FolderOpen size={18} className="kanban-project-card-icon" />
        <span className="kanban-project-card-name">{workspace.name}</span>
      </div>
      <div className="kanban-project-card-footer">
        <span className="kanban-project-card-path" title={workspace.path}>
          {displayPath}
        </span>
        {taskCount > 0 && (
          <span className="kanban-project-card-count">
            {t("kanban.projects.taskCount", { count: taskCount })}
          </span>
        )}
      </div>
    </div>
  );
}
