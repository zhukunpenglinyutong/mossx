import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { useAppSettingsController } from "../../app/hooks/useAppSettingsController";
import { useCodeCssVars } from "../../app/hooks/useCodeCssVars";
import { useWindowFocusState } from "../../layout/hooks/useWindowFocusState";
import { getWorkspaceFiles } from "../../../services/tauri";
import { isMacPlatform, isWindowsPlatform } from "../../../utils/platform";
import {
  buildDetachedSpecHubWindowTitle,
  type DetachedSpecHubSession,
} from "../detachedSpecHub";
import { useDetachedSpecHubSession } from "../hooks/useDetachedSpecHubSession";
import { SpecHub } from "./SpecHub";

function isValidDetachedSession(session: DetachedSpecHubSession | null): session is DetachedSpecHubSession {
  return !!session?.workspaceId && !!session.workspaceName;
}

export function DetachedSpecHubWindow() {
  const { t } = useTranslation();
  const { appSettings, reduceTransparency } = useAppSettingsController();
  useCodeCssVars(appSettings);
  const session = useDetachedSpecHubSession();
  const menubarRef = useRef<HTMLElement | null>(null);
  const isFocused = useWindowFocusState();
  const isMacDesktop = useMemo(() => isMacPlatform(), []);
  const isWindowsDesktop = useMemo(() => isWindowsPlatform(), []);
  const appClassName = useMemo(
    () => `app layout-desktop${isWindowsDesktop ? " windows-desktop" : ""}${
      isMacDesktop ? " macos-desktop" : ""
    }${reduceTransparency ? " reduced-transparency" : ""}`,
    [isMacDesktop, isWindowsDesktop, reduceTransparency],
  );
  const detachedWindowStyle = useMemo(
    () =>
      ({
        "--ui-font-family": appSettings.uiFontFamily,
        "--code-font-family": appSettings.codeFontFamily,
        "--code-font-size": `${appSettings.codeFontSize}px`,
      }) as CSSProperties,
    [appSettings.codeFontFamily, appSettings.codeFontSize, appSettings.uiFontFamily],
  );
  const [workspaceFiles, setWorkspaceFiles] = useState(() => ({
    files: session?.files ?? [],
    directories: session?.directories ?? [],
  }));

  useEffect(() => {
    setWorkspaceFiles({
      files: session?.files ?? [],
      directories: session?.directories ?? [],
    });
  }, [session?.directories, session?.files, session?.updatedAt]);

  useEffect(() => {
    if (!session || !isFocused) {
      return;
    }
    let cancelled = false;
    void getWorkspaceFiles(session.workspaceId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setWorkspaceFiles({
          files: result.files,
          directories: result.directories,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isFocused, session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    void getCurrentWindow()
      .setTitle(buildDetachedSpecHubWindowTitle(session))
      .catch(() => {});
  }, [session]);

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
          // Ignore in non-Tauri test/runtime cases.
        }
      })();
    };
    menubar.addEventListener("mousedown", handleMouseDown);
    return () => {
      menubar.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isMacDesktop]);

  const renderCompactMenubar = () => (
    <header
      ref={menubarRef}
      className="detached-spec-hub-menubar"
      data-tauri-drag-region="true"
    >
      <div className="detached-spec-hub-menubar-copy" data-tauri-drag-region="true">
        <span className="detached-spec-hub-menubar-label" data-tauri-drag-region="true">
          {t("specHub.title")}
        </span>
        {session ? (
          <strong className="detached-spec-hub-menubar-title" data-tauri-drag-region="true">
            {session.workspaceName}
          </strong>
        ) : null}
      </div>
    </header>
  );

  if (!isValidDetachedSession(session)) {
    return (
      <div className={`${appClassName} detached-spec-hub-window-shell`} style={detachedWindowStyle}>
        {renderCompactMenubar()}
        <div className="detached-spec-hub-unavailable">
          <p className="detached-spec-hub-unavailable-title">
            {t("specHub.detached.unavailableTitle")}
          </p>
          <p className="detached-spec-hub-unavailable-body">
            {t("specHub.detached.unavailableBody")}
          </p>
        </div>
      </div>
    );
  }

  const validSession = session;

  return (
    <div className={`${appClassName} detached-spec-hub-window-shell`} style={detachedWindowStyle}>
      {renderCompactMenubar()}
      <SpecHub
        workspaceId={validSession.workspaceId}
        workspaceName={validSession.workspaceName}
        files={workspaceFiles.files}
        directories={workspaceFiles.directories}
        onBackToChat={() => {}}
        surfaceMode="detached"
        detachedReaderSession={validSession}
      />
    </div>
  );
}
