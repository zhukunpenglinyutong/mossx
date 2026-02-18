import type { MouseEvent } from "react";
import type { WorkspaceInfo } from "../../../types";

type WorkspaceCardProps = {
  workspace: WorkspaceInfo;
  workspaceName?: React.ReactNode;
  isActive: boolean;
  hasPrimaryActiveThread: boolean;
  isCollapsed: boolean;
  onSelectWorkspace: (id: string) => void;
  onShowWorkspaceMenu: (event: MouseEvent, workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onAddAgent: (workspace: WorkspaceInfo) => void;
  children?: React.ReactNode;
};

export function WorkspaceCard({
  workspace,
  workspaceName,
  isActive,
  hasPrimaryActiveThread,
  isCollapsed,
  onSelectWorkspace,
  onShowWorkspaceMenu,
  onToggleWorkspaceCollapse,
  onAddAgent,
  children,
}: WorkspaceCardProps) {
  const handleRowClick = () => {
    onSelectWorkspace(workspace.id);
    onToggleWorkspaceCollapse(workspace.id, !isCollapsed);
  };

  const handleNewSession = (event: MouseEvent) => {
    event.stopPropagation();
    onAddAgent(workspace);
  };

  return (
    <div className={`workspace-card ${isActive ? "is-active" : ""}`}>
      <div
        className={`workspace-row ${
          isActive
            ? hasPrimaryActiveThread
              ? "context-active"
              : "active"
            : ""
        }`}
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onContextMenu={(event) => onShowWorkspaceMenu(event, workspace)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleRowClick();
          }
        }}
      >
        <div className="workspace-header-content">
          <button className="workspace-folder-btn">
            {isActive ? (
              <span className="codicon codicon-folder-opened" style={{ fontSize: "16px" }} />
            ) : (
              <span className="codicon codicon-folder" style={{ fontSize: "16px" }} />
            )}
          </button>

          <span className="workspace-name-text">{workspaceName ?? workspace.name}</span>

          <div className="workspace-actions">
            <button
              className="workspace-action-btn"
              onClick={(e) => onShowWorkspaceMenu(e, workspace)}
              aria-label="More options"
            >
              <span className="codicon codicon-ellipsis" style={{ fontSize: "14px" }} />
            </button>
            <button
              className="workspace-action-btn"
              onClick={handleNewSession}
              aria-label="New Session"
            >
              <span className="codicon codicon-add" style={{ fontSize: "14px" }} />
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
