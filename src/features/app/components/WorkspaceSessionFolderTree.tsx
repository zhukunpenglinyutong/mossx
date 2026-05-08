import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import Folder from "lucide-react/dist/esm/icons/folder";
import FolderPlus from "lucide-react/dist/esm/icons/folder-plus";
import FolderTree from "lucide-react/dist/esm/icons/folder-tree";
import MessageSquarePlus from "lucide-react/dist/esm/icons/message-square-plus";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import type { KeyboardEvent } from "react";
import type { MouseEvent } from "react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { WorkspaceSessionFolderNode, WorkspaceSessionThreadRow } from "../utils/workspaceSessionFolders";
import type { ThreadMoveFolderTarget } from "../hooks/useSidebarMenus";
import { ThreadDeleteConfirmBubble } from "../../threads/components/ThreadDeleteConfirmBubble";
import { ThreadList } from "./ThreadList";
import type { ThreadListProps } from "./ThreadList";

type WorkspaceSessionFolderTreeProps = {
  workspaceId: string;
  folders: WorkspaceSessionFolderNode[];
  rootRows: WorkspaceSessionThreadRow[];
  totalThreadRoots: number;
  isExpanded: boolean;
  rootDraftRequestKey?: number;
  threadListProps: Omit<ThreadListProps, "workspaceId" | "pinnedRows" | "unpinnedRows" | "totalThreadRoots" | "isExpanded" | "nested">;
  moveFolderTargets: ThreadMoveFolderTarget[];
  collapsedFolderIds: ReadonlySet<string>;
  onNewFolder: (workspaceId: string, name: string, parentId: string | null) => Promise<void> | void;
  onRenameFolder: (workspaceId: string, folderId: string, name: string) => Promise<void> | void;
  onDeleteFolder: (workspaceId: string, folderId: string, name: string) => void;
  onToggleFolderCollapsed: (workspaceId: string, folderId: string) => void;
  onNewSessionInFolder: (event: MouseEvent, workspaceId: string, folderId: string) => void;
};

function countFolderSessions(node: WorkspaceSessionFolderNode): number {
  return node.rows.length + node.children.reduce((total, child) => total + countFolderSessions(child), 0);
}

