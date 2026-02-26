import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MainTopbar } from "../../app/components/MainTopbar";

type TabletLayoutProps = {
  tabletNavNode: ReactNode;
  approvalToastsNode: ReactNode;
  updateToastNode: ReactNode;
  errorToastsNode: ReactNode;
  showGitHistory: boolean;
  gitHistoryNode: ReactNode;
  homeNode: ReactNode;
  showHome: boolean;
  showWorkspace: boolean;
  sidebarNode: ReactNode;
  tabletTab: "projects" | "codex" | "spec" | "git" | "log";
  onSidebarResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  topbarLeftNode: ReactNode;
  messagesNode: ReactNode;
  composerNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  debugPanelNode: ReactNode;
  settingsOpen: boolean;
  settingsNode: ReactNode;
};

export function TabletLayout({
  tabletNavNode,
  approvalToastsNode,
  updateToastNode,
  errorToastsNode,
  showGitHistory,
  gitHistoryNode,
  homeNode,
  showHome,
  showWorkspace,
  sidebarNode,
  tabletTab,
  onSidebarResizeStart,
  topbarLeftNode,
  messagesNode,
  composerNode,
  gitDiffPanelNode,
  gitDiffViewerNode,
  debugPanelNode,
  settingsOpen,
  settingsNode,
}: TabletLayoutProps) {
  const { t } = useTranslation();
  return (
    <>
      {tabletNavNode}
      <div className="tablet-projects">{sidebarNode}</div>
      <div
        className="projects-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("layout.resizeProjects")}
        onMouseDown={onSidebarResizeStart}
      />
      <section className="tablet-main">
        {approvalToastsNode}
        {updateToastNode}
        {errorToastsNode}
        {settingsOpen && settingsNode}
        {!settingsOpen && showGitHistory && gitHistoryNode}
        {!settingsOpen && showHome && homeNode}
        {!settingsOpen && !showGitHistory && showWorkspace && (
          <>
            <MainTopbar leftNode={topbarLeftNode} className="tablet-topbar" />
            {tabletTab === "codex" && (
              <>
                <div className="content tablet-content">{messagesNode}</div>
                {composerNode}
              </>
            )}
            {tabletTab === "spec" && (
              <div className="content tablet-content">{messagesNode}</div>
            )}
            {tabletTab === "git" && (
              <div className="tablet-git">
                {gitDiffPanelNode}
                <div className="tablet-git-viewer">{gitDiffViewerNode}</div>
              </div>
            )}
            {tabletTab === "log" && debugPanelNode}
          </>
        )}
      </section>
    </>
  );
}
