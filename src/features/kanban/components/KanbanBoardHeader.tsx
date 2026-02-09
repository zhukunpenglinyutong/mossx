import { useTranslation } from "react-i18next";
import { ArrowLeft, Search, CornerUpLeft, PanelRight } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import type { AppMode, WorkspaceInfo } from "../../../types";
import type { KanbanPanel } from "../types";
import { KanbanModeToggle } from "./KanbanModeToggle";

type KanbanBoardHeaderProps = {
  workspace: WorkspaceInfo;
  workspaces: WorkspaceInfo[];
  panel: KanbanPanel;
  panels: KanbanPanel[];
  onBack: () => void;
  onAppModeChange: (mode: AppMode) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectPanel: (panelId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showGitPanel: boolean;
  onToggleGitPanel: () => void;
};

export function KanbanBoardHeader({
  workspace,
  workspaces,
  panel,
  panels,
  onBack,
  onAppModeChange,
  onSelectWorkspace,
  onSelectPanel,
  searchQuery,
  onSearchChange,
  showGitPanel,
  onToggleGitPanel,
}: KanbanBoardHeaderProps) {
  const { t } = useTranslation();
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const [panelQuery, setPanelQuery] = useState("");
  const panelMenuRef = useRef<HTMLDivElement | null>(null);

  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [wsQuery, setWsQuery] = useState("");
  const wsMenuRef = useRef<HTMLDivElement | null>(null);

  const showPanelMenu = panels.length > 1;
  const showWsMenu = workspaces.length > 1;

  const trimmedQuery = panelQuery.trim().toLowerCase();
  const filteredPanels = useMemo(() => {
    if (trimmedQuery.length === 0) return panels;
    return panels.filter((p) =>
      p.name.toLowerCase().includes(trimmedQuery)
    );
  }, [panels, trimmedQuery]);

  const trimmedWsQuery = wsQuery.trim().toLowerCase();
  const filteredWorkspaces = useMemo(() => {
    if (trimmedWsQuery.length === 0) return workspaces;
    return workspaces.filter((w) =>
      w.name.toLowerCase().includes(trimmedWsQuery)
    );
  }, [workspaces, trimmedWsQuery]);

  const handleSelectPanel = (panelId: string) => {
    onSelectPanel(panelId);
    setPanelMenuOpen(false);
    setPanelQuery("");
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    onSelectWorkspace(workspaceId);
    setWsMenuOpen(false);
    setWsQuery("");
  };

  useEffect(() => {
    if (!panelMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(panelMenuRef.current?.contains(target) ?? false)) {
        setPanelMenuOpen(false);
        setPanelQuery("");
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [panelMenuOpen]);

  useEffect(() => {
    if (!wsMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(wsMenuRef.current?.contains(target) ?? false)) {
        setWsMenuOpen(false);
        setWsQuery("");
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [wsMenuOpen]);

  return (
    <div className="kanban-board-header">
      <div className="kanban-board-header-left">
        <KanbanModeToggle appMode="kanban" onAppModeChange={onAppModeChange} />
        <button
          className="kanban-icon-btn"
          onClick={onBack}
          aria-label={t("kanban.board.back")}
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          className="kanban-return-chat-link"
          onClick={() => onAppModeChange("chat")}
          aria-label={t("kanban.board.backToChat")}
        >
          <CornerUpLeft size={14} />
          <span>{t("kanban.board.backToChat")}</span>
        </button>
        {showWsMenu ? (
          <div className="kanban-project-menu" ref={wsMenuRef}>
            <button
              type="button"
              className="kanban-project-button"
              onClick={() => setWsMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={wsMenuOpen}
            >
              <span className="kanban-breadcrumb-workspace">{workspace.name}</span>
              <span className="kanban-project-caret" aria-hidden>
                ›
              </span>
            </button>
            {wsMenuOpen && (
              <div
                className="kanban-project-dropdown popover-surface"
                role="menu"
              >
                <div className="project-search">
                  <input
                    value={wsQuery}
                    onChange={(e) => setWsQuery(e.target.value)}
                    placeholder={t("kanban.workspace.searchWorkspaces")}
                    className="branch-input"
                    autoFocus
                    aria-label={t("kanban.workspace.searchWorkspaces")}
                  />
                </div>
                <div className="project-list" role="none">
                  {filteredWorkspaces.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={`project-item${
                        w.id === workspace.id ? " is-active" : ""
                      }`}
                      onClick={() => handleSelectWorkspace(w.id)}
                      role="menuitem"
                    >
                      {w.name}
                    </button>
                  ))}
                  {filteredWorkspaces.length === 0 && (
                    <div className="project-empty">
                      {t("kanban.workspace.noWorkspacesFound")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <span className="kanban-breadcrumb-workspace">{workspace.name}</span>
        )}
        <span className="kanban-breadcrumb-sep" aria-hidden>›</span>
        {showPanelMenu ? (
          <div className="kanban-project-menu" ref={panelMenuRef}>
            <button
              type="button"
              className="kanban-project-button"
              onClick={() => setPanelMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={panelMenuOpen}
            >
              <h2 className="kanban-board-title">{panel.name}</h2>
              <span className="kanban-project-caret" aria-hidden>
                ›
              </span>
            </button>
            {panelMenuOpen && (
              <div
                className="kanban-project-dropdown popover-surface"
                role="menu"
              >
                <div className="project-search">
                  <input
                    value={panelQuery}
                    onChange={(e) => setPanelQuery(e.target.value)}
                    placeholder={t("kanban.panel.searchPanels")}
                    className="branch-input"
                    autoFocus
                    aria-label={t("kanban.panel.searchPanels")}
                  />
                </div>
                <div className="project-list" role="none">
                  {filteredPanels.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`project-item${
                        p.id === panel.id ? " is-active" : ""
                      }`}
                      onClick={() => handleSelectPanel(p.id)}
                      role="menuitem"
                    >
                      {p.name}
                    </button>
                  ))}
                  {filteredPanels.length === 0 && (
                    <div className="project-empty">
                      {t("kanban.panel.noPanelsFound")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <h2 className="kanban-board-title">{panel.name}</h2>
        )}
      </div>
      <div className="kanban-board-header-center">
        <div className="kanban-search-box">
          <Search size={15} className="kanban-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("kanban.board.searchPlaceholder")}
            className="kanban-search-input"
          />
        </div>
      </div>
      <div className="kanban-board-header-right">
        <button
          className={`kanban-icon-btn${showGitPanel ? " is-active" : ""}`}
          onClick={onToggleGitPanel}
          aria-label={t("kanban.board.toggleGitPanel")}
          aria-pressed={showGitPanel}
          data-tauri-drag-region="false"
        >
          <PanelRight size={18} />
        </button>
      </div>
    </div>
  );
}
