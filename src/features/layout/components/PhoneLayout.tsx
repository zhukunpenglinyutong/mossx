import type { ReactNode } from "react";
import { MainTopbar } from "../../app/components/MainTopbar";

type PhoneLayoutProps = {
  approvalToastsNode: ReactNode;
  updateToastNode: ReactNode;
  errorToastsNode: ReactNode;
  tabBarNode: ReactNode;
  sidebarNode: ReactNode;
  showGitHistory: boolean;
  gitHistoryNode: ReactNode;
  activeTab: "projects" | "codex" | "git" | "log";
  activeWorkspace: boolean;
  showGitDetail: boolean;
  compactEmptyCodexNode: ReactNode;
  compactEmptyGitNode: ReactNode;
  compactGitBackNode: ReactNode;
  topbarLeftNode: ReactNode;
  messagesNode: ReactNode;
  composerNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  debugPanelNode: ReactNode;
  settingsOpen: boolean;
  settingsNode: ReactNode;
};

export function PhoneLayout({
  approvalToastsNode,
  updateToastNode,
  errorToastsNode,
  tabBarNode,
  sidebarNode,
  showGitHistory,
  gitHistoryNode,
  activeTab,
  activeWorkspace,
  showGitDetail,
  compactEmptyCodexNode,
  compactEmptyGitNode,
  compactGitBackNode,
  topbarLeftNode,
  messagesNode,
  composerNode,
  gitDiffPanelNode,
  gitDiffViewerNode,
  debugPanelNode,
  settingsOpen,
  settingsNode,
}: PhoneLayoutProps) {
  return (
    <div className="compact-shell">
      {approvalToastsNode}
      {updateToastNode}
      {errorToastsNode}
      {!settingsOpen && showGitHistory && <div className="compact-panel">{gitHistoryNode}</div>}
      {settingsOpen && <div className="compact-panel">{settingsNode}</div>}
      {!settingsOpen && !showGitHistory && activeTab === "projects" && <div className="compact-panel">{sidebarNode}</div>}
      {!showGitHistory && activeTab === "codex" && (
        <div className="compact-panel">
          {activeWorkspace ? (
            <>
              <MainTopbar leftNode={topbarLeftNode} className="compact-topbar" />
              <div className="content compact-content">{messagesNode}</div>
              {composerNode}
            </>
          ) : (
            compactEmptyCodexNode
          )}
        </div>
      )}
      {!showGitHistory && activeTab === "git" && (
        <div className="compact-panel">
          {!activeWorkspace && compactEmptyGitNode}
          {activeWorkspace && showGitDetail && (
            <>
              {compactGitBackNode}
              <div className="compact-git-viewer">{gitDiffViewerNode}</div>
            </>
          )}
          {activeWorkspace && !showGitDetail && (
            <>
              <MainTopbar leftNode={topbarLeftNode} className="compact-topbar" />
              <div className="compact-git">
                <div className="compact-git-list">{gitDiffPanelNode}</div>
              </div>
            </>
          )}
        </div>
      )}
      {!showGitHistory && activeTab === "log" && (
        <div className="compact-panel">{debugPanelNode}</div>
      )}
      {tabBarNode}
    </div>
  );
}
