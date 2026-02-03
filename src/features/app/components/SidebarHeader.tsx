import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import Search from "lucide-react/dist/esm/icons/search";
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
  onToggleSearch,
  isSearchOpen,
}: SidebarHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="sidebar-header">
      <div className="sidebar-header-title">
        <div className="sidebar-title-group">
          <button
            className="sidebar-title-add"
            onClick={onAddWorkspace}
            data-tauri-drag-region="false"
            aria-label={t("sidebar.addWorkspace")}
            type="button"
          >
            <FolderPlus aria-hidden />
          </button>
          <button
            className="subtitle subtitle-button sidebar-title-button"
            onClick={onSelectHome}
            data-tauri-drag-region="false"
            aria-label={t("sidebar.openHome")}
          >
            {t("sidebar.projects")}
          </button>
        </div>
      </div>
      <div className="sidebar-header-actions">
        <button
          className={`ghost sidebar-search-toggle${isSearchOpen ? " is-active" : ""}`}
          onClick={onToggleSearch}
          data-tauri-drag-region="false"
          aria-label={t("sidebar.toggleSearch")}
          aria-pressed={isSearchOpen}
          type="button"
        >
          <Search aria-hidden />
        </button>
      </div>
    </div>
  );
}
