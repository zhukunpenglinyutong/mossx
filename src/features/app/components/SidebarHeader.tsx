import type { AppMode } from "../../../types";
import { KanbanModeToggle } from "../../kanban/components/KanbanModeToggle";

type SidebarHeaderProps = {
  onSelectHome: () => void;
  onAddWorkspace: () => void;
  onToggleSearch: () => void;
  isSearchOpen: boolean;
  appMode: AppMode;
  onAppModeChange: (mode: AppMode) => void;
};

export function SidebarHeader({
  onSelectHome: _onSelectHome,
  onAddWorkspace: _onAddWorkspace,
  onToggleSearch: _onToggleSearch,
  isSearchOpen: _isSearchOpen,
  appMode,
  onAppModeChange,
}: SidebarHeaderProps) {
  return (
    <div className="sidebar-header">
      <div className="sidebar-header-actions">
        <KanbanModeToggle
          appMode={appMode}
          onAppModeChange={onAppModeChange}
        />
      </div>
    </div>
  );
}
