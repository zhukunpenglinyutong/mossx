import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GitFileStatus, OpenAppTarget } from "../../../types";
import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";
import { pushErrorToast } from "../../../services/toasts";
import {
  buildDetachedSpecHubSession,
  openOrFocusDetachedSpecHub,
} from "../../spec/detachedSpecHub";
import { FileTreePanel } from "./FileTreePanel";
import { FileViewPanel } from "./FileViewPanel";
import type { EditorNavigationTarget } from "../../app/hooks/useGitPanelController";

const DETACHED_EXPLORER_SIDEBAR_WIDTH_KEY = "detachedFileExplorerSidebarWidth";
const DEFAULT_DETACHED_EXPLORER_SIDEBAR_WIDTH = 320;
const MIN_DETACHED_EXPLORER_SIDEBAR_WIDTH = 220;
const MAX_DETACHED_EXPLORER_SIDEBAR_WIDTH = 520;

function clampSidebarWidth(width: number) {
  return Math.min(
    MAX_DETACHED_EXPLORER_SIDEBAR_WIDTH,
    Math.max(MIN_DETACHED_EXPLORER_SIDEBAR_WIDTH, width),
  );
}

type FileExplorerWorkspaceProps = {
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
  gitRoot?: string | null;
  files: string[];
  directories: string[];
  isLoading: boolean;
  loadError?: string | null;
  gitignoredFiles: Set<string>;
  gitignoredDirectories: Set<string>;
  gitStatusFiles?: GitFileStatus[];
  openTargets: OpenAppTarget[];
  openAppIconById: Record<string, string>;
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
  openTabs: string[];
  activeFilePath: string | null;
  navigationTarget: EditorNavigationTarget | null;
  onOpenFile: (path: string, location?: { line: number; column: number }) => void;
  onActivateTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseAllTabs: () => void;
  onRefreshFiles?: () => void;
  externalChangeMonitoringEnabled?: boolean;
  externalChangeTransportMode?: "watcher" | "polling";
  fileViewHeaderLayout?: "stacked" | "single-row";
};

