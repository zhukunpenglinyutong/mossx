import Box from "lucide-react/dist/esm/icons/box";
import BrainCircuit from "lucide-react/dist/esm/icons/brain-circuit";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import MessageSquare from "lucide-react/dist/esm/icons/message-square";
import Puzzle from "lucide-react/dist/esm/icons/puzzle";
import Settings from "lucide-react/dist/esm/icons/settings";
import Terminal from "lucide-react/dist/esm/icons/terminal";
import GitGraph from "lucide-react/dist/esm/icons/git-graph";
import { useTranslation } from "react-i18next";
import type { AppMode } from "../../../types";
import { pushErrorToast } from "../../../services/toasts";

type SidebarMarketLinksProps = {
  onOpenMemory: () => void;
  appMode: AppMode;
  onAppModeChange: (mode: AppMode) => void;
  onOpenSettings: () => void;
  showTerminalButton?: boolean;
  isTerminalOpen?: boolean;
  onToggleTerminal?: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
};

export function SidebarMarketLinks({
  onOpenMemory,
  appMode,
  onAppModeChange,
  onOpenSettings,
  showTerminalButton = false,
  isTerminalOpen = false,
  onToggleTerminal,
  isCollapsed,
  onToggleCollapsed,
}: SidebarMarketLinksProps) {
  const { t } = useTranslation();

  const handleClick = () => {
    pushErrorToast({
      title: t("sidebar.comingSoon"),
      message: t("sidebar.comingSoonMessage"),
      durationMs: 3000,
    });
  };

  return (
    <div
      className={`sidebar-market-rail ${isCollapsed ? "is-collapsed" : "is-expanded"}`}
      role="navigation"
      aria-label={t("sidebar.pluginMarket")}
    >
      <div className="sidebar-market-rail-section">
        <button
          type="button"
          className={`sidebar-market-rail-item ${appMode === "chat" ? "is-active" : ""}`}
          onClick={() => onAppModeChange("chat")}
          title={t("kanban.mode.chat")}
          aria-label={t("kanban.mode.chat")}
          data-tauri-drag-region="false"
        >
          <MessageSquare className="sidebar-market-rail-icon" />
          <span className="sidebar-market-rail-text">{t("kanban.mode.chatShort")}</span>
        </button>
        <button
          type="button"
          className={`sidebar-market-rail-item ${appMode === "kanban" ? "is-active" : ""}`}
          onClick={() => onAppModeChange("kanban")}
          title={t("kanban.mode.kanban")}
          aria-label={t("kanban.mode.kanban")}
          data-tauri-drag-region="false"
        >
          <LayoutGrid className="sidebar-market-rail-icon" />
          <span className="sidebar-market-rail-text">{t("kanban.mode.kanbanShort")}</span>
        </button>
      </div>
      <div className="sidebar-market-rail-divider" aria-hidden />
      <div className="sidebar-market-rail-section">
        <button
          type="button"
          className="sidebar-market-rail-item"
          data-market-item="mcp"
          onClick={handleClick}
          title={t("sidebar.mcpSkillsMarket")}
          aria-label={t("sidebar.mcpSkillsMarket")}
          data-tauri-drag-region="false"
        >
          <Box className="sidebar-market-rail-icon" />
          <span className="sidebar-market-rail-text">{t("sidebar.mcpSkillsMarket")}</span>
        </button>
        <button
          type="button"
          className="sidebar-market-rail-item"
          data-market-item="memory"
          onClick={onOpenMemory}
          title={t("sidebar.longTermMemory")}
          aria-label={t("sidebar.longTermMemory")}
          data-tauri-drag-region="false"
        >
          <BrainCircuit className="sidebar-market-rail-icon" />
          <span className="sidebar-market-rail-text">{t("sidebar.longTermMemory")}</span>
        </button>
        <button
          type="button"
          className="sidebar-market-rail-item"
          data-market-item="plugin"
          onClick={handleClick}
          title={t("sidebar.pluginMarket")}
          aria-label={t("sidebar.pluginMarket")}
          data-tauri-drag-region="false"
        >
          <Puzzle className="sidebar-market-rail-icon" />
          <span className="sidebar-market-rail-text">{t("sidebar.pluginMarket")}</span>
        </button>
      </div>
      <div className="sidebar-market-rail-spacer" />
      <div className="sidebar-market-rail-section sidebar-market-rail-section-bottom">
        <button
          type="button"
          className="sidebar-market-rail-item"
          onClick={onOpenSettings}
          title={t("settings.title")}
          aria-label={t("settings.title")}
          data-tauri-drag-region="false"
        >
          <Settings className="sidebar-market-rail-icon" />
          <span className="sidebar-market-rail-text">{t("settings.title")}</span>
        </button>
        {showTerminalButton && onToggleTerminal && (
          <button
            type="button"
            className={`sidebar-market-rail-item ${isTerminalOpen ? "is-active" : ""}`}
            onClick={onToggleTerminal}
            title={t("common.terminal")}
            aria-label={t("common.toggleTerminalPanel")}
            data-tauri-drag-region="false"
          >
            <Terminal className="sidebar-market-rail-icon" />
            <span className="sidebar-market-rail-text">{t("common.terminal")}</span>
          </button>
        )}
        <button
          type="button"
          className={`sidebar-market-rail-item ${appMode === "gitHistory" ? "is-active" : ""}`}
          onClick={() => onAppModeChange(appMode === "gitHistory" ? "chat" : "gitHistory")}
          title={t("git.logMode")}
          aria-label={t("git.logMode")}
          data-tauri-drag-region="false"
        >
          <GitGraph className="sidebar-market-rail-icon" />
          <span className="sidebar-market-rail-text">{t("git.logMode")}</span>
        </button>
        <button
          type="button"
          className="sidebar-market-rail-item sidebar-market-rail-collapse"
          onClick={onToggleCollapsed}
          title={isCollapsed ? t("sidebar.expandAllSections") : t("sidebar.collapseAllSections")}
          aria-label={isCollapsed ? t("sidebar.expandAllSections") : t("sidebar.collapseAllSections")}
          data-tauri-drag-region="false"
        >
          {isCollapsed ? (
            <ChevronRight className="sidebar-market-rail-icon" />
          ) : (
            <ChevronLeft className="sidebar-market-rail-icon" />
          )}
          <span className="sidebar-market-rail-text">
            {isCollapsed ? t("sidebar.expandAllSections") : t("sidebar.collapseAllSections")}
          </span>
        </button>
      </div>
    </div>
  );
}
