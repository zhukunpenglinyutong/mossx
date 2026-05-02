import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  ExternalLink,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { SpecHubProps } from "../../SpecHub.presentational";
import {
  buildDetachedSpecHubSession,
  openOrFocusDetachedSpecHub,
  writeDetachedSpecHubSessionSnapshot,
} from "../../../detachedSpecHub";
import {
  applyDetachedReaderSession,
  readSpecHubDomSnapshot,
  scrollToOutlineItem,
  selectArtifactTab,
  selectSpecSourceByCapability,
  type SpecHubDomSnapshot,
} from "./SpecHubReaderDom";
import { useSpecHubSurfaceLayout } from "./useSpecHubSurfaceLayout";

type SpecHubSurfaceFrameProps = SpecHubProps & {
  children: ReactNode;
};

type PortalHosts = {
  header: HTMLElement | null;
  changesHeader: HTMLElement | null;
  outline: HTMLElement | null;
  grid: HTMLElement | null;
};

const EMPTY_DOM_SNAPSHOT: SpecHubDomSnapshot = {
  selectedChangeId: null,
  artifactType: null,
  artifactPath: null,
  specSourcePath: null,
  artifactMaximized: false,
  controlCollapsed: false,
  outline: [],
  pendingOutlineIds: [],
  proposalCapabilities: [],
};

function arePortalHostsEqual(next: PortalHosts, previous: PortalHosts) {
  return next.header === previous.header && next.outline === previous.outline;
}

function areDomSnapshotsEqual(next: SpecHubDomSnapshot, previous: SpecHubDomSnapshot) {
  if (
    next.selectedChangeId !== previous.selectedChangeId ||
    next.artifactType !== previous.artifactType ||
    next.artifactPath !== previous.artifactPath ||
    next.specSourcePath !== previous.specSourcePath ||
    next.outline.length !== previous.outline.length ||
    next.pendingOutlineIds.length !== previous.pendingOutlineIds.length ||
    next.proposalCapabilities.length !== previous.proposalCapabilities.length
  ) {
    return false;
  }
  for (let index = 0; index < next.outline.length; index += 1) {
    const nextItem = next.outline[index];
    const previousItem = previous.outline[index];
    if (
      !previousItem ||
      nextItem.id !== previousItem.id ||
      nextItem.title !== previousItem.title ||
      nextItem.level !== previousItem.level ||
      nextItem.kind !== previousItem.kind
      ) {
      return false;
    }
  }
  for (let index = 0; index < next.pendingOutlineIds.length; index += 1) {
    if (next.pendingOutlineIds[index] !== previous.pendingOutlineIds[index]) {
      return false;
    }
  }
  if (
    next.artifactMaximized !== previous.artifactMaximized ||
    next.controlCollapsed !== previous.controlCollapsed
  ) {
    return false;
  }
  for (let index = 0; index < next.proposalCapabilities.length; index += 1) {
    if (next.proposalCapabilities[index] !== previous.proposalCapabilities[index]) {
      return false;
    }
  }
  return true;
}

function ensureHost(parent: Element | null, className: string, before?: Element | null) {
  if (!(parent instanceof HTMLElement)) {
    return null;
  }
  let host =
    (Array.from(parent.children).find((child) => child.classList.contains(className)) as HTMLElement | undefined) ??
    null;
  if (!host) {
    host = document.createElement("div");
    host.className = className;
  }
  if (before instanceof Element) {
    if (host.parentElement !== parent || host.nextElementSibling !== before) {
      parent.insertBefore(host, before);
    }
  } else if (host.parentElement !== parent || parent.lastElementChild !== host) {
    parent.appendChild(host);
  }
  return host;
}

function ensurePortalHosts(root: HTMLElement): PortalHosts {
  const changesPanelHeader = root.querySelector(".spec-hub-changes .spec-hub-panel-header");
  const artifactPanelHeader = root.querySelector(".spec-hub-artifacts .spec-hub-panel-header");
  const artifactContent = root.querySelector(".spec-hub-artifact-content");
  return {
    changesHeader: ensureHost(changesPanelHeader, "spec-hub-changes-header-host"),
    header: ensureHost(artifactPanelHeader, "spec-hub-reader-header-host"),
    outline: ensureHost(artifactContent, "spec-hub-reader-outline-host"),
    grid: root.querySelector(".spec-hub-grid"),
  };
}

function useDomSnapshot(rootRef: RefObject<HTMLDivElement | null>) {
  const [portalHosts, setPortalHosts] = useState<PortalHosts>({
    header: null,
    changesHeader: null,
    outline: null,
    grid: null,
  });
  const [snapshot, setSnapshot] = useState<SpecHubDomSnapshot>(EMPTY_DOM_SNAPSHOT);

  useEffect(() => {
    const root = rootRef.current;
    if (!(root instanceof HTMLElement)) {
      return;
    }

    const update = () => {
      const nextPortalHosts = ensurePortalHosts(root);
      const nextSnapshot = readSpecHubDomSnapshot(root);
      setPortalHosts((previous) =>
        arePortalHostsEqual(nextPortalHosts, previous) ? previous : nextPortalHosts,
      );
      setSnapshot((previous) =>
        areDomSnapshotsEqual(nextSnapshot, previous) ? previous : nextSnapshot,
      );
    };

    update();
    const observer = new MutationObserver(() => {
      update();
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
      attributeFilter: ["class", "aria-selected", "data-selected", "data-state", "title", "id"],
    });
    return () => {
      observer.disconnect();
    };
  }, [rootRef]);

  return { portalHosts, snapshot };
}