export function FileExplorerWorkspace({
  workspaceId,
  workspaceName,
  workspacePath,
  gitRoot = null,
  files,
  directories,
  isLoading,
  loadError = null,
  gitignoredFiles,
  gitignoredDirectories,
  gitStatusFiles,
  openTargets,
  openAppIconById,
  selectedOpenAppId,
  onSelectOpenAppId,
  openTabs,
  activeFilePath,
  navigationTarget,
  onOpenFile,
  onActivateTab,
  onCloseTab,
  onCloseAllTabs,
  onRefreshFiles,
  externalChangeMonitoringEnabled = false,
  externalChangeTransportMode = "polling",
  fileViewHeaderLayout = "stacked",
}: FileExplorerWorkspaceProps) {
  const { t } = useTranslation();
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampSidebarWidth(
      getClientStoreSync<number>("layout", DETACHED_EXPLORER_SIDEBAR_WIDTH_KEY) ??
        DEFAULT_DETACHED_EXPLORER_SIDEBAR_WIDTH,
    ),
  );

  useEffect(() => {
    writeClientStoreValue("layout", DETACHED_EXPLORER_SIDEBAR_WIDTH_KEY, sidebarWidth);
  }, [sidebarWidth]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    const workspaceRect = workspace.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const maxWidth = Math.min(
      MAX_DETACHED_EXPLORER_SIDEBAR_WIDTH,
      Math.max(MIN_DETACHED_EXPLORER_SIDEBAR_WIDTH, workspaceRect.width - 280),
    );
    if (maxWidth <= MIN_DETACHED_EXPLORER_SIDEBAR_WIDTH) {
      return;
    }

    event.preventDefault();
    document.body.dataset.panelResizing = "true";

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      delete document.body.dataset.panelResizing;
      cleanupRef.current = null;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + (moveEvent.clientX - startX));
      setSidebarWidth(Math.min(maxWidth, nextWidth));
    };

    const handlePointerUp = () => {
      cleanup();
    };

    cleanupRef.current?.();
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }, [sidebarWidth]);
  const handleOpenSpecHub = useCallback(() => {
    void openOrFocusDetachedSpecHub(
      buildDetachedSpecHubSession({
        workspaceId,
        workspaceName,
        files,
        directories,
      }),
    ).catch((error) => {
      pushErrorToast({
        title: t("sidebar.specHub"),
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, [directories, files, t, workspaceId, workspaceName]);
  const handleOpenWorkspaceFile = useCallback(
    (path: string, location?: { line: number; column: number }) => {
      onOpenFile(path, location);
    },
    [onOpenFile],
  );
  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => !current);
  }, []);
  const showViewerExpandButton = sidebarCollapsed && !activeFilePath;

  return (
    <div
      ref={workspaceRef}
      className={`detached-file-explorer-workspace${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
      style={{
        "--detached-file-explorer-sidebar-width": `${sidebarWidth}px`,
      } as CSSProperties}
    >
      <div className="detached-file-explorer-sidebar">
        <FileTreePanel
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          workspacePath={workspacePath}
          gitRoot={gitRoot}
          files={files}
          directories={directories}
          isLoading={isLoading}
          loadError={loadError}
          filePanelMode="files"
          onFilePanelModeChange={() => undefined}
          onOpenFile={handleOpenWorkspaceFile}
          openTargets={openTargets}
          openAppIconById={openAppIconById}
          selectedOpenAppId={selectedOpenAppId}
          onSelectOpenAppId={onSelectOpenAppId}
          gitStatusFiles={gitStatusFiles}
          gitignoredFiles={gitignoredFiles}
          gitignoredDirectories={gitignoredDirectories}
          onRefreshFiles={onRefreshFiles}
          onOpenSpecHub={handleOpenSpecHub}
          isSpecHubActive={false}
          showSpecHubAction
          showDetachedExplorerAction={false}
          crossWindowDragTargetLabel="main"
        />
      </div>
      <div
        className="detached-file-explorer-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("layout.resizeSidebar")}
        onPointerDown={handleResizeStart}
      />
      <div className="detached-file-explorer-viewer">
        {showViewerExpandButton ? (
          <button
            type="button"
            className="detached-file-explorer-sidebar-expand"
            onClick={handleToggleSidebar}
            aria-label={t("sidebar.sidebarExpand")}
            title={t("sidebar.sidebarExpand")}
          >
            <span
              className="codicon codicon-chevron-right detached-file-explorer-sidebar-expand-icon"
              aria-hidden
            />
          </button>
        ) : null}
        {activeFilePath ? (
          <FileViewPanel
            workspaceId={workspaceId}
            workspacePath={workspacePath}
            gitRoot={gitRoot}
            filePath={activeFilePath}
            gitStatusFiles={gitStatusFiles}
            navigationTarget={navigationTarget}
            openTabs={openTabs}
            activeTabPath={activeFilePath}
            onActivateTab={onActivateTab}
            onCloseTab={onCloseTab}
            onCloseAllTabs={onCloseAllTabs}
            openTargets={openTargets}
            openAppIconById={openAppIconById}
            selectedOpenAppId={selectedOpenAppId}
            onSelectOpenAppId={onSelectOpenAppId}
            onNavigateToLocation={handleOpenWorkspaceFile}
            onClose={onCloseAllTabs}
            externalChangeMonitoringEnabled={externalChangeMonitoringEnabled}
            externalChangeTransportMode={externalChangeTransportMode}
            headerLayout={fileViewHeaderLayout}
            onSingleRowLeadingAction={
              fileViewHeaderLayout === "single-row" ? handleToggleSidebar : undefined
            }
            singleRowLeadingDirection={sidebarCollapsed ? "right" : "left"}
            singleRowLeadingLabel={
              fileViewHeaderLayout === "single-row"
                ? sidebarCollapsed
                  ? t("sidebar.sidebarExpand")
                  : t("sidebar.sidebarCollapse")
                : undefined
            }
          />
        ) : (
          <div className="detached-file-explorer-empty">
            <p className="detached-file-explorer-empty-title">
              {t("files.detachedExplorerEmptyTitle")}
            </p>
            <p className="detached-file-explorer-empty-body">
              {t("files.detachedExplorerEmptyBody")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
