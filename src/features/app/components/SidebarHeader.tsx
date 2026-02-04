import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import { useTranslation } from "react-i18next";

type SidebarHeaderProps = {
  onSelectHome: () => void;
  onAddWorkspace: () => void;
  onToggleSearch: () => void;
  isSearchOpen: boolean;
};

export function SidebarHeader({
  onSelectHome,
  onAddWorkspace,
  onToggleSearch: _onToggleSearch,
  isSearchOpen: _isSearchOpen,
}: SidebarHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="sidebar-header">
      <div className="sidebar-header-title">
        <div className="sidebar-title-group">
          <button
            className="subtitle subtitle-button sidebar-title-button"
            onClick={onSelectHome}
            data-tauri-drag-region="false"
            aria-label={t("sidebar.openHome")}
          >
            CodeMoss
          </button>
        </div>
      </div>
      <div className="sidebar-header-actions">
        <button
          className="sidebar-title-add"
          onClick={onAddWorkspace}
          data-tauri-drag-region="false"
          aria-label={t("sidebar.addWorkspace")}
          type="button"
        >
          <FolderPlus aria-hidden />
        </button>
      </div>
    </div>
  );
}