export function SpecHubSurfaceFrame({
  children,
  workspaceId,
  workspaceName,
  files,
  directories,
  surfaceMode = "embedded",
  detachedReaderSession = null,
}: SpecHubSurfaceFrameProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const applyTimerRef = useRef<number | null>(null);
  const { t } = useTranslation();
  const { portalHosts, snapshot } = useDomSnapshot(rootRef);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const isDetached = surfaceMode === "detached";
  const {
    changesCollapsed,
    setChangesCollapsed,
    outlineCollapsed,
    setOutlineCollapsed,
    changesWidth,
    isDraggingChanges,
    handleChangesResizeStart,
  } = useSpecHubSurfaceLayout({
    surfaceMode,
    rootRef,
    controlCollapsed: snapshot.controlCollapsed,
    artifactMaximized: snapshot.artifactMaximized,
  });

  useEffect(() => {
    setActiveOutlineId((previous) =>
      previous && snapshot.outline.some((item) => item.id === previous)
        ? previous
        : snapshot.outline[0]?.id ?? null,
    );
  }, [snapshot.outline]);

  useEffect(() => {
    if (!isDetached || !detachedReaderSession) {
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled) {
        return;
      }
      attempts += 1;
      const root = rootRef.current;
      if (!(root instanceof HTMLElement)) {
        if (attempts < 30) {
          applyTimerRef.current = window.setTimeout(run, 120);
        }
        return;
      }
      const changed = applyDetachedReaderSession(root, detachedReaderSession);
      if (changed && attempts < 30) {
        applyTimerRef.current = window.setTimeout(run, 120);
      }
    };
    run();
    return () => {
      cancelled = true;
      if (applyTimerRef.current !== null) {
        window.clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
    };
  }, [detachedReaderSession, isDetached]);

  useEffect(() => {
    if (!isDetached || !workspaceId || !workspaceName) {
      return;
    }
    writeDetachedSpecHubSessionSnapshot(
      buildDetachedSpecHubSession({
        workspaceId,
        workspaceName,
        files,
        directories,
        changeId: snapshot.selectedChangeId,
        artifactType: snapshot.artifactType,
        specSourcePath: snapshot.specSourcePath,
      }),
    );
  }, [
    directories,
    files,
    isDetached,
    snapshot.artifactType,
    snapshot.selectedChangeId,
    snapshot.specSourcePath,
    workspaceId,
    workspaceName,
  ]);

  const handleOpenInWindow = async () => {
    if (!workspaceId || !workspaceName) {
      return;
    }
    await openOrFocusDetachedSpecHub(
      buildDetachedSpecHubSession({
        workspaceId,
        workspaceName,
        files,
        directories,
        changeId: snapshot.selectedChangeId,
        artifactType: snapshot.artifactType,
        specSourcePath: snapshot.specSourcePath,
      }),
    );
  };

  const hasReaderOutline = snapshot.outline.length > 0 || snapshot.proposalCapabilities.length > 0;

  const relatedSpecButtons = useMemo(
    () => Array.from(new Set(snapshot.proposalCapabilities)),
    [snapshot.proposalCapabilities],
  );
  const pendingOutlineIdSet = useMemo(
    () => new Set(snapshot.pendingOutlineIds),
    [snapshot.pendingOutlineIds],
  );
  const rootStyle = useMemo(
    () =>
      ({
        "--spec-hub-changes-width": `${changesWidth}px`,
        "--spec-hub-outline-width": "296px",
      }) as CSSProperties,
    [changesWidth],
  );

  return (
    <div
      ref={rootRef}
      className={`spec-hub-surface spec-hub-surface-${surfaceMode}${
        isDetached ? " detached-spec-hub-window" : ""
      }${changesCollapsed ? " is-changes-collapsed" : ""}${
        outlineCollapsed ? " is-outline-collapsed" : ""
      }`}
      style={rootStyle}
    >
      {children}
      {portalHosts.changesHeader && typeof document !== "undefined" && !snapshot.artifactMaximized
        ? createPortal(
            <div className="spec-hub-pane-header-actions">
              <button
                type="button"
                className="spec-hub-pane-toggle-button"
                onClick={() => setChangesCollapsed(true)}
                aria-label={t("specHub.changePane.collapse")}
                title={t("specHub.changePane.collapse")}
              >
                <PanelLeftClose size={14} aria-hidden="true" />
              </button>
            </div>,
            portalHosts.changesHeader,
          )
        : null}
      {!isDetached && portalHosts.header && typeof document !== "undefined"
        ? createPortal(
            <div className="spec-hub-reader-header-actions">
              {hasReaderOutline ? (
                <button
                  type="button"
                  className="spec-hub-pane-toggle-button"
                  onClick={() => setOutlineCollapsed((previous) => !previous)}
                  aria-label={t(
                    outlineCollapsed
                      ? "specHub.readerOutline.expand"
                      : "specHub.readerOutline.collapse",
                  )}
                  title={t(
                    outlineCollapsed
                      ? "specHub.readerOutline.expand"
                      : "specHub.readerOutline.collapse",
                  )}
                >
                  {outlineCollapsed ? (
                    <PanelRightOpen size={14} aria-hidden="true" />
                  ) : (
                    <PanelRightClose size={14} aria-hidden="true" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="spec-hub-reader-detach-button"
                onClick={() => {
                  void handleOpenInWindow();
                }}
                disabled={!workspaceId || !snapshot.selectedChangeId}
                title={t("specHub.openInWindow")}
                aria-label={t("specHub.openInWindow")}
              >
                <ExternalLink size={14} aria-hidden="true" />
                <span>{t("specHub.openInWindow")}</span>
              </button>
            </div>,
            portalHosts.header,
          )
        : null}
      {isDetached && portalHosts.header && typeof document !== "undefined" && hasReaderOutline
        ? createPortal(
            <div className="spec-hub-reader-header-actions">
              <button
                type="button"
                className="spec-hub-pane-toggle-button"
                onClick={() => setOutlineCollapsed((previous) => !previous)}
                aria-label={t(
                  outlineCollapsed
                    ? "specHub.readerOutline.expand"
                    : "specHub.readerOutline.collapse",
                )}
                title={t(
                  outlineCollapsed
                    ? "specHub.readerOutline.expand"
                    : "specHub.readerOutline.collapse",
                )}
              >
                {outlineCollapsed ? (
                  <PanelRightOpen size={14} aria-hidden="true" />
                ) : (
                  <PanelRightClose size={14} aria-hidden="true" />
                )}
              </button>
            </div>,
            portalHosts.header,
          )
        : null}
      {hasReaderOutline && portalHosts.outline && typeof document !== "undefined" && !outlineCollapsed
        ? createPortal(
            <section className="spec-hub-reader-outline" aria-label={t("specHub.readerOutline.title")}>
              <header className="spec-hub-reader-outline-head">
                <strong>{t("specHub.readerOutline.title")}</strong>
                <span>{snapshot.outline.length}</span>
              </header>
              {snapshot.outline.length > 0 ? (
                <div className="spec-hub-reader-outline-list">
                  {snapshot.outline.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`spec-hub-reader-outline-button${
                        activeOutlineId === item.id ? " is-active" : ""
                      }${pendingOutlineIdSet.has(item.id) ? " is-pending" : ""}`}
                      style={{ paddingInlineStart: `${12 + Math.max(0, item.level - 1) * 14}px` }}
                      onClick={() => {
                        if (!(rootRef.current instanceof HTMLElement)) {
                          return;
                        }
                        scrollToOutlineItem(rootRef.current, item);
                        setActiveOutlineId(item.id);
                      }}
                    >
                      <span className="spec-hub-reader-outline-label">{item.title}</span>
                      {pendingOutlineIdSet.has(item.id) ? (
                        <span className="spec-hub-reader-outline-pending-dot" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="spec-hub-reader-outline-empty">
                  {t("specHub.readerOutline.empty")}
                </p>
              )}
              {snapshot.artifactType === "proposal" && relatedSpecButtons.length > 0 ? (
                <div className="spec-hub-reader-related-specs">
                  <strong>{t("specHub.readerOutline.linkedSpecs")}</strong>
                  <div className="spec-hub-reader-related-spec-list">
                    {relatedSpecButtons.map((capabilityId) => (
                      <button
                        key={capabilityId}
                        type="button"
                        className="spec-hub-reader-related-spec-button"
                        onClick={() => {
                          const root = rootRef.current;
                          if (!(root instanceof HTMLElement)) {
                            return;
                          }
                          if (selectArtifactTab(root, "specs")) {
                            window.setTimeout(() => {
                              if (rootRef.current instanceof HTMLElement) {
                                selectSpecSourceByCapability(rootRef.current, capabilityId);
                              }
                            }, 120);
                            return;
                          }
                          selectSpecSourceByCapability(root, capabilityId);
                        }}
                      >
                        {capabilityId}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>,
            portalHosts.outline,
          )
        : null}
      {portalHosts.grid && typeof document !== "undefined" && !snapshot.artifactMaximized
        ? createPortal(
            <>
              {changesCollapsed ? (
              <button
                type="button"
                className="spec-hub-changes-expand-button"
                onClick={() => setChangesCollapsed(false)}
                aria-label={t("specHub.changePane.expand")}
                title={t("specHub.changePane.expand")}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : (
                <div
                  className={`spec-hub-changes-resizer${isDraggingChanges ? " is-dragging" : ""}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t("specHub.changePane.resize")}
                  onPointerDown={handleChangesResizeStart}
                />
              )}
            </>,
            portalHosts.grid,
          )
        : null}
    </div>
  );
}
