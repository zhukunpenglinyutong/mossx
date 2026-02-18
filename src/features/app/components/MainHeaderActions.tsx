import { memo } from "react";
import type { SidebarToggleProps } from "../../layout/components/SidebarToggleControls";
import { RightPanelCollapseButton } from "../../layout/components/SidebarToggleControls";

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
  return (
    <>
      {!isCompact && !rightPanelCollapsed ? (
        <RightPanelCollapseButton {...sidebarToggleProps} />
      ) : null}
    </>
  );
});
