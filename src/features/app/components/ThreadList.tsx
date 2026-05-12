import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ThreadSummary } from "../../../types";
import type { ThreadMoveFolderTarget } from "../hooks/useSidebarMenus";
import { ProxyStatusBadge } from "../../../components/ProxyStatusBadge";
import { EngineIcon } from "../../engine/components/EngineIcon";
import { SharedSessionIcon } from "../../shared-session/components/SharedSessionIcon";
import { ThreadDeleteConfirmBubble } from "../../threads/components/ThreadDeleteConfirmBubble";
import { getExitedSessionRowVisibility } from "../utils/exitedSessionRows";

type ThreadStatusMap = Record<
  string,
  { isProcessing: boolean; hasUnread: boolean; isReviewing: boolean }
>;

type ThreadRow = {
  thread: ThreadSummary;
  depth: number;
  hasChildren?: boolean;
};

function isPendingSubagentThread(thread: ThreadSummary) {
  return thread.id.startsWith("claude-pending-subagent:");
}

function filterCollapsedThreadRows(
  rows: ThreadRow[],
  collapsedParentThreadIds: ReadonlySet<string>,
) {
  if (collapsedParentThreadIds.size === 0) {
    return rows;
  }

  const visibleRows: ThreadRow[] = [];
  let collapsedDepth: number | null = null;

  rows.forEach((row) => {
    if (collapsedDepth !== null) {
      if (row.depth > collapsedDepth) {
        return;
      }
      collapsedDepth = null;
    }

    visibleRows.push(row);
    if (row.hasChildren && collapsedParentThreadIds.has(row.thread.id)) {
      collapsedDepth = row.depth;
    }
  });

  return visibleRows;
}

export type ThreadListProps = {
  workspaceId: string;
  workspacePath: string;
  pinnedRows: ThreadRow[];
  unpinnedRows: ThreadRow[];
  totalThreadRoots: number;
  visibleThreadRootCount: number;
  isExpanded: boolean;
  nextCursor: string | null;
  isPaging: boolean;
  nested?: boolean;
  showLoadOlder?: boolean;
  moveFolderTargets?: ThreadMoveFolderTarget[];
  hideExitedSessions?: boolean;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  systemProxyEnabled?: boolean;
  systemProxyUrl?: string | null;
  threadStatusById: ThreadStatusMap;
  getThreadTime: (thread: ThreadSummary) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  isThreadAutoNaming: (workspaceId: string, threadId: string) => boolean;
  onToggleThreadPin?: (workspaceId: string, threadId: string) => void;
  onToggleExpanded: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
    sizeBytes?: number,
    moveFolderTargets?: ThreadMoveFolderTarget[],
    currentFolderId?: string | null,
    canArchive?: boolean,
    workspacePath?: string,
  ) => void;
  deleteConfirmThreadId?: string | null;
  deleteConfirmWorkspaceId?: string | null;
  deleteConfirmBusy?: boolean;
  onCancelDeleteConfirm?: () => void;
  onConfirmDeleteConfirm?: () => void;
};