export function WorkspaceSessionFolderTree({
  workspaceId,
  folders,
  rootRows,
  totalThreadRoots,
  isExpanded,
  rootDraftRequestKey = 0,
  threadListProps,
  moveFolderTargets,
  collapsedFolderIds,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolderCollapsed,
  onNewSessionInFolder,
}: WorkspaceSessionFolderTreeProps) {
  const { t } = useTranslation();
  const [draftTarget, setDraftTarget] = useState<{ parentId: string | null } | null>(null);
  const [draftName, setDraftName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    folderId: string;
    name: string;
  } | null>(null);
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [folderMenu, setFolderMenu] = useState<{
    workspaceId: string;
    folderId: string;
    folderName: string;
    x: number;
    y: number;
  } | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    folderId: string;
    name: string;
  } | null>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const lastRootDraftRequestKeyRef = useRef(rootDraftRequestKey);

  useEffect(() => {
    if (!draftTarget) {
      return;
    }
    draftInputRef.current?.focus();
  }, [draftTarget]);

  useEffect(() => {
    if (!renameTarget) {
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renameTarget]);

  useEffect(() => {
    if (
      rootDraftRequestKey === 0 ||
      rootDraftRequestKey === lastRootDraftRequestKeyRef.current
    ) {
      return;
    }
    lastRootDraftRequestKeyRef.current = rootDraftRequestKey;
    setDraftTarget({ parentId: null });
    setDraftName("");
  }, [rootDraftRequestKey]);

  const openFolderDraft = (event: MouseEvent, parentId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    closeDeleteConfirm();
    setDraftTarget({ parentId });
    setDraftName("");
  };

  const openFolderDraftFromKeyboard = (parentId: string | null) => {
    setDraftTarget({ parentId });
    setDraftName("");
  };

  const cancelFolderDraft = () => {
    if (isCreatingFolder) {
      return;
    }
    setDraftTarget(null);
    setDraftName("");
  };

  const submitFolderDraft = async () => {
    const trimmedName = draftName.trim();
    if (!draftTarget || !trimmedName || isCreatingFolder) {
      return;
    }
    setIsCreatingFolder(true);
    try {
      await onNewFolder(workspaceId, trimmedName, draftTarget.parentId);
      setDraftTarget(null);
      setDraftName("");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const openFolderRename = (event: MouseEvent, folderId: string, currentName: string) => {
    event.preventDefault();
    event.stopPropagation();
    setRenameTarget({ folderId, name: currentName });
  };

  const cancelFolderRename = () => {
    if (isRenamingFolder) {
      return;
    }
    setRenameTarget(null);
  };

  const submitFolderRename = async () => {
    const trimmedName = renameTarget?.name.trim();
    if (!renameTarget || !trimmedName || isRenamingFolder) {
      return;
    }
    setIsRenamingFolder(true);
    try {
      await onRenameFolder(workspaceId, renameTarget.folderId, trimmedName);
      setRenameTarget(null);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const closeFolderMenu = () => setFolderMenu(null);

  const openDeleteConfirm = (event: MouseEvent, folderId: string, name: string) => {
    event.preventDefault();
    event.stopPropagation();
    closeFolderMenu();
    setDeleteConfirmTarget({ folderId, name });
  };

  const closeDeleteConfirm = () => setDeleteConfirmTarget(null);

  const toggleFolderCollapsed = (folderId: string) => {
    onToggleFolderCollapsed(workspaceId, folderId);
  };

  const renderFolderDraft = (parentId: string | null) => {
    if (draftTarget?.parentId !== parentId) {
      return null;
    }
    return (
      <div className="workspace-session-folder-draft">
          <FolderPlus size={13} aria-hidden />
        <input
          ref={draftInputRef}
          className="workspace-session-folder-draft-input"
          value={draftName}
          disabled={isCreatingFolder}
          placeholder={t("sidebar.sessionFolderNamePrompt")}
          aria-label={t("sidebar.sessionFolderNamePrompt")}
          onChange={(event) => setDraftName(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={() => {
            if (!draftName.trim()) {
              cancelFolderDraft();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelFolderDraft();
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              void submitFolderDraft();
            }
          }}
        />
      </div>
    );
  };

  const renderFolder = (node: WorkspaceSessionFolderNode, depth: number) => {
    const sessionCount = countFolderSessions(node);
    const isCollapsed = collapsedFolderIds.has(node.folder.id);
    const hasChildrenOrRows = node.children.length > 0 || node.rows.length > 0;
    const handleFolderRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (!isCollapsed) {
          toggleFolderCollapsed(node.folder.id);
        }
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (isCollapsed) {
          toggleFolderCollapsed(node.folder.id);
        }
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      if (event.target instanceof HTMLButtonElement) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") {
        openFolderDraftFromKeyboard(node.folder.id);
        return;
      }
      toggleFolderCollapsed(node.folder.id);
    };
    const handleFolderContextMenu = (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setFolderMenu({
        workspaceId,
        folderId: node.folder.id,
        folderName: node.folder.name,
        x: event.clientX,
        y: event.clientY,
      });
    };
    const groupStyle = { "--workspace-session-folder-depth": depth } as CSSProperties;
    return (
      <div className="workspace-session-folder-group" key={node.folder.id}>
        <div
          className="workspace-session-folder-row"
          style={groupStyle}
          role="treeitem"
          tabIndex={0}
          aria-label={node.folder.name}
          aria-expanded={hasChildrenOrRows ? !isCollapsed : undefined}
          onClick={(event) => {
            const target = event.target;
            if (
              target instanceof Element &&
              target.closest("button,input,[role='menuitem']")
            ) {
              return;
            }
            if (hasChildrenOrRows) {
              toggleFolderCollapsed(node.folder.id);
            }
          }}
          onKeyDown={handleFolderRowKeyDown}
          onContextMenu={handleFolderContextMenu}
        >
          <button
            type="button"
            className={`workspace-session-folder-collapse${
              isCollapsed ? " is-collapsed" : ""
            }`}
            aria-label={
              isCollapsed
                ? t("sidebar.expandSessionFolder", { name: node.folder.name })
                : t("sidebar.collapseSessionFolder", { name: node.folder.name })
            }
            title={
              isCollapsed
                ? t("sidebar.expandSessionFolder", { name: node.folder.name })
                : t("sidebar.collapseSessionFolder", { name: node.folder.name })
            }
            disabled={!hasChildrenOrRows}
            onClick={(event) => {
              event.stopPropagation();
              toggleFolderCollapsed(node.folder.id);
            }}
          >
            <ChevronDown size={12} aria-hidden />
          </button>
          <Folder size={13} aria-hidden className="workspace-session-folder-icon" />
          {renameTarget?.folderId === node.folder.id ? (
            <input
              ref={renameInputRef}
              className="workspace-session-folder-rename-input"
              value={renameTarget.name}
              disabled={isRenamingFolder}
              aria-label={t("sidebar.sessionFolderRenamePrompt")}
              onChange={(event) =>
                setRenameTarget((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
              onClick={(event) => event.stopPropagation()}
              onBlur={() => {
                if (renameTarget?.name.trim()) {
                  void submitFolderRename();
                  return;
                }
                cancelFolderRename();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancelFolderRename();
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  void submitFolderRename();
                }
              }}
            />
          ) : (
            <span className="workspace-session-folder-name">{node.folder.name}</span>
          )}
          <span
            className="workspace-session-folder-count"
            aria-label={t("sidebar.sessionFolderCount", { count: sessionCount })}
          >
            {sessionCount}
          </span>
          <div className="workspace-session-folder-actions" aria-hidden={false}>
            <button
              type="button"
              className="workspace-session-folder-action"
              aria-label={t("sidebar.newSessionInFolder", { name: node.folder.name })}
              title={t("sidebar.newSessionInFolder", { name: node.folder.name })}
              onClick={(event) => onNewSessionInFolder(event, workspaceId, node.folder.id)}
            >
              <MessageSquarePlus size={12} aria-hidden />
            </button>
            <button
              type="button"
              className="workspace-session-folder-action"
              aria-label={t("sidebar.newSessionFolderIn", { name: node.folder.name })}
              title={t("sidebar.newSessionFolderIn", { name: node.folder.name })}
              onClick={(event) => openFolderDraft(event, node.folder.id)}
            >
              <FolderTree size={12} aria-hidden />
            </button>
            <button
              type="button"
              className="workspace-session-folder-action"
              aria-label={t("sidebar.renameSessionFolder", { name: node.folder.name })}
              title={t("sidebar.renameSessionFolder", { name: node.folder.name })}
              onClick={(event) => openFolderRename(event, node.folder.id, node.folder.name)}
            >
              <Pencil size={12} aria-hidden />
            </button>
            <Popover
              open={deleteConfirmTarget?.folderId === node.folder.id}
              onOpenChange={(open) => {
                if (!open) {
                  closeDeleteConfirm();
                }
              }}
            >
              <PopoverAnchor asChild>
                <button
                  type="button"
                  className="workspace-session-folder-action workspace-session-folder-action-danger"
                  aria-label={t("sidebar.deleteSessionFolder", { name: node.folder.name })}
                  title={t("sidebar.deleteSessionFolder", { name: node.folder.name })}
                  onClick={(event) => openDeleteConfirm(event, node.folder.id, node.folder.name)}
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </PopoverAnchor>
              {deleteConfirmTarget?.folderId === node.folder.id ? (
                <PopoverContent
                  side="right"
                  align="start"
                  sideOffset={10}
                  className="thread-delete-popover-shell"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <ThreadDeleteConfirmBubble
                    threadName={deleteConfirmTarget.name}
                    title={t("sidebar.sessionFolderDeleteTitle")}
                    message={t("sidebar.sessionFolderDeleteMessage", {
                      name: deleteConfirmTarget.name,
                    })}
                    hint={t("sidebar.sessionFolderDeleteHint")}
                    confirmLabel={t("common.delete")}
                    onCancel={closeDeleteConfirm}
                    onConfirm={() => {
                      closeDeleteConfirm();
                      onDeleteFolder(
                        workspaceId,
                        node.folder.id,
                        deleteConfirmTarget.name,
                      );
                    }}
                  />
                </PopoverContent>
              ) : null}
            </Popover>
          </div>
        </div>
        {!isCollapsed ? (
          <div
            className="workspace-session-folder-children"
            style={groupStyle}
          >
            {renderFolderDraft(node.folder.id)}
            {node.children.map((child) => renderFolder(child, depth + 1))}
            {node.rows.length > 0 ? (
              <ThreadList
                {...threadListProps}
                onShowThreadMenu={(event, rowWorkspaceId, threadId, canPin, sizeBytes) =>
                  threadListProps.onShowThreadMenu(
                    event,
                    rowWorkspaceId,
                    threadId,
                    canPin,
                    sizeBytes,
                    moveFolderTargets,
                    node.folder.id,
                  )
                }
                workspaceId={workspaceId}
                pinnedRows={[]}
                unpinnedRows={node.rows}
                totalThreadRoots={node.rows.length}
                isExpanded
                nextCursor={null}
                isPaging={false}
                nested
                showLoadOlder={false}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="workspace-session-folder-tree"
      role="tree"
    >
      {renderFolderDraft(null)}
      {folders.map((folder) => renderFolder(folder, 0))}
      {rootRows.length > 0 ? (
        <ThreadList
          {...threadListProps}
          onShowThreadMenu={(event, rowWorkspaceId, threadId, canPin, sizeBytes) =>
            threadListProps.onShowThreadMenu(
              event,
              rowWorkspaceId,
              threadId,
              canPin,
              sizeBytes,
              moveFolderTargets,
              null,
            )
          }
          workspaceId={workspaceId}
          pinnedRows={[]}
          unpinnedRows={rootRows}
          totalThreadRoots={totalThreadRoots}
          isExpanded={isExpanded}
          nextCursor={threadListProps.nextCursor}
          isPaging={threadListProps.isPaging}
          showLoadOlder={threadListProps.showLoadOlder}
        />
      ) : null}
      {rootRows.length === 0 && threadListProps.nextCursor ? (
        <ThreadList
          {...threadListProps}
          workspaceId={workspaceId}
          pinnedRows={[]}
          unpinnedRows={[]}
          totalThreadRoots={totalThreadRoots}
          isExpanded={isExpanded}
          nextCursor={threadListProps.nextCursor}
          isPaging={threadListProps.isPaging}
          showLoadOlder={threadListProps.showLoadOlder}
        />
      ) : null}
      {folderMenu ? (
        <div
          className="sidebar-workspace-menu-backdrop workspace-session-folder-menu-backdrop"
          onClick={closeFolderMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            closeFolderMenu();
          }}
        >
          <div
            className="sidebar-workspace-menu workspace-session-folder-menu"
            role="menu"
            aria-label={t("sidebar.sessionFolderActions", {
              name: folderMenu.folderName,
            })}
            style={{
              left: folderMenu.x,
              top: folderMenu.y,
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="sidebar-workspace-menu-group">
              <div className="sidebar-workspace-menu-group-title">
                {folderMenu.folderName}
              </div>
              <div className="sidebar-workspace-menu-item-row">
                <button
                  type="button"
                  role="menuitem"
                  className="sidebar-workspace-menu-item"
                  onClick={(event) => {
                    const menuFolderId = folderMenu.folderId;
                    closeFolderMenu();
                    onNewSessionInFolder(event, folderMenu.workspaceId, menuFolderId);
                  }}
                >
                  <span className="sidebar-workspace-menu-item-icon" aria-hidden>
                    <MessageSquarePlus size={14} />
                  </span>
                  <span className="sidebar-workspace-menu-item-label">
                    {t("sidebar.newSessionInFolder", { name: folderMenu.folderName })}
                  </span>
                </button>
              </div>
              <div className="sidebar-workspace-menu-item-row">
                <button
                  type="button"
                  role="menuitem"
                  className="sidebar-workspace-menu-item"
                  onClick={(event) => {
                    closeFolderMenu();
                    openFolderRename(event, folderMenu.folderId, folderMenu.folderName);
                  }}
                >
                  <span className="sidebar-workspace-menu-item-icon" aria-hidden>
                    <Pencil size={14} />
                  </span>
                  <span className="sidebar-workspace-menu-item-label">
                    {t("sidebar.renameSessionFolder", { name: folderMenu.folderName })}
                  </span>
                </button>
              </div>
              <div className="sidebar-workspace-menu-item-row">
                <button
                  type="button"
                  role="menuitem"
                  className="sidebar-workspace-menu-item"
                  onClick={(event) => {
                    const menuFolderId = folderMenu.folderId;
                    closeFolderMenu();
                    openFolderDraft(event, menuFolderId);
                  }}
                >
                  <span className="sidebar-workspace-menu-item-icon" aria-hidden>
                    <FolderPlus size={14} />
                  </span>
                  <span className="sidebar-workspace-menu-item-label">
                    {t("sidebar.newSessionFolderIn", { name: folderMenu.folderName })}
                  </span>
                </button>
              </div>
              <div className="sidebar-workspace-menu-divider" aria-hidden />
              <div className="sidebar-workspace-menu-item-row">
                <button
                  type="button"
                  role="menuitem"
                  className="sidebar-workspace-menu-item is-danger"
                  onClick={(event) => {
                    openDeleteConfirm(event, folderMenu.folderId, folderMenu.folderName);
                  }}
                >
                  <span className="sidebar-workspace-menu-item-icon" aria-hidden>
                    <Trash2 size={14} />
                  </span>
                  <span className="sidebar-workspace-menu-item-label">
                    {t("sidebar.deleteSessionFolder", { name: folderMenu.folderName })}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
