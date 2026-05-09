import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppSettingsController } from "../../app/hooks/useAppSettingsController";
import { useCodeCssVars } from "../../app/hooks/useCodeCssVars";
import { isMacPlatform, isWindowsPlatform } from "../../../utils/platform";
import {
  CLIENT_DOCUMENTATION_TREE,
  CLIENT_DOCUMENTATION_WINDOW_TITLE,
} from "../clientDocumentationData";
import {
  findClientDocumentationNode,
  getDefaultClientDocumentationNode,
} from "../clientDocumentationUtils";
import { ClientDocumentationDetail } from "./ClientDocumentationDetail";
import { ClientDocumentationTree } from "./ClientDocumentationTree";

export function ClientDocumentationWindow() {
  const { appSettings, reduceTransparency } = useAppSettingsController();
  useCodeCssVars(appSettings);
  const menubarRef = useRef<HTMLElement | null>(null);
  const defaultNode = getDefaultClientDocumentationNode();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    defaultNode?.id ?? null,
  );
  const isMacDesktop = useMemo(() => isMacPlatform(), []);
  const isWindowsDesktop = useMemo(() => isWindowsPlatform(), []);
  const appClassName = useMemo(
    () => `app layout-desktop${isWindowsDesktop ? " windows-desktop" : ""}${
      isMacDesktop ? " macos-desktop" : ""
    }${reduceTransparency ? " reduced-transparency" : ""}`,
    [isMacDesktop, isWindowsDesktop, reduceTransparency],
  );
  const documentationWindowStyle = useMemo(
    () =>
      ({
        "--ui-font-family": appSettings.uiFontFamily,
        "--code-font-family": appSettings.codeFontFamily,
        "--code-font-size": `${appSettings.codeFontSize}px`,
      }) as CSSProperties,
    [appSettings.codeFontFamily, appSettings.codeFontSize, appSettings.uiFontFamily],
  );
  const selectedNode =
    selectedNodeId === null ? defaultNode : findClientDocumentationNode(selectedNodeId);
  const missingNodeId =
    selectedNodeId && !findClientDocumentationNode(selectedNodeId) ? selectedNodeId : null;

  useEffect(() => {
    void getCurrentWindow().setTitle(CLIENT_DOCUMENTATION_WINDOW_TITLE).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isMacDesktop) {
      return;
    }
    const menubar = menubarRef.current;
    if (!(menubar instanceof HTMLElement)) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail > 1) {
        return;
      }
      const target = event.target;
      const interactiveTarget =
        target instanceof Element
          ? target.closest(
              [
                '[data-window-drag-ignore="true"]',
                "button",
                "a",
                "input",
                "textarea",
                "select",
                "[role='button']",
              ].join(","),
            )
          : null;
      if (interactiveTarget) {
        return;
      }
      event.preventDefault();
      void (async () => {
        try {
          const windowHandle = getCurrentWindow();
          const fullscreen =
            typeof windowHandle.isFullscreen === "function"
              ? await windowHandle.isFullscreen()
              : false;
          if (fullscreen || typeof windowHandle.startDragging !== "function") {
            return;
          }
          await windowHandle.startDragging();
        } catch {
          // Non-Tauri test/runtime environments cannot drag native windows.
        }
      })();
    };
    menubar.addEventListener("mousedown", handleMouseDown);
    return () => {
      menubar.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isMacDesktop]);

  const resetSelection = () => {
    setSelectedNodeId(defaultNode?.id ?? null);
  };

  return (
    <div className={`${appClassName} client-documentation-window`} style={documentationWindowStyle}>
      <header
        ref={menubarRef}
        className="client-documentation-menubar"
        data-tauri-drag-region="true"
      >
        <div className="client-documentation-menubar-copy" data-tauri-drag-region="true">
          <span className="client-documentation-menubar-label" data-tauri-drag-region="true">
            客户端说明文档
          </span>
          <strong className="client-documentation-menubar-title" data-tauri-drag-region="true">
            Client Guide
          </strong>
        </div>
      </header>
      <main className="client-documentation-shell">
        <aside className="client-documentation-sidebar" data-window-drag-ignore="true">
          <div className="client-documentation-sidebar-kicker">Client map</div>
          <div className="client-documentation-sidebar-heading">
            <span>模块目录</span>
            <small>{CLIENT_DOCUMENTATION_TREE.length} modules</small>
          </div>
          <ClientDocumentationTree
            nodes={CLIENT_DOCUMENTATION_TREE}
            selectedNodeId={selectedNode?.id ?? selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </aside>
        <section className="client-documentation-content" data-window-drag-ignore="true">
          <ClientDocumentationDetail
            node={selectedNode}
            missingNodeId={missingNodeId}
            onResetSelection={resetSelection}
          />
        </section>
      </main>
    </div>
  );
}
