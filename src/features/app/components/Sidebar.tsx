import type {
  AccountSnapshot,
  AppMode,
  RateLimitSnapshot,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";

import { SidebarMarketLinks } from "./SidebarMarketLinks";
import { ThreadList } from "./ThreadList";
import { ThreadLoading } from "./ThreadLoading";
import { WorktreeSection } from "./WorktreeSection";
import { PinnedThreadList } from "./PinnedThreadList";
import { WorkspaceCard } from "./WorkspaceCard";
import { WorkspaceGroup } from "./WorkspaceGroup";
import { useCollapsedGroups } from "../hooks/useCollapsedGroups";
import { useSidebarMenus } from "../hooks/useSidebarMenus";
import { useSidebarScrollFade } from "../hooks/useSidebarScrollFade";
import { useThreadRows } from "../hooks/useThreadRows";
import { formatRelativeTimeShort } from "../../../utils/time";
import ChevronsDownUp from "lucide-react/dist/esm/icons/chevrons-down-up";
import ChevronsUpDown from "lucide-react/dist/esm/icons/chevrons-up-down";
import Folders from "lucide-react/dist/esm/icons/folders";

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
  onAddAgent: (workspace: WorkspaceInfo) => void;
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
  topbarNode?: ReactNode;
};

export function Sidebar({
  workspaces,
  groupedWorkspaces,
  hasWorkspaceGroups,
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
  const [isRailCollapsed, setIsRailCollapsed] = useState(true);
  const { collapsedGroups, toggleGroupCollapse, replaceCollapsedGroups } =
    useCollapsedGroups();
  const { getThreadRows } = useThreadRows(threadParentById);
  const { showThreadMenu, showWorkspaceMenu, showWorktreeMenu } =
    useSidebarMenus({
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
    const ids = new Set<string>();
    groupedWorkspaces.forEach((group) => {
      const showGroupHeader = Boolean(group.id) || hasWorkspaceGroups;
      if (!showGroupHeader) {
        return;
      }
      ids.add(group.id ?? UNGROUPED_COLLAPSE_ID);
    });
    return Array.from(ids);
  }, [groupedWorkspaces, hasWorkspaceGroups]);

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
        <div className={`sidebar-body-layout ${isRailCollapsed ? "rail-collapsed" : "rail-expanded"}`}>
          <aside className="sidebar-tree-rail-column" aria-label={t("sidebar.pluginMarket")}>
            <SidebarMarketLinks
              onOpenMemory={onOpenMemory}
              appMode={appMode}
              onAppModeChange={onAppModeChange}
              onOpenSettings={onOpenSettings}
              showTerminalButton={showTerminalButton}
              isTerminalOpen={isTerminalOpen}
              onToggleTerminal={onToggleTerminal}
              isCollapsed={isRailCollapsed}
              onToggleCollapsed={() => setIsRailCollapsed((prev) => !prev)}
            />
          </aside>
          <div
            className={`sidebar-content-column${scrollFade.top ? " fade-top" : ""}${
              scrollFade.bottom ? " fade-bottom" : ""
            }`}
            onScroll={updateScrollFade}
            ref={sidebarBodyRef}
          >
            <div className="sidebar-section-header">
              <div className="sidebar-section-title">
                <Folders className="sidebar-section-title-icon" aria-hidden />
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
                {isAllCollapsed ? (
                  <ChevronsUpDown size={14} aria-hidden />
                ) : (
                  <ChevronsDownUp size={14} aria-hidden />
                )}
              </button>
              <button
                className="sidebar-title-add"
                onClick={onAddWorkspace}
                data-tauri-drag-region="false"
                aria-label={t("sidebar.addWorkspace")}
                type="button"
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
            const showGroupHeader = Boolean(groupId) || hasWorkspaceGroups;
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
                      onAddAgent={onAddAgent}
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
          </div>
        </div>
      </div>
    </aside>
  );
}
