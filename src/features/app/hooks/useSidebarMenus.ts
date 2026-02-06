import { useCallback, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { WorkspaceInfo } from "../../../types";

type SidebarMenuHandlers = {
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  onPinThread: (workspaceId: string, threadId: string) => void;
  onUnpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  isThreadAutoNaming: (workspaceId: string, threadId: string) => boolean;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onAutoNameThread: (workspaceId: string, threadId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onAddCloneAgent: (workspace: WorkspaceInfo) => void;
};

export function useSidebarMenus({
  onDeleteThread,
  onSyncThread,
  onPinThread,
  onUnpinThread,
  isThreadPinned,
  isThreadAutoNaming,
  onRenameThread,
  onAutoNameThread,
  onReloadWorkspaceThreads,
  onDeleteWorkspace,
  onDeleteWorktree,
  onAddWorktreeAgent,
  onAddCloneAgent,
}: SidebarMenuHandlers) {
  const { t } = useTranslation();

  const showThreadMenu = useCallback(
    async (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const isClaudeSession = threadId.startsWith("claude:");
      const renameItem = await MenuItem.new({
        text: t("threads.rename"),
        action: () => onRenameThread(workspaceId, threadId),
      });
      const isAutoNamingNow = isThreadAutoNaming(workspaceId, threadId);
      const autoNameItem = await MenuItem.new({
        text: isAutoNamingNow
          ? t("threads.autoNaming")
          : t("threads.autoName"),
        action: () => {
          if (isAutoNamingNow) {
            return;
          }
          onAutoNameThread(workspaceId, threadId);
        },
      });
      const copyItem = await MenuItem.new({
        text: t("threads.copyId"),
        action: async () => {
          try {
            const copyId = isClaudeSession
              ? threadId.slice("claude:".length)
              : threadId;
            await navigator.clipboard.writeText(copyId);
          } catch {
            // Clipboard failures are non-fatal here.
          }
        },
      });
      const items = [renameItem, autoNameItem];
      // Sync and archive are Codex-specific — skip for Claude sessions
      if (!isClaudeSession) {
        const syncItem = await MenuItem.new({
          text: t("threads.syncFromServer"),
          action: () => onSyncThread(workspaceId, threadId),
        });
        items.push(syncItem);
      }
      if (canPin) {
        const isPinned = isThreadPinned(workspaceId, threadId);
        items.push(
          await MenuItem.new({
            text: isPinned ? t("threads.unpin") : t("threads.pin"),
            action: () => {
              if (isPinned) {
                onUnpinThread(workspaceId, threadId);
              } else {
                onPinThread(workspaceId, threadId);
              }
            },
          }),
        );
      }
      items.push(copyItem);
      const archiveItem = await MenuItem.new({
        text: t("threads.archive"),
        action: () => onDeleteThread(workspaceId, threadId),
      });
      items.push(archiveItem);
      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [
      t,
      isThreadPinned,
      isThreadAutoNaming,
      onDeleteThread,
      onPinThread,
      onAutoNameThread,
      onRenameThread,
      onSyncThread,
      onUnpinThread,
    ],
  );

  const showWorkspaceMenu = useCallback(
    async (event: MouseEvent, workspace: WorkspaceInfo) => {
      event.preventDefault();
      event.stopPropagation();
      const workspaceId = workspace.id;

      const newWorktreeItem = await MenuItem.new({
        text: t("sidebar.newWorktreeAgent"),
        action: () => onAddWorktreeAgent(workspace),
      });

      const newCloneItem = await MenuItem.new({
        text: t("sidebar.newCloneAgent"),
        action: () => onAddCloneAgent(workspace),
      });

      const reloadItem = await MenuItem.new({
        text: t("threads.reloadThreads"),
        action: () => onReloadWorkspaceThreads(workspaceId),
      });

      const deleteItem = await MenuItem.new({
        text: t("sidebar.removeWorkspace"),
        action: () => onDeleteWorkspace(workspaceId),
      });

      const menu = await Menu.new({
        items: [
          reloadItem,
          deleteItem,
          newWorktreeItem,
          newCloneItem,
        ],
      });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [
      t,
      onReloadWorkspaceThreads,
      onDeleteWorkspace,
      onAddWorktreeAgent,
      onAddCloneAgent,
    ],
  );

  const showWorktreeMenu = useCallback(
    async (event: MouseEvent, workspaceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const reloadItem = await MenuItem.new({
        text: t("threads.reloadThreads"),
        action: () => onReloadWorkspaceThreads(workspaceId),
      });
      const deleteItem = await MenuItem.new({
        text: t("threads.deleteWorktree"),
        action: () => onDeleteWorktree(workspaceId),
      });
      const menu = await Menu.new({ items: [reloadItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [t, onReloadWorkspaceThreads, onDeleteWorktree],
  );

  return { showThreadMenu, showWorkspaceMenu, showWorktreeMenu };
}
