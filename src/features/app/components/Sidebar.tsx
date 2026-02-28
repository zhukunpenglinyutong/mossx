import type {
  AccountSnapshot,
  AppMode,
  EngineType,
  RateLimitSnapshot,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";

import { ThreadList } from "./ThreadList";
import { ThreadLoading } from "./ThreadLoading";
import { WorktreeSection } from "./WorktreeSection";
import { PinnedThreadList } from "./PinnedThreadList";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorkspaceGroup } from "./WorkspaceGroup";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import { useSidebarMenus } from "../hooks/useSidebarMenus";
import { useSidebarScrollFade } from "../hooks/useSidebarScrollFade";
import { useThreadRows } from "../hooks/useThreadRows";
import { formatRelativeTimeShort } from "../../../utils/time";
import { EngineIcon } from "../../engine/components/EngineIcon";
import Brain from "lucide-react/dist/esm/icons/brain";
import BrainCircuit from "lucide-react/dist/esm/icons/brain-circuit";
import BriefcaseBusiness from "lucide-react/dist/esm/icons/briefcase-business";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import ChevronsDownUp from "lucide-react/dist/esm/icons/chevrons-down-up";
import Copy from "lucide-react/dist/esm/icons/copy";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Home from "lucide-react/dist/esm/icons/home";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid";
import MessageSquareMore from "lucide-react/dist/esm/icons/message-square-more";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Settings from "lucide-react/dist/esm/icons/settings";
import SquareTerminal from "lucide-react/dist/esm/icons/square-terminal";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";

const UNGROUPED_COLLAPSE_ID = "__ungrouped__";

type WorkspaceGroupSection = {
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
};

