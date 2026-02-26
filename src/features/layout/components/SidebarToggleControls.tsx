import { useTranslation } from "react-i18next";
import PanelLeftClose from "lucide-react/dist/esm/icons/panel-left-close";
import PanelLeftOpen from "lucide-react/dist/esm/icons/panel-left-open";
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close";

export type SidebarToggleProps = {
  isCompact: boolean;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelAvailable?: boolean;
  onCollapseSidebar: () => void;
  onExpandSidebar: () => void;
  onCollapseRightPanel: () => void;
  onExpandRightPanel: () => void;
};

export function SidebarCollapseButton({
  isCompact,
  sidebarCollapsed,
  onCollapseSidebar,
}: SidebarToggleProps) {
  const { t } = useTranslation();
  if (isCompact || sidebarCollapsed) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action"
      onClick={onCollapseSidebar}
      data-tauri-drag-region="false"
      aria-label={t("sidebar.hideThreadsSidebar")}
      title={t("sidebar.hideThreadsSidebar")}
    >
      <PanelLeftClose size={14} aria-hidden />
    </button>
  );
}

export function RightPanelCollapseButton({
  isCompact,
  rightPanelCollapsed,
  rightPanelAvailable = true,
  onCollapseRightPanel,
}: SidebarToggleProps) {
  const { t } = useTranslation();
  if (isCompact || rightPanelCollapsed || !rightPanelAvailable) {
    return null;
  }
  return (
    <button
      type="button"
      className="ghost main-header-action"
      onClick={onCollapseRightPanel}
      data-tauri-drag-region="false"
      aria-label={t("sidebar.hideGitSidebar")}
      title={t("sidebar.hideGitSidebar")}
    >
      <PanelRightClose size={14} aria-hidden />
    </button>
  );
}

export function TitlebarExpandControls({
  isCompact,
  sidebarCollapsed,
  onExpandSidebar,
}: SidebarToggleProps) {
  const { t } = useTranslation();
  if (isCompact || !sidebarCollapsed) {
    return null;
  }
  return (
    <div className="titlebar-controls">
      {sidebarCollapsed && (
        <div className="titlebar-toggle titlebar-toggle-left">
          <button
            type="button"
            className="ghost main-header-action"
            onClick={onExpandSidebar}
            data-tauri-drag-region="false"
            aria-label={t("sidebar.showThreadsSidebar")}
            title={t("sidebar.showThreadsSidebar")}
          >
            <PanelLeftOpen size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
