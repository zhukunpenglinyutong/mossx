import { useEffect, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "codexmonitor.sidebarCollapsed";
const RIGHT_PANEL_COLLAPSED_KEY = "codexmonitor.rightPanelCollapsed";

type UseSidebarTogglesOptions = {
  isCompact: boolean;
};

function readStoredBool(key: string, defaultValue = false) {
  if (typeof window === "undefined") {
    return defaultValue;
  }
  const stored = window.localStorage.getItem(key);
  if (stored === null) {
    return defaultValue;
  }
  return stored === "true";
}

export function useSidebarToggles({ isCompact }: UseSidebarTogglesOptions) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readStoredBool(SIDEBAR_COLLAPSED_KEY),
  );
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(() =>
    readStoredBool(RIGHT_PANEL_COLLAPSED_KEY, true),
  );

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_KEY,
      String(sidebarCollapsed),
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(
      RIGHT_PANEL_COLLAPSED_KEY,
      String(rightPanelCollapsed),
    );
  }, [rightPanelCollapsed]);

  const collapseSidebar = () => {
    if (!isCompact) {
      setSidebarCollapsed(true);
    }
  };

  const expandSidebar = () => {
    if (!isCompact) {
      setSidebarCollapsed(false);
    }
  };

  const collapseRightPanel = () => {
    if (!isCompact) {
      setRightPanelCollapsed(true);
    }
  };

  const expandRightPanel = () => {
    if (!isCompact) {
      setRightPanelCollapsed(false);
    }
  };

  return {
    sidebarCollapsed,
    rightPanelCollapsed,
    collapseSidebar,
    expandSidebar,
    collapseRightPanel,
    expandRightPanel,
  };
}