export function ThreadList({
  workspaceId,
  workspacePath,
  pinnedRows,
  unpinnedRows,
  totalThreadRoots,
  visibleThreadRootCount,
  isExpanded,
  nextCursor,
  isPaging,
  nested,
  showLoadOlder = true,
  moveFolderTargets = [],
  hideExitedSessions = false,
  activeWorkspaceId,
  activeThreadId,
  systemProxyEnabled = false,
  systemProxyUrl = null,
  threadStatusById,
  getThreadTime,
  isThreadPinned,
  isThreadAutoNaming,
  onToggleThreadPin,
  onToggleExpanded,
  onLoadOlderThreads,
  onSelectThread,
  onShowThreadMenu,
  deleteConfirmThreadId = null,
  deleteConfirmWorkspaceId = null,
  deleteConfirmBusy = false,
  onCancelDeleteConfirm,
  onConfirmDeleteConfirm,
}: ThreadListProps) {
  const { t } = useTranslation();
  const indentUnit = nested ? 10 : 14;
  const [collapsedParentThreadIds, setCollapsedParentThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const isExitedThread = useCallback((thread: ThreadSummary) => {
    if (isPendingSubagentThread(thread)) {
      return false;
    }
    const status = threadStatusById[thread.id];
    return !status?.isProcessing && !status?.isReviewing;
  }, [threadStatusById]);
  const { visiblePinnedRows, visibleUnpinnedRows, hiddenExitedCount } = useMemo(() => {
    const pinnedVisibility = getExitedSessionRowVisibility(pinnedRows, {
      hideExitedSessions,
      isExitedThread,
    });
    const unpinnedVisibility = getExitedSessionRowVisibility(unpinnedRows, {
      hideExitedSessions,
      isExitedThread,
    });

    return {
      visiblePinnedRows: pinnedVisibility.visibleRows,
      visibleUnpinnedRows: unpinnedVisibility.visibleRows,
      hiddenExitedCount:
        pinnedVisibility.hiddenExitedCount + unpinnedVisibility.hiddenExitedCount,
    };
  }, [hideExitedSessions, isExitedThread, pinnedRows, unpinnedRows]);
  const showHiddenExitedSummary = useMemo(
    () =>
      hideExitedSessions &&
      hiddenExitedCount > 0 &&
      visiblePinnedRows.length === 0 &&
      visibleUnpinnedRows.length === 0,
    [hiddenExitedCount, hideExitedSessions, visiblePinnedRows.length, visibleUnpinnedRows.length],
  );
  const contextMenuMoveFolderTargets =
    moveFolderTargets.length > 0 ? moveFolderTargets : undefined;
  const displayedPinnedRows = useMemo(
    () => filterCollapsedThreadRows(visiblePinnedRows, collapsedParentThreadIds),
    [collapsedParentThreadIds, visiblePinnedRows],
  );
  const displayedUnpinnedRows = useMemo(
    () => filterCollapsedThreadRows(visibleUnpinnedRows, collapsedParentThreadIds),
    [collapsedParentThreadIds, visibleUnpinnedRows],
  );
  const activeThreadParentId = useMemo(() => {
    if (workspaceId !== activeWorkspaceId || !activeThreadId) {
      return null;
    }
    const activeRow = [...visiblePinnedRows, ...visibleUnpinnedRows].find(
      (row) => row.thread.id === activeThreadId,
    );
    return activeRow?.thread.parentThreadId ?? null;
  }, [activeThreadId, activeWorkspaceId, visiblePinnedRows, visibleUnpinnedRows, workspaceId]);
  const toggleSubagentParent = useCallback((event: MouseEvent, threadId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setCollapsedParentThreadIds((current) => {
      const next = new Set(current);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }, []);
  const handleSubagentParentKeyDown = useCallback(
    (event: KeyboardEvent, threadId: string) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setCollapsedParentThreadIds((current) => {
        const next = new Set(current);
        if (next.has(threadId)) {
          next.delete(threadId);
        } else {
          next.add(threadId);
        }
        return next;
      });
    },
    [],
  );
  const renderThreadRow = ({ thread, depth, hasChildren = false }: ThreadRow) => {
    const relativeTime = getThreadTime(thread);
    const isActiveThread =
      workspaceId === activeWorkspaceId && thread.id === activeThreadId;
    const indentStyle =
      depth > 0
        ? ({ "--thread-indent": `${depth * indentUnit}px` } as CSSProperties)
        : undefined;
    const status = threadStatusById[thread.id];
    const statusClass = status?.isReviewing
      ? "reviewing"
      : status?.isProcessing
        ? "processing"
        : status?.hasUnread
          ? "unread"
          : "ready";
    const isProcessing = Boolean(status?.isProcessing);
    const canPin = depth === 0;
    const isPinned = canPin && isThreadPinned(workspaceId, thread.id);
    const isAutoNaming = isThreadAutoNaming(workspaceId, thread.id);
    const showProxyBadge = systemProxyEnabled && isProcessing;
    const isSharedThread = thread.threadKind === "shared";
    const isSubagentThread = depth > 0;
    const isActiveSubagentGroup =
      isSubagentThread &&
      workspaceId === activeWorkspaceId &&
      (thread.parentThreadId === activeThreadId || thread.parentThreadId === activeThreadParentId);
    const isActiveSubagentParent =
      depth === 0 &&
      hasChildren &&
      workspaceId === activeWorkspaceId &&
      (thread.id === activeThreadId || thread.id === activeThreadParentId);
    const isPendingSubagent = isPendingSubagentThread(thread);
    const isSubagentParentCollapsed =
      hasChildren && collapsedParentThreadIds.has(thread.id);
    const subagentTreeToggleLabel = isSubagentParentCollapsed
      ? t("threads.subagentTreeExpand")
      : t("threads.subagentTreeCollapse");
    const selectTargetThreadId =
      isPendingSubagent && thread.parentThreadId ? thread.parentThreadId : thread.id;
    const canArchive =
      !isPendingSubagent && !isSharedThread && !thread.id.startsWith("shared:");
    const engineSource = thread.engineSource ?? "codex";
    const baseEngineTitle =
      engineSource === "claude"
        ? "Claude Code"
        : engineSource === "gemini"
          ? "Gemini"
          : engineSource === "opencode"
            ? "OpenCode"
            : "Codex";
    const engineTitle =
      isSharedThread
        ? `Shared Session · ${baseEngineTitle}`
        : baseEngineTitle;

    const isDeleteConfirmOpen =
      deleteConfirmWorkspaceId === workspaceId && deleteConfirmThreadId === thread.id;

    return (
      <Popover
        key={thread.id}
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            onCancelDeleteConfirm?.();
          }
        }}
      >
        <Tooltip>
          <PopoverAnchor asChild>
            <TooltipTrigger
              delay={450}
              className={`thread-row ${
                isActiveThread ? "active" : ""
              }${isDeleteConfirmOpen ? " has-delete-confirm" : ""}${
                canPin ? " has-pin-toggle" : ""
              }${hasChildren ? " has-child-threads" : ""}${
                depth === 0 && hasChildren ? " is-subagent-parent" : ""
              }${isActiveSubagentParent ? " is-active-subagent-parent" : ""}${
                isSubagentThread ? " is-subagent" : ""
              }${isActiveSubagentGroup ? " is-active-subagent-group" : ""}${
                isPendingSubagent ? " is-pending-subagent" : ""
              }${thread.isDegraded ? " is-degraded" : ""}`}
              style={indentStyle}
              aria-expanded={hasChildren ? !isSubagentParentCollapsed : undefined}
              onClick={() => {
                onSelectThread(workspaceId, selectTargetThreadId);
              }}
              onContextMenu={(event) => {
                if (isPendingSubagent) {
                  event.preventDefault();
                  event.stopPropagation();
                  return;
                }
                onShowThreadMenu(
                  event,
                  workspaceId,
                  thread.id,
                  canPin,
                  thread.sizeBytes,
                  contextMenuMoveFolderTargets,
                  thread.folderId ?? null,
                  canArchive,
                  workspacePath,
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectThread(workspaceId, selectTargetThreadId);
                }
              }}
            >
              <span className={`thread-status ${statusClass}`} aria-hidden />
              {canPin && onToggleThreadPin && (
                <span
                  className={`thread-pin-toggle${isPinned ? " is-pinned" : ""}`}
                  role="button"
                  aria-label={isPinned ? t("threads.unpin") : t("threads.pin")}
                  title={isPinned ? t("threads.unpin") : t("threads.pin")}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleThreadPin(workspaceId, thread.id);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  <span className="thread-pin-toggle-icon" aria-hidden />
                </span>
              )}
              <span
                className={`thread-engine-badge ${
                  isSharedThread ? "thread-engine-shared" : `thread-engine-${engineSource}`
                }${isProcessing ? " is-processing" : ""}`}
                title={engineTitle}
              >
                {isSharedThread ? (
                  <SharedSessionIcon size={12} />
                ) : (
                  <EngineIcon engine={engineSource} size={12} />
                )}
              </span>
              {showProxyBadge && (
                <ProxyStatusBadge
                  proxyUrl={systemProxyUrl}
                  label={t("threads.proxyBadge")}
                  variant="compact"
                  className="thread-proxy-badge"
                />
              )}
              <span className="thread-name">{thread.name}</span>
              <div className="thread-meta">
                {hasChildren && depth === 0 && (
                  <span
                    className={`thread-tree-expander${
                      isSubagentParentCollapsed ? " is-collapsed" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    aria-label={subagentTreeToggleLabel}
                    title={subagentTreeToggleLabel}
                    onClick={(event) => toggleSubagentParent(event, thread.id)}
                    onKeyDown={(event) => handleSubagentParentKeyDown(event, thread.id)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />
                )}
                {isAutoNaming && (
                  <span className="thread-auto-naming">{t("threads.autoNaming")}</span>
                )}
                {relativeTime && <span className="thread-time">{relativeTime}</span>}
              </div>
            </TooltipTrigger>
          </PopoverAnchor>
          <TooltipPopup
            side="top"
            align="start"
            sideOffset={4}
            className="max-w-[400px] break-words"
          >
            {thread.isDegraded && thread.degradedReason
              ? `${thread.name} · ${thread.degradedReason}`
              : thread.name}
          </TooltipPopup>
        </Tooltip>
        {isDeleteConfirmOpen && (
          <PopoverContent
            side="right"
            align="start"
            sideOffset={10}
            className="thread-delete-popover-shell"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <ThreadDeleteConfirmBubble
              threadName={thread.name}
              isDeleting={deleteConfirmBusy}
              onCancel={() => onCancelDeleteConfirm?.()}
              onConfirm={() => onConfirmDeleteConfirm?.()}
            />
          </PopoverContent>
        )}
      </Popover>
    );
  };

  return (
    <div className={`thread-list${nested ? " thread-list-nested" : ""}`}>
      {displayedPinnedRows.map((row) => renderThreadRow(row))}
      {displayedPinnedRows.length > 0 && displayedUnpinnedRows.length > 0 && (
        <div className="thread-list-separator" aria-hidden="true" />
      )}
      {displayedUnpinnedRows.map((row) => renderThreadRow(row))}
      {showHiddenExitedSummary && (
        <div className="thread-list-hidden-summary">
          {t("threads.exitedSessionsHidden", { count: hiddenExitedCount })}
        </div>
      )}
      {totalThreadRoots > visibleThreadRootCount && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded(workspaceId);
          }}
        >
          {isExpanded ? t("threads.showLess") : t("threads.more")}
        </button>
      )}
      {showLoadOlder &&
        nextCursor &&
        (isExpanded || totalThreadRoots <= visibleThreadRootCount) && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onLoadOlderThreads(workspaceId);
          }}
          disabled={isPaging}
        >
          {isPaging
            ? t("threads.loading")
            : totalThreadRoots === 0
              ? t("threads.searchOlder")
              : t("threads.loadOlder")}
        </button>
      )}
    </div>
  );
}
