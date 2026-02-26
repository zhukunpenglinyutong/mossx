import { memo } from "react";
import { useTranslation } from "react-i18next";
import PanelRightClose from "lucide-react/dist/esm/icons/panel-right-close";
import PanelRightOpen from "lucide-react/dist/esm/icons/panel-right-open";
import type { SidebarToggleProps } from "../../layout/components/SidebarToggleControls";

type MainHeaderActionsProps = {
  isCompact: boolean;
  rightPanelCollapsed: boolean;
  sidebarToggleProps: SidebarToggleProps;
};

export const MainHeaderActions = memo(function MainHeaderActions({
  isCompact,
  rightPanelCollapsed,
  sidebarToggleProps,
}: MainHeaderActionsProps) {
  const { t } = useTranslation();
  const { rightPanelAvailable = true, onCollapseRightPanel, onExpandRightPanel } =
    sidebarToggleProps;

  if (isCompact || !rightPanelAvailable) {
    return null;
  }

  const isCollapsed = rightPanelCollapsed;
  const labelKey = isCollapsed ? "sidebar.showGitSidebar" : "sidebar.hideGitSidebar";

  return (
    <button
      type="button"
      className="ghost main-header-action"
      onClick={isCollapsed ? onExpandRightPanel : onCollapseRightPanel}
      data-tauri-drag-region="false"
      aria-label={t(labelKey)}
      title={t(labelKey)}
    >
      {isCollapsed ? (
        <PanelRightOpen size={14} aria-hidden />
      ) : (
        <PanelRightClose size={14} aria-hidden />
      )}
    </button>
  );
});
