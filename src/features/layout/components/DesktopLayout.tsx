import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { MainTopbar } from "../../app/components/MainTopbar";
import { MemoryPanel } from "./MemoryPanel";

type DesktopLayoutProps = {
  sidebarNode: ReactNode;
  updateToastNode: ReactNode;
  approvalToastsNode: ReactNode;
  errorToastsNode: ReactNode;
  homeNode: ReactNode;
  showHome: boolean;
  showWorkspace: boolean;
  showKanban: boolean;
  showGitHistory: boolean;
  kanbanNode: ReactNode;
  gitHistoryNode: ReactNode;
  settingsOpen: boolean;
  settingsNode: ReactNode;
  topbarLeftNode: ReactNode;
  centerMode: "chat" | "diff" | "editor" | "memory";
  messagesNode: ReactNode;
  gitDiffViewerNode: ReactNode;
  fileViewPanelNode: ReactNode;
  gitDiffPanelNode: ReactNode;
  planPanelNode: ReactNode;
  composerNode: ReactNode;
  terminalDockNode: ReactNode;
  debugPanelNode: ReactNode;
  hasActivePlan: boolean;
  onSidebarResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onRightPanelResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onPlanPanelResizeStart: (event: MouseEvent<HTMLDivElement>) => void;
  onGitHistoryPanelResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
};

export function DesktopLayout({
  sidebarNode,
  updateToastNode,
  approvalToastsNode,
  errorToastsNode,
  homeNode,
  showHome,
  showWorkspace,
  showKanban,
  showGitHistory,
  kanbanNode,
  gitHistoryNode,
  settingsOpen,
  settingsNode,
  topbarLeftNode,
  centerMode,
  messagesNode,
  gitDiffViewerNode,
  fileViewPanelNode,
  gitDiffPanelNode,
  planPanelNode,
  composerNode,
  terminalDockNode,
  debugPanelNode,
  hasActivePlan,
  onSidebarResizeStart,
  onRightPanelResizeStart,
  onPlanPanelResizeStart,
  onGitHistoryPanelResizeStart,
}: DesktopLayoutProps) {
  const diffLayerRef = useRef<HTMLDivElement | null>(null);
  const chatLayerRef = useRef<HTMLDivElement | null>(null);
  const editorLayerRef = useRef<HTMLDivElement | null>(null);
  const memoryLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const diffLayer = diffLayerRef.current;
    const chatLayer = chatLayerRef.current;
    const editorLayer = editorLayerRef.current;

    const layers = [
      { ref: diffLayer, mode: "diff" as const },
      { ref: chatLayer, mode: "chat" as const },
      { ref: editorLayer, mode: "editor" as const },
    ];

    for (const { ref, mode } of layers) {
      if (!ref) continue;
      if (centerMode === mode) {
        ref.removeAttribute("inert");
      } else {
        ref.setAttribute("inert", "");
      }
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      for (const { ref, mode } of layers) {
        if (ref && mode !== centerMode && ref.contains(activeElement)) {
          activeElement.blur();
          break;
        }
      }
    }
  }, [centerMode]);

  if (showKanban) {
    return (
      <section className="main kanban-fullscreen">
        {kanbanNode}
        {terminalDockNode}
      </section>
    );
  }

  const isMemoryMode = centerMode === "memory";
  const gitHistoryDockNode = showGitHistory ? (
    <div className="git-history-dock-overlay">
      <div
        className="git-history-dock-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize git history panel"
        onPointerDown={onGitHistoryPanelResizeStart}
      />
      <div className="git-history-dock-body">{gitHistoryNode}</div>
    </div>
  ) : null;

  return (
    <>
      {sidebarNode}
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={onSidebarResizeStart}
      />

      <section className="main">
        {errorToastsNode}

        {settingsOpen && settingsNode}

        {!settingsOpen && isMemoryMode && (
          <div
            ref={memoryLayerRef}
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          >
            <MemoryPanel />
          </div>
        )}

        {!settingsOpen && !isMemoryMode && (
          <>
            {updateToastNode}
            {showHome && homeNode}

            {showWorkspace && (
              <>
                <MainTopbar leftNode={topbarLeftNode} />
                {approvalToastsNode}
                <div className="content">
                  <div
                    className={`content-layer ${centerMode === "diff" ? "is-active" : "is-hidden"}`}
                    aria-hidden={centerMode !== "diff"}
                    ref={diffLayerRef}
                  >
                    {gitDiffViewerNode}
                  </div>
                  <div
                    className={`content-layer ${centerMode === "editor" ? "is-active" : "is-hidden"}`}
                    aria-hidden={centerMode !== "editor"}
                    ref={editorLayerRef}
                  >
                    {fileViewPanelNode}
                  </div>
                  <div
                    className={`content-layer ${centerMode === "chat" ? "is-active" : "is-hidden"}`}
                    aria-hidden={centerMode !== "chat"}
                    ref={chatLayerRef}
                  >
                    {messagesNode}
                  </div>
                </div>

                <div
                  className="right-panel-resizer"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize right panel"
                  onMouseDown={onRightPanelResizeStart}
                />
                <div className={`right-panel ${hasActivePlan ? "" : "plan-collapsed"}`}>
                  <div className="right-panel-top">{gitDiffPanelNode}</div>
                  <div
                    className="right-panel-divider"
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize plan panel"
                    onMouseDown={onPlanPanelResizeStart}
                  />
                  <div className="right-panel-bottom">{planPanelNode}</div>
                </div>
                {composerNode}
                {terminalDockNode}
                {debugPanelNode}
                {gitHistoryDockNode}
              </>
            )}
            {!showWorkspace && gitHistoryDockNode}
          </>
        )}
      </section>
    </>
  );
}
