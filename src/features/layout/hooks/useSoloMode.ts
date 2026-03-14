import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelTabId } from "../components/PanelTabs";

type CenterMode = "chat" | "diff" | "editor" | "memory";
type AppTab = "projects" | "codex" | "spec" | "git" | "log";
type FilePanelMode = PanelTabId | "prompts" | "memory";

type SoloLayoutSnapshot = {
  activeTab: AppTab;
  centerMode: CenterMode;
  filePanelMode: FilePanelMode;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
};

type UseSoloModeOptions = {
  enabled: boolean;
  activeTab: AppTab;
  centerMode: CenterMode;
  filePanelMode: FilePanelMode;
  sidebarCollapsed: boolean;
  rightPanelCollapsed: boolean;
  setActiveTab: (tab: AppTab) => void;
  setCenterMode: (mode: CenterMode) => void;
  setFilePanelMode: (mode: FilePanelMode) => void;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  collapseRightPanel: () => void;
  expandRightPanel: () => void;
};

export function useSoloMode({
  enabled,
  activeTab,
  centerMode,
  filePanelMode,
  sidebarCollapsed,
  rightPanelCollapsed,
  setActiveTab,
  setCenterMode,
  setFilePanelMode,
  collapseSidebar,
  expandSidebar,
  collapseRightPanel,
  expandRightPanel,
}: UseSoloModeOptions) {
  const [isSoloMode, setIsSoloMode] = useState(false);
  const snapshotRef = useRef<SoloLayoutSnapshot | null>(null);

  const exitSoloMode = useCallback(() => {
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    setIsSoloMode(false);
    if (!snapshot) {
      return;
    }

    setActiveTab(snapshot.activeTab);
    setCenterMode(snapshot.centerMode);
    setFilePanelMode(snapshot.filePanelMode);
    if (snapshot.sidebarCollapsed) {
      collapseSidebar();
    } else {
      expandSidebar();
    }
    if (snapshot.rightPanelCollapsed) {
      collapseRightPanel();
    } else {
      expandRightPanel();
    }
  }, [
    collapseRightPanel,
    collapseSidebar,
    expandRightPanel,
    expandSidebar,
    setActiveTab,
    setCenterMode,
    setFilePanelMode,
  ]);

  const enterSoloMode = useCallback(() => {
    if (!enabled) {
      return;
    }

    snapshotRef.current = {
      activeTab,
      centerMode,
      filePanelMode,
      sidebarCollapsed,
      rightPanelCollapsed,
    };

    setIsSoloMode(true);
    setActiveTab("codex");
    setCenterMode("chat");
    setFilePanelMode("activity");
    collapseSidebar();
    expandRightPanel();
  }, [
    activeTab,
    centerMode,
    collapseSidebar,
    enabled,
    expandRightPanel,
    filePanelMode,
    rightPanelCollapsed,
    setActiveTab,
    setCenterMode,
    setFilePanelMode,
    sidebarCollapsed,
  ]);

  const toggleSoloMode = useCallback(() => {
    if (isSoloMode) {
      exitSoloMode();
      return;
    }
    enterSoloMode();
  }, [enterSoloMode, exitSoloMode, isSoloMode]);

  useEffect(() => {
    if (!enabled && isSoloMode) {
      exitSoloMode();
    }
  }, [enabled, exitSoloMode, isSoloMode]);

  return {
    isSoloMode,
    enterSoloMode,
    exitSoloMode,
    toggleSoloMode,
  };
}