type SidebarProps = {
  workspaces: WorkspaceInfo[];
  groupedWorkspaces: WorkspaceGroupSection[];
  hasWorkspaceGroups: boolean;
  deletingWorktreeIds: Set<string>;
  threadsByWorkspace: Record<string, ThreadSummary[]>;
  threadParentById: Record<string, string>;
  threadStatusById: Record<
    string,
    { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
  >;
  threadListLoadingByWorkspace: Record<string, boolean>;
  threadListPagingByWorkspace: Record<string, boolean>;
  threadListCursorByWorkspace: Record<string, string | null>;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  accountRateLimits: RateLimitSnapshot | null;
  usageShowRemaining: boolean;
  accountInfo: AccountSnapshot | null;
  onSwitchAccount: () => void;
  onCancelSwitchAccount: () => void;
  accountSwitching: boolean;
  onOpenSettings: () => void;
  onOpenDebug: () => void;
  showDebugButton?: boolean;
  showTerminalButton?: boolean;
  isTerminalOpen?: boolean;
  onToggleTerminal?: () => void;
  onAddWorkspace: () => void;
  onSelectHome: () => void;
  onSelectWorkspace: (id: string) => void;
  onConnectWorkspace: (workspace: WorkspaceInfo) => void;
  onAddAgent: (workspace: WorkspaceInfo, engine?: EngineType) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onAddCloneAgent: (workspace: WorkspaceInfo) => void;
  onToggleWorkspaceCollapse: (workspaceId: string, collapsed: boolean) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  pinThread: (workspaceId: string, threadId: string) => boolean;
  unpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  isThreadAutoNaming: (workspaceId: string, threadId: string) => boolean;
  getPinTimestamp: (workspaceId: string, threadId: string) => number | null;
  pinnedThreadsVersion: number;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onAutoNameThread: (workspaceId: string, threadId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  workspaceDropTargetRef: RefObject<HTMLElement | null>;
  isWorkspaceDropActive: boolean;
  workspaceDropText: string;
  onWorkspaceDragOver: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDragEnter: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDragLeave: (event: React.DragEvent<HTMLElement>) => void;
  onWorkspaceDrop: (event: React.DragEvent<HTMLElement>) => void;
  appMode: AppMode;
  onAppModeChange: (mode: AppMode) => void;
  onOpenMemory: () => void;
  onOpenProjectMemory: () => void;
  onOpenSpecHub: () => void;
  onOpenWorkspaceHome: () => void;
  topbarNode?: ReactNode;
};

export function Sidebar({
  workspaces,
  groupedWorkspaces,
  hasWorkspaceGroups: _hasWorkspaceGroups,
  deletingWorktreeIds,
  threadsByWorkspace,
  threadParentById,
  threadStatusById,
  threadListLoadingByWorkspace,
  threadListPagingByWorkspace,
  threadListCursorByWorkspace,
  activeWorkspaceId,
  activeThreadId,
  accountInfo: _accountInfo,
  onSwitchAccount: _onSwitchAccount,
  onCancelSwitchAccount: _onCancelSwitchAccount,
  accountSwitching: _accountSwitching,
  onOpenSettings,
  onOpenDebug: _onOpenDebug,
  showTerminalButton,
  isTerminalOpen,
  onToggleTerminal,
  onAddWorkspace,
  onSelectHome: _onSelectHome,
  onSelectWorkspace,
  onConnectWorkspace,
  onAddAgent,
  onAddWorktreeAgent,
  onAddCloneAgent,
  onToggleWorkspaceCollapse,
  onSelectThread,
  onDeleteThread,
  onSyncThread,
  pinThread,
  unpinThread,
  isThreadPinned,
  isThreadAutoNaming,
  getPinTimestamp,
  pinnedThreadsVersion,
  onRenameThread,
  onAutoNameThread,
  onDeleteWorkspace,
  onDeleteWorktree,
  onLoadOlderThreads,
  onReloadWorkspaceThreads,
  workspaceDropTargetRef,
  isWorkspaceDropActive,
  workspaceDropText,
  onWorkspaceDragOver,
  onWorkspaceDragEnter,
  onWorkspaceDragLeave,
  onWorkspaceDrop,
  appMode,
  onAppModeChange,
  onOpenMemory,
  onOpenProjectMemory,
  onOpenSpecHub,
  onOpenWorkspaceHome,
  topbarNode,
}: SidebarProps) {
  const { t } = useTranslation();



  const [expandedWorkspaces, setExpandedWorkspaces] = useState(
    new Set<string>(),
  );
  const [collapsedWorktreeSections, setCollapsedWorktreeSections] = useState(
    new Set<string>(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearchOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const { collapsedGroups, toggleGroupCollapse, replaceCollapsedGroups } =
    useCollapsedGroups();
  const { getThreadRows } = useThreadRows(threadParentById);
  const {
    showThreadMenu,
    showWorkspaceMenu,
    showWorktreeMenu,
    workspaceMenuState,
    closeWorkspaceMenu,
    onWorkspaceMenuAction,
  } =
    useSidebarMenus({
      onAddAgent,
      onDeleteThread,
      onSyncThread,
      onPinThread: pinThread,
      onUnpinThread: unpinThread,
      isThreadPinned,
      isThreadAutoNaming,
      onRenameThread,
      onAutoNameThread,
      onReloadWorkspaceThreads,
      onDeleteWorkspace,
      onDeleteWorktree,
      onAddWorktreeAgent,
      onAddCloneAgent,
    });
  const normalizedQuery = debouncedQuery.trim().toLowerCase();

  useEffect(() => {
    if (!workspaceMenuState) {
      return;
    }
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWorkspaceMenu();
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [workspaceMenuState, closeWorkspaceMenu]);

  const renderWorkspaceMenuIcon = useCallback((iconKind: string) => {
    switch (iconKind) {
      case "engine-claude":
        return <EngineIcon engine="claude" size={14} />;
      case "engine-codex":
        return <EngineIcon engine="codex" size={14} style={{ color: "#10a37f" }} />;
      case "engine-opencode":
        return <EngineIcon engine="opencode" size={14} style={{ color: "#3b82f6" }} />;
      case "engine-gemini":
        return <EngineIcon engine="gemini" size={14} />;
      case "reload":
        return <RefreshCw size={13} />;
      case "remove":
        return <Trash2 size={13} />;
      case "new-worktree":
        return <GitBranch size={13} />;
      case "new-clone":
        return <Copy size={13} />;
      default:
        return null;
    }
  }, []);

  const isWorkspaceMatch = useCallback(
    (workspace: WorkspaceInfo) => {
      if (!normalizedQuery) {
        return true;
      }
      return workspace.name.toLowerCase().includes(normalizedQuery);
    },
    [normalizedQuery],
  );

  const renderHighlightedName = useCallback(
    (name: string) => {
      if (!normalizedQuery) {
        return name;
      }
      const lower = name.toLowerCase();
      const parts: React.ReactNode[] = [];
      let cursor = 0;
      let matchIndex = lower.indexOf(normalizedQuery, cursor);

      while (matchIndex !== -1) {
        if (matchIndex > cursor) {
          parts.push(name.slice(cursor, matchIndex));
        }
        parts.push(
          <span key={`${matchIndex}-${cursor}`} className="workspace-name-match">
            {name.slice(matchIndex, matchIndex + normalizedQuery.length)}
          </span>,
        );
        cursor = matchIndex + normalizedQuery.length;
        matchIndex = lower.indexOf(normalizedQuery, cursor);
      }

      if (cursor < name.length) {
        parts.push(name.slice(cursor));
      }

      return parts.length ? parts : name;
    },
    [normalizedQuery],
  );

  const pinnedThreadRows = useMemo(() => {
    type ThreadRow = { thread: ThreadSummary; depth: number };
    const groups: Array<{
      pinTime: number;
      workspaceId: string;
      rows: ThreadRow[];
    }> = [];

    workspaces.forEach((workspace) => {
      if (!isWorkspaceMatch(workspace)) {
        return;
      }
      const threads = threadsByWorkspace[workspace.id] ?? [];
      if (!threads.length) {
        return;
      }
      const { pinnedRows } = getThreadRows(
        threads,
        true,
        workspace.id,
        getPinTimestamp,
      );
      if (!pinnedRows.length) {
        return;
      }
      let currentRows: ThreadRow[] = [];
      let currentPinTime: number | null = null;

      pinnedRows.forEach((row) => {
        if (row.depth === 0) {
          if (currentRows.length && currentPinTime !== null) {
            groups.push({
              pinTime: currentPinTime,
              workspaceId: workspace.id,
              rows: currentRows,
            });
          }
          currentRows = [row];
          currentPinTime = getPinTimestamp(workspace.id, row.thread.id);
        } else {
          currentRows.push(row);
        }
      });

      if (currentRows.length && currentPinTime !== null) {
        groups.push({
          pinTime: currentPinTime,
          workspaceId: workspace.id,
          rows: currentRows,
        });
      }
    });

    return groups
      .sort((a, b) => a.pinTime - b.pinTime)
      .flatMap((group) =>
        group.rows.map((row) => ({
          ...row,
          workspaceId: group.workspaceId,
        })),
      );
  }, [
    workspaces,
    threadsByWorkspace,
    getThreadRows,
    getPinTimestamp,
    isWorkspaceMatch,
    pinnedThreadsVersion,
  ]);

  const scrollFadeDeps = useMemo(
    () => [groupedWorkspaces, threadsByWorkspace, expandedWorkspaces, normalizedQuery],
    [groupedWorkspaces, threadsByWorkspace, expandedWorkspaces, normalizedQuery],
  );
  const { sidebarBodyRef, scrollFade, updateScrollFade } =
    useSidebarScrollFade(scrollFadeDeps);

  const filteredGroupedWorkspaces = useMemo(
    () =>
      groupedWorkspaces
        .map((group) => ({
          ...group,
          workspaces: group.workspaces.filter(isWorkspaceMatch),
        }))
        .filter((group) => group.workspaces.length > 0),
    [groupedWorkspaces, isWorkspaceMatch],
  );

  const isSearchActive = Boolean(normalizedQuery);

  const hasNamedGroupsInView = useMemo(
    () => filteredGroupedWorkspaces.some((g) => g.id !== null),
    [filteredGroupedWorkspaces],
  );

  const worktreesByParent = useMemo(() => {
    const worktrees = new Map<string, WorkspaceInfo[]>();
    workspaces
      .filter((entry) => (entry.kind ?? "main") === "worktree" && entry.parentId)
      .forEach((entry) => {
        const parentId = entry.parentId as string;
        const list = worktrees.get(parentId) ?? [];
        list.push(entry);
        worktrees.set(parentId, list);
      });
    worktrees.forEach((entries) => {
      entries.sort((a, b) => a.name.localeCompare(b.name));
    });
    return worktrees;
  }, [workspaces]);

  const handleToggleExpanded = useCallback((workspaceId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  }, []);

  const handleToggleWorktreeSection = useCallback((workspaceId: string) => {
    setCollapsedWorktreeSections((previous) => {
      const next = new Set(previous);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
      }
      return next;
    });
  }, []);

  const rootWorkspaceIds = useMemo(
    () =>
      groupedWorkspaces.flatMap((group) =>
        group.workspaces.map((workspace) => workspace.id),
      ),
    [groupedWorkspaces],
  );

  const allGroupToggleIds = useMemo(() => {
    const hasNamedGroups = groupedWorkspaces.some((g) => g.id !== null);
    const ids = new Set<string>();
    groupedWorkspaces.forEach((group) => {
      const showGroupHeader = Boolean(group.id) || hasNamedGroups;
      if (!showGroupHeader) {
        return;
      }
      ids.add(group.id ?? UNGROUPED_COLLAPSE_ID);
    });
    return Array.from(ids);
  }, [groupedWorkspaces]);

  const isAllCollapsed = useMemo(() => {
    const allWorkspaceCollapsed = workspaces.every(
      (workspace) => workspace.settings.sidebarCollapsed,
    );
    const allWorktreeSectionCollapsed = rootWorkspaceIds.every((id) =>
      collapsedWorktreeSections.has(id),
    );
    const allWorkspaceGroupCollapsed = allGroupToggleIds.every((id) =>
      collapsedGroups.has(id),
    );
    return (
      allWorkspaceCollapsed &&
      allWorktreeSectionCollapsed &&
      allWorkspaceGroupCollapsed
    );
  }, [
    workspaces,
    rootWorkspaceIds,
    collapsedWorktreeSections,
    allGroupToggleIds,
    collapsedGroups,
  ]);

  const handleToggleCollapseAll = useCallback(() => {
    const shouldCollapse = !isAllCollapsed;
    workspaces.forEach((workspace) => {
      const currentlyCollapsed = workspace.settings.sidebarCollapsed;
      if (currentlyCollapsed !== shouldCollapse) {
        onToggleWorkspaceCollapse(workspace.id, shouldCollapse);
      }
    });
    setCollapsedWorktreeSections(
      shouldCollapse ? new Set(rootWorkspaceIds) : new Set<string>(),
    );
    replaceCollapsedGroups(
      shouldCollapse ? new Set(allGroupToggleIds) : new Set<string>(),
    );
  }, [
    allGroupToggleIds,
    isAllCollapsed,
    onToggleWorkspaceCollapse,
    replaceCollapsedGroups,
    rootWorkspaceIds,
    workspaces,
  ]);

  const getThreadTime = useCallback(
    (thread: ThreadSummary) => {
      const timestamp = thread.updatedAt ?? null;
      return timestamp ? formatRelativeTimeShort(timestamp) : null;
    },
    [],
  );

  useEffect(() => {
    if (!isSettingsMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(target) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(target)
      ) {
        setIsSettingsMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isSettingsMenuOpen]);

  useEffect(() => {
    if (!isSearchOpen && searchQuery) {
      setSearchQuery("");
    }
  }, [isSearchOpen, searchQuery]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const handleOpenWorkspaceOverview = useCallback(() => {
    onOpenWorkspaceHome();
  }, [onOpenWorkspaceHome]);

  return (
    <aside
      className={`sidebar${isSearchOpen ? " search-open" : ""}`}
      ref={workspaceDropTargetRef}
      onDragOver={onWorkspaceDragOver}
      onDragEnter={onWorkspaceDragEnter}
      onDragLeave={onWorkspaceDragLeave}
      onDrop={onWorkspaceDrop}
    >
      <div className="sidebar-topbar-placeholder">
        {topbarNode ? (
          <div className="sidebar-topbar-content">
            {topbarNode}
          </div>
        ) : null}
      </div>
      <div className={`sidebar-search${isSearchOpen ? " is-open" : ""}`}>
        {isSearchOpen && (
          <input
            className="sidebar-search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t("sidebar.searchProjects")}
            aria-label={t("sidebar.searchProjects")}
            data-tauri-drag-region="false"
            autoFocus
          />
        )}
        {isSearchOpen && searchQuery.length > 0 && (
          <button
            type="button"
            className="sidebar-search-clear"
            onClick={() => setSearchQuery("")}
            aria-label={t("sidebar.clearSearch")}
            data-tauri-drag-region="false"
          >
            <span className="codicon codicon-close" style={{ fontSize: "12px" }} aria-hidden />
          </button>
        )}
      </div>
      <div
        className={`workspace-drop-overlay${
          isWorkspaceDropActive ? " is-active" : ""
        }`}
        aria-hidden
      >
        <div
          className={`workspace-drop-overlay-text${
            workspaceDropText === "Adding Project..." ? " is-busy" : ""
          }`}
        >
          {workspaceDropText === "Drop Project Here" && (
            <span className="codicon codicon-folder-opened workspace-drop-overlay-icon" aria-hidden />
          )}
          {workspaceDropText === "Drop Project Here"
            ? t("sidebar.dropProjectHere")
            : workspaceDropText === "Adding Project..."
              ? t("sidebar.addingProject")
              : workspaceDropText}
        </div>
      </div>
      <div className="sidebar-body">
        <div className="sidebar-body-layout">
          <nav className="sidebar-primary-nav" aria-label={t("tabbar.primaryNavigation")}>
            <button
              type="button"
              className={`sidebar-primary-nav-item ${appMode === "chat" ? "is-active" : ""}`}
              onClick={() => onAppModeChange("chat")}
              title={t("sidebar.quickNewThread")}
              aria-label={t("sidebar.quickNewThread")}
              data-tauri-drag-region="false"
            >
              <MessageSquareMore className="sidebar-primary-nav-icon" aria-hidden />
              <span className="sidebar-primary-nav-text">{t("sidebar.quickNewThread")}</span>
            </button>
            <button
              type="button"
              className={`sidebar-primary-nav-item ${appMode === "kanban" ? "is-active" : ""}`}
              onClick={() => onAppModeChange("kanban")}
              title={t("sidebar.quickAutomation")}
              aria-label={t("sidebar.quickAutomation")}
              data-tauri-drag-region="false"
            >
              <LayoutGrid className="sidebar-primary-nav-icon" aria-hidden />
              <span className="sidebar-primary-nav-text">{t("sidebar.quickAutomation")}</span>
            </button>
            <button
              type="button"
              className="sidebar-primary-nav-item"
              onClick={onOpenSpecHub}
              title={t("sidebar.quickSkills")}
              aria-label={t("sidebar.quickSkills")}
              data-tauri-drag-region="false"
            >
              <BriefcaseBusiness className="sidebar-primary-nav-icon" aria-hidden />
              <span className="sidebar-primary-nav-text">{t("sidebar.quickSkills")}</span>
            </button>
          </nav>
          <div className="sidebar-quick-icon-strip" role="group" aria-label={t("sidebar.pluginMarket")}>
            <button
              type="button"
              className="sidebar-quick-icon-button"
              onClick={onOpenMemory}
              title={t("sidebar.longTermMemory")}
              aria-label={t("sidebar.longTermMemory")}
              data-tauri-drag-region="false"
            >
              <BrainCircuit size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="sidebar-quick-icon-button"
              onClick={onOpenSpecHub}
              title={t("sidebar.specHub")}
              aria-label={t("sidebar.specHub")}
              data-tauri-drag-region="false"
            >
              <LayoutDashboard size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="sidebar-quick-icon-button"
              onClick={onOpenProjectMemory}
              title={t("panels.memory")}
              aria-label={t("panels.memory")}
              data-tauri-drag-region="false"
            >
              <Brain size={14} aria-hidden />
            </button>
            <button
              type="button"
              className={`sidebar-quick-icon-button${appMode === "gitHistory" ? " is-active" : ""}`}
              onClick={() => onAppModeChange(appMode === "gitHistory" ? "chat" : "gitHistory")}
              title={t("git.logMode")}
              aria-label={t("git.logMode")}
              data-tauri-drag-region="false"
            >
              <GitBranch size={14} aria-hidden />
            </button>
            {showTerminalButton && onToggleTerminal ? (
              <button
                type="button"
                className={`sidebar-quick-icon-button${isTerminalOpen ? " is-active" : ""}`}
                onClick={onToggleTerminal}
                title={t("common.terminal")}
                aria-label={t("common.toggleTerminalPanel")}
                data-tauri-drag-region="false"
              >
                <SquareTerminal size={14} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="sidebar-quick-icon-button"
              onClick={handleOpenWorkspaceOverview}
              title={t("sidebar.openHome")}
              aria-label={t("sidebar.openHome")}
              data-tauri-drag-region="false"
            >
              <Home size={14} aria-hidden />
            </button>
          </div>
          <ScrollArea
            className={`sidebar-content-column${scrollFade.top ? " fade-top" : ""}${
              scrollFade.bottom ? " fade-bottom" : ""
            }`}
            onViewportScroll={updateScrollFade}
            viewportRef={sidebarBodyRef}
          >
            <div className="sidebar-section-header">
              <div className="sidebar-section-title">
                <span className="codicon codicon-folder sidebar-section-title-icon" aria-hidden />
                {t("sidebar.projects")}
              </div>
              <button
                className="sidebar-title-add sidebar-title-toggle-all"
                onClick={handleToggleCollapseAll}
                data-tauri-drag-region="false"
                aria-label={
                  isAllCollapsed
                    ? t("sidebar.expandAllSections")
                    : t("sidebar.collapseAllSections")
                }
                type="button"
                title={
                  isAllCollapsed
                    ? t("sidebar.expandAllSections")
                    : t("sidebar.collapseAllSections")
                }
              >
                <ChevronsDownUp size={14} aria-hidden />
              </button>
              <button
                className="sidebar-title-add"
                onClick={onAddWorkspace}
                data-tauri-drag-region="false"
                aria-label={t("sidebar.addWorkspace")}
                type="button"
                title={t("sidebar.addWorkspace")}
              >
                <span
                  className="codicon codicon-new-folder"
                  aria-hidden
                  style={{ fontSize: "16px" }}
                />
              </button>
            </div>
            <div className="workspace-list">
          {pinnedThreadRows.length > 0 && (
            <div className="pinned-section">
              <div className="workspace-group-header">
                <div className="workspace-group-label">{t("sidebar.pinned")}</div>
              </div>
              <PinnedThreadList
                rows={pinnedThreadRows}
                activeWorkspaceId={activeWorkspaceId}
                activeThreadId={activeThreadId}
                threadStatusById={threadStatusById}
                getThreadTime={getThreadTime}
                isThreadPinned={isThreadPinned}
                isThreadAutoNaming={isThreadAutoNaming}
                onSelectThread={onSelectThread}
                onShowThreadMenu={showThreadMenu}
              />
            </div>
          )}
          {filteredGroupedWorkspaces.map((group) => {
            const groupId = group.id;
            const showGroupHeader = Boolean(groupId) || hasNamedGroupsInView;
            const toggleId = groupId ?? (showGroupHeader ? UNGROUPED_COLLAPSE_ID : null);
            const isGroupCollapsed = Boolean(
              toggleId && collapsedGroups.has(toggleId),
            );

            return (
              <WorkspaceGroup
                key={group.id ?? "ungrouped"}
                toggleId={toggleId}
                name={group.name}
                showHeader={showGroupHeader}
                isCollapsed={isGroupCollapsed}
                onToggleCollapse={toggleGroupCollapse}
              >
                {group.workspaces.map((entry) => {
                  const threads = threadsByWorkspace[entry.id] ?? [];
                  const isCollapsed = entry.settings.sidebarCollapsed;
                  const isExpanded = expandedWorkspaces.has(entry.id);
                  const {
                    unpinnedRows,
                    totalRoots: totalThreadRoots,
                  } = getThreadRows(
                    threads,
                    isExpanded,
                    entry.id,
                    getPinTimestamp,
                  );
                  const nextCursor =
                    threadListCursorByWorkspace[entry.id] ?? null;
                  const showThreadList =
                    !isCollapsed && (threads.length > 0 || Boolean(nextCursor));
                  const isLoadingThreads =
                    threadListLoadingByWorkspace[entry.id] ?? false;
                  const showThreadLoader =
                    !isCollapsed && isLoadingThreads && threads.length === 0;
                  const isPaging = threadListPagingByWorkspace[entry.id] ?? false;
                  const worktrees = worktreesByParent.get(entry.id) ?? [];
                  const isWorktreeSectionCollapsed =
                    collapsedWorktreeSections.has(entry.id);
                  const hasPrimaryActiveThread =
                    entry.id === activeWorkspaceId && Boolean(activeThreadId);
                  return (
                    <WorkspaceCard
                      key={entry.id}
                      workspace={entry}
                      workspaceName={renderHighlightedName(entry.name)}
                      isActive={entry.id === activeWorkspaceId}
                      hasPrimaryActiveThread={hasPrimaryActiveThread}
                      isCollapsed={isCollapsed}
                      onSelectWorkspace={onSelectWorkspace}
                      onShowWorkspaceMenu={showWorkspaceMenu}
                      onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
                    >
                      {!isCollapsed && worktrees.length > 0 && (
                        <WorktreeSection
                          parentWorkspaceId={entry.id}
                          worktrees={worktrees}
                          isSectionCollapsed={isWorktreeSectionCollapsed}
                          onToggleSectionCollapse={handleToggleWorktreeSection}
                          deletingWorktreeIds={deletingWorktreeIds}
                          threadsByWorkspace={threadsByWorkspace}
                          threadStatusById={threadStatusById}
                          threadListLoadingByWorkspace={threadListLoadingByWorkspace}
                          threadListPagingByWorkspace={threadListPagingByWorkspace}
                          threadListCursorByWorkspace={threadListCursorByWorkspace}
                          expandedWorkspaces={expandedWorkspaces}
                          activeWorkspaceId={activeWorkspaceId}
                          activeThreadId={activeThreadId}
                          getThreadRows={getThreadRows}
                          getThreadTime={getThreadTime}
                          isThreadPinned={isThreadPinned}
                          isThreadAutoNaming={isThreadAutoNaming}
                          getPinTimestamp={getPinTimestamp}
                          onSelectWorkspace={onSelectWorkspace}
                          onConnectWorkspace={onConnectWorkspace}
                          onToggleWorkspaceCollapse={onToggleWorkspaceCollapse}
                          onSelectThread={onSelectThread}
                          onShowThreadMenu={showThreadMenu}
                          onShowWorktreeMenu={showWorktreeMenu}
                          onToggleExpanded={handleToggleExpanded}
                          onLoadOlderThreads={onLoadOlderThreads}
                        />
                      )}
                      {showThreadList && (
                        <ThreadList
                          workspaceId={entry.id}
                          pinnedRows={[]}
                          unpinnedRows={unpinnedRows}
                          totalThreadRoots={totalThreadRoots}
                          isExpanded={isExpanded}
                          nextCursor={nextCursor}
                          isPaging={isPaging}
                          activeWorkspaceId={activeWorkspaceId}
                          activeThreadId={activeThreadId}
                          threadStatusById={threadStatusById}
                          getThreadTime={getThreadTime}
                          isThreadPinned={isThreadPinned}
                          isThreadAutoNaming={isThreadAutoNaming}
                          onToggleExpanded={handleToggleExpanded}
                          onLoadOlderThreads={onLoadOlderThreads}
                          onSelectThread={onSelectThread}
                          onShowThreadMenu={showThreadMenu}
                        />
                      )}
                      {showThreadLoader && (
                        <ThreadLoading />
                      )}
                    </WorkspaceCard>
                  );
                })}
              </WorkspaceGroup>
            );
          })}
          {!filteredGroupedWorkspaces.length && (
            <div className="empty">
              {isSearchActive
                ? t("sidebar.noProjectsMatch")
                : t("sidebar.addWorkspaceToStart")}
            </div>
          )}
            </div>
          </ScrollArea>
          <div className="sidebar-bottom-nav">
            <div className="sidebar-settings-dropdown-wrapper">
              {isSettingsMenuOpen && (
                <div
                  className="sidebar-settings-dropdown"
                  ref={settingsMenuRef}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={`sidebar-settings-dropdown-item${appMode === "chat" ? " is-active" : ""}`}
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onAppModeChange("chat");
                    }}
                  >
                    <MessageSquareMore size={14} aria-hidden />
                    <span>{t("sidebar.quickNewThread")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={`sidebar-settings-dropdown-item${appMode === "kanban" ? " is-active" : ""}`}
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onAppModeChange("kanban");
                    }}
                  >
                    <LayoutGrid size={14} aria-hidden />
                    <span>{t("sidebar.quickAutomation")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sidebar-settings-dropdown-item"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onOpenSpecHub();
                    }}
                  >
                    <BriefcaseBusiness size={14} aria-hidden />
                    <span>{t("sidebar.quickSkills")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sidebar-settings-dropdown-item"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onOpenMemory();
                    }}
                  >
                    <BrainCircuit size={14} aria-hidden />
                    <span>{t("sidebar.longTermMemory")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sidebar-settings-dropdown-item"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onOpenSpecHub();
                    }}
                  >
                    <LayoutDashboard size={14} aria-hidden />
                    <span>{t("sidebar.specHub")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sidebar-settings-dropdown-item"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onOpenProjectMemory();
                    }}
                  >
                    <Brain size={14} aria-hidden />
                    <span>{t("panels.memory")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sidebar-settings-dropdown-item"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onOpenSettings();
                    }}
                  >
                    <Settings size={14} aria-hidden />
                    <span>{t("settings.title")}</span>
                  </button>
                  {showTerminalButton && onToggleTerminal ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={`sidebar-settings-dropdown-item${isTerminalOpen ? " is-active" : ""}`}
                      onClick={() => {
                        setIsSettingsMenuOpen(false);
                        onToggleTerminal();
                      }}
                    >
                      <span className="codicon codicon-terminal" style={{ fontSize: "14px" }} aria-hidden />
                      <span>{t("common.terminal")}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className={`sidebar-settings-dropdown-item${appMode === "gitHistory" ? " is-active" : ""}`}
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      onAppModeChange(appMode === "gitHistory" ? "chat" : "gitHistory");
                    }}
                  >
                    <GitBranch size={14} aria-hidden />
                    <span>{t("git.logMode")}</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="sidebar-settings-dropdown-item"
                    onClick={() => {
                      setIsSettingsMenuOpen(false);
                      handleOpenWorkspaceOverview();
                    }}
                  >
                    <Home size={14} aria-hidden />
                    <span>{t("sidebar.openHome")}</span>
                  </button>
                </div>
              )}
              <button
                ref={settingsButtonRef}
                type="button"
                className={`sidebar-primary-nav-item sidebar-primary-nav-item-bottom${isSettingsMenuOpen ? " is-active" : ""}`}
                onClick={() => setIsSettingsMenuOpen((prev) => !prev)}
                title={t("settings.title")}
                aria-label={t("settings.title")}
                aria-expanded={isSettingsMenuOpen}
                aria-haspopup="menu"
                data-tauri-drag-region="false"
              >
                <Settings className="sidebar-primary-nav-icon" aria-hidden />
                <span className="sidebar-primary-nav-text">{t("settings.title")}</span>
                <ChevronUp
                  size={14}
                  className={`sidebar-settings-chevron${isSettingsMenuOpen ? " is-open" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
          </div>
        </div>
      </div>
      {workspaceMenuState ? (
        <div
          className="sidebar-workspace-menu-backdrop"
          onClick={closeWorkspaceMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeWorkspaceMenu();
          }}
        >
          <div
            className="sidebar-workspace-menu"
            role="menu"
            aria-label={t("sidebar.workspaceActionsGroup")}
            style={{
              left: workspaceMenuState.x,
              top: workspaceMenuState.y,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {workspaceMenuState.groups.map((group, groupIndex) => (
              <div className="sidebar-workspace-menu-group" key={group.id}>
                <div className="sidebar-workspace-menu-group-title">
                  {group.label}
                </div>
                {group.actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    className={`sidebar-workspace-menu-item${
                      action.tone === "danger" ? " is-danger" : ""
                    }${action.deprecated ? " is-deprecated" : ""}${
                      action.unavailable ? " is-unavailable" : ""
                    }`}
                    disabled={action.unavailable}
                    onClick={() => onWorkspaceMenuAction(action)}
                  >
                    <span
                      className={`sidebar-workspace-menu-item-icon sidebar-workspace-menu-item-icon-${action.iconKind}${
                        action.unavailable ? " is-unavailable" : ""
                      }`}
                      aria-hidden
                    >
                      {renderWorkspaceMenuIcon(action.iconKind)}
                    </span>
                    <span className="sidebar-workspace-menu-item-label">
                      {action.label}
                    </span>
                    {action.deprecated ? (
                      <span className="sidebar-workspace-menu-item-deprecated">
                        ({t("sidebar.deprecatedTag")})
                      </span>
                    ) : null}
                    {action.unavailable ? (
                      <span className="sidebar-workspace-menu-item-unavailable">
                        ({t("sidebar.unavailableTag")})
                      </span>
                    ) : null}
                  </button>
                ))}
                {groupIndex < workspaceMenuState.groups.length - 1 ? (
                  <div className="sidebar-workspace-menu-divider" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
