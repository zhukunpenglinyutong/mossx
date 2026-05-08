import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { EngineType, WorkspaceInfo } from "../../../types";
import { getOpenCodeProviderHealth } from "../../../services/tauri";
import { pushGlobalRuntimeNotice } from "../../../services/globalRuntimeNotices";
import { formatByteSize } from "../../../utils/formatting";
import type {
  EngineDisplayInfo,
  EngineRefreshResult,
} from "../../engine/hooks/useEngineController";

export type WorkspaceMenuIconKind =
  | "engine-claude"
  | "engine-codex"
  | "engine-opencode"
  | "engine-gemini"
  | "new-shared"
  | "alias"
  | "reload"
  | "remove"
  | "new-worktree"
  | "new-clone";

export type WorkspaceMenuAction = {
  id: string;
  label: string;
  iconKind: WorkspaceMenuIconKind;
  tone?: "default" | "danger";
  deprecated?: boolean;
  unavailable?: boolean;
  statusLabel?: string | null;
  refreshable?: boolean;
  refreshing?: boolean;
  onSelect: () => void;
  onRefresh?: () => Promise<void> | void;
};

export type WorkspaceMenuGroup = {
  id: string;
  label: string;
  actions: WorkspaceMenuAction[];
};

export type WorkspaceMenuState = {
  x: number;
  y: number;
  workspaceId: string;
  groups: WorkspaceMenuGroup[];
  workspace?: WorkspaceInfo;
  targetFolderId?: string | null;
};

type SidebarMenuHandlers = {
  onAddAgent: (
    workspace: WorkspaceInfo,
    engine?: EngineType,
    options?: { folderId?: string | null },
  ) => Promise<string | null> | string | null | void;
  engineOptions?: EngineDisplayInfo[];
  enabledEngines?: Partial<Record<EngineType, boolean>>;
  onRefreshEngineOptions?: () =>
    | Promise<EngineRefreshResult | void>
    | EngineRefreshResult
    | void;
  onAddSharedAgent?: (workspace: WorkspaceInfo) => Promise<string | null> | string | null | void;
  onAssignNewSessionToFolder?: (
    workspaceId: string,
    threadId: string,
    folderId: string,
  ) => Promise<void> | void;
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onSyncThread: (workspaceId: string, threadId: string) => void;
  onPinThread: (workspaceId: string, threadId: string) => void;
  onUnpinThread: (workspaceId: string, threadId: string) => void;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  isThreadAutoNaming: (workspaceId: string, threadId: string) => boolean;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onAutoNameThread: (workspaceId: string, threadId: string) => void;
  onMoveThreadToFolder?: (
    workspaceId: string,
    threadId: string,
    folderId: string | null,
  ) => void;
  onOpenThreadFolderPicker?: (
    workspaceId: string,
    threadId: string,
    targets: ThreadMoveFolderTarget[],
    currentFolderId: string | null,
  ) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
  onRenameWorkspaceAlias: (workspace: WorkspaceInfo) => void;
  onAddWorktreeAgent: (workspace: WorkspaceInfo) => void;
  onAddCloneAgent: (workspace: WorkspaceInfo) => void;
};

export type ThreadMoveFolderTarget = {
  folderId: string | null;
  label: string;
};

const INLINE_MOVE_FOLDER_TARGET_LIMIT = 12;

function resolveEngineDisplayName(engineType: EngineType): string {
  switch (engineType) {
    case "codex":
      return "Codex CLI";
    case "gemini":
      return "Gemini CLI";
    case "opencode":
      return "OpenCode";
    case "claude":
    default:
      return "Claude Code";
  }
}

export function useSidebarMenus({
  onAddAgent,
  engineOptions = [],
  enabledEngines,
  onRefreshEngineOptions,
  onAddSharedAgent,
  onAssignNewSessionToFolder,
  onDeleteThread,
  onSyncThread,
  onPinThread,
  onUnpinThread,
  isThreadPinned,
  isThreadAutoNaming,
  onRenameThread,
  onAutoNameThread,
  onMoveThreadToFolder,
  onOpenThreadFolderPicker,
  onReloadWorkspaceThreads,
  onDeleteWorkspace,
  onDeleteWorktree,
  onRenameWorkspaceAlias,
  onAddWorktreeAgent,
  onAddCloneAgent,
}: SidebarMenuHandlers) {
  const { t } = useTranslation();
  const [workspaceMenuState, setWorkspaceMenuState] =
    useState<WorkspaceMenuState | null>(null);
  const [workspaceOpenCodeLoginState, setWorkspaceOpenCodeLoginState] = useState<
    Record<string, "loading" | "ready" | "requires-login">
  >({});
  const [workspaceEngineOverrides, setWorkspaceEngineOverrides] = useState<
    Record<string, EngineDisplayInfo>
  >({});
  const [workspaceEngineRefreshing, setWorkspaceEngineRefreshing] = useState<
    Record<string, boolean>
  >({});
  const workspaceOpenCodeLoginRequestIdRef = useRef<Record<string, number>>({});
  const workspaceEngineRefreshRequestIdRef = useRef<Record<string, number>>({});
  const latestEngineOptionsRef = useRef(engineOptions);

  useEffect(() => {
    latestEngineOptionsRef.current = engineOptions;
  }, [engineOptions]);

  const isMatchingEngineInfo = useCallback(
    (left: EngineDisplayInfo, right: EngineDisplayInfo) =>
      left.type === right.type &&
      left.displayName === right.displayName &&
      left.shortName === right.shortName &&
      left.installed === right.installed &&
      left.version === right.version &&
      left.error === right.error &&
      left.availabilityState === right.availabilityState &&
      (left.availabilityLabelKey ?? null) === (right.availabilityLabelKey ?? null),
    [],
  );

  const closeWorkspaceMenu = useCallback(() => {
    setWorkspaceMenuState(null);
    setWorkspaceEngineOverrides({});
    setWorkspaceEngineRefreshing({});
  }, []);

  useEffect(() => {
    if (Object.keys(workspaceEngineOverrides).length === 0) {
      return;
    }
    setWorkspaceEngineOverrides((prev) => {
      let changed = false;
      const next = { ...prev };

      Object.entries(prev).forEach(([workspaceEngineKey, override]) => {
        if (override.availabilityState === "loading") {
          return;
        }
        const engineType = workspaceEngineKey.slice(
          workspaceEngineKey.lastIndexOf(":") + 1,
        ) as EngineType;
        const engineInfo =
          engineOptions.find((entry) => entry.type === engineType) ?? null;
        if (engineInfo && isMatchingEngineInfo(override, engineInfo)) {
          delete next[workspaceEngineKey];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [engineOptions, isMatchingEngineInfo, workspaceEngineOverrides]);

  const onWorkspaceMenuAction = useCallback(
    (action: WorkspaceMenuAction) => {
      if (action.unavailable) {
        return;
      }
      closeWorkspaceMenu();
      action.onSelect();
    },
    [closeWorkspaceMenu],
  );

  const canResolveWorkspaceOpenCodeLoginState = useCallback(
    (workspace: WorkspaceInfo) => {
      const openCodeInfo = engineOptions.find((entry) => entry.type === "opencode") ?? null;
      return Boolean(
        workspace.connected && openCodeInfo?.availabilityState === "ready",
      );
    },
    [engineOptions],
  );

  const primeWorkspaceOpenCodeLoginState = useCallback(
    async (
      workspace: WorkspaceInfo,
      options?: {
        force?: boolean;
        bypassAvailabilityCheck?: boolean;
      },
    ) => {
      const force = options?.force ?? false;
      const bypassAvailabilityCheck =
        options?.bypassAvailabilityCheck ?? false;
      if (
        !bypassAvailabilityCheck &&
        !canResolveWorkspaceOpenCodeLoginState(workspace)
      ) {
        return;
      }
      const previousState = workspaceOpenCodeLoginState[workspace.id];
      if (!force && previousState) {
        return;
      }
      const requestId =
        (workspaceOpenCodeLoginRequestIdRef.current[workspace.id] ?? 0) + 1;
      workspaceOpenCodeLoginRequestIdRef.current[workspace.id] = requestId;
      setWorkspaceOpenCodeLoginState((prev) => ({
        ...prev,
        [workspace.id]: "loading",
      }));
      try {
        const providerHealth = await getOpenCodeProviderHealth(workspace.id, null);
        if (workspaceOpenCodeLoginRequestIdRef.current[workspace.id] !== requestId) {
          return;
        }
        setWorkspaceOpenCodeLoginState((prev) => ({
          ...prev,
          [workspace.id]: providerHealth.connected ? "ready" : "requires-login",
        }));
      } catch {
        if (workspaceOpenCodeLoginRequestIdRef.current[workspace.id] !== requestId) {
          return;
        }
        setWorkspaceOpenCodeLoginState((prev) => {
          const next = { ...prev };
          if (previousState) {
            next[workspace.id] = previousState;
          } else {
            delete next[workspace.id];
          }
          return next;
        });
      }
    },
    [
      canResolveWorkspaceOpenCodeLoginState,
      workspaceOpenCodeLoginState,
    ],
  );

  const getWorkspaceEngineKey = useCallback(
    (workspaceId: string, engineType: EngineType) => `${workspaceId}:${engineType}`,
    [],
  );

  const refreshSingleEngineState = useCallback(
    async (workspace: WorkspaceInfo, engineType: EngineType) => {
      const workspaceEngineKey = getWorkspaceEngineKey(workspace.id, engineType);
      const requestId =
        (workspaceEngineRefreshRequestIdRef.current[workspaceEngineKey] ?? 0) + 1;
      workspaceEngineRefreshRequestIdRef.current[workspaceEngineKey] = requestId;

      const fallbackEngineInfo =
        workspaceEngineOverrides[workspaceEngineKey] ??
        engineOptions.find((entry) => entry.type === engineType) ??
        null;

      setWorkspaceEngineRefreshing((prev) => ({
        ...prev,
        [workspaceEngineKey]: true,
      }));
      setWorkspaceEngineOverrides((prev) => ({
        ...prev,
        [workspaceEngineKey]: {
          type: engineType,
          displayName: fallbackEngineInfo?.displayName ?? engineType,
          shortName: fallbackEngineInfo?.shortName ?? engineType,
          installed: false,
          version: null,
          error: null,
          availabilityState: "loading",
          availabilityLabelKey: "workspace.engineStatusLoading",
        },
      }));
      pushGlobalRuntimeNotice({
        severity: "info",
        category: "diagnostic",
        messageKey: "runtimeNotice.engine.checking",
        messageParams: {
          engine:
            fallbackEngineInfo?.displayName ??
            resolveEngineDisplayName(engineType),
        },
        dedupeKey: `engine:${engineType}:checking`,
      });

      let resolvedOverride: EngineDisplayInfo | null = null;
      try {
        const refreshResult = await onRefreshEngineOptions?.();
        resolvedOverride =
          refreshResult?.availableEngines.find((entry) => entry.type === engineType) ??
          latestEngineOptionsRef.current.find((entry) => entry.type === engineType) ??
          null;
        if (engineType === "opencode" && workspace.connected) {
          await primeWorkspaceOpenCodeLoginState(workspace, {
            force: true,
            bypassAvailabilityCheck: true,
          });
        }
      } finally {
        if (workspaceEngineRefreshRequestIdRef.current[workspaceEngineKey] === requestId) {
          setWorkspaceEngineRefreshing((prev) => ({
            ...prev,
            [workspaceEngineKey]: false,
          }));
          setWorkspaceEngineOverrides((prev) => {
            if (resolvedOverride) {
              return {
                ...prev,
                [workspaceEngineKey]: resolvedOverride,
              };
            }
            const next = { ...prev };
            delete next[workspaceEngineKey];
            return next;
          });
        }
      }
    },
    [
      engineOptions,
      getWorkspaceEngineKey,
      onRefreshEngineOptions,
      primeWorkspaceOpenCodeLoginState,
      workspaceEngineOverrides,
    ],
  );

  const resolveEngineActionMeta = useCallback(
    (workspace: WorkspaceInfo, engineType: EngineType) => {
      const workspaceEngineKey = getWorkspaceEngineKey(workspace.id, engineType);
      const engineInfo =
        workspaceEngineOverrides[workspaceEngineKey] ??
        engineOptions.find((entry) => entry.type === engineType) ??
        null;
      const refreshing = workspaceEngineRefreshing[workspaceEngineKey] === true;
      const commonMeta = {
        refreshable: true,
        refreshing,
        onRefresh: () => refreshSingleEngineState(workspace, engineType),
      };
      if (!engineInfo) {
        return {
          unavailable: true,
          statusLabel: t("sidebar.cliNotInstalled"),
          ...commonMeta,
        };
      }

      if (engineInfo.availabilityState === "loading") {
        return {
          unavailable: true,
          statusLabel: t("workspace.engineStatusLoading"),
          ...commonMeta,
        };
      }

      if (engineInfo.availabilityState === "requires-login") {
        return {
          unavailable: true,
          statusLabel: t("workspace.engineStatusRequiresLogin"),
          ...commonMeta,
        };
      }

      if (engineInfo.availabilityState === "unavailable") {
        return {
          unavailable: true,
          statusLabel: t("sidebar.cliNotInstalled"),
          ...commonMeta,
        };
      }

      if (engineType === "opencode" && workspace.connected) {
        const workspaceScopedState = workspaceOpenCodeLoginState[workspace.id];
        if (workspaceScopedState === "loading") {
          return {
            unavailable: true,
            statusLabel: t("workspace.engineStatusLoading"),
            ...commonMeta,
          };
        }
        if (workspaceScopedState === "requires-login") {
          return {
            unavailable: true,
            statusLabel: t("workspace.engineStatusRequiresLogin"),
            ...commonMeta,
          };
        }
      }

      return {
        unavailable: false,
        statusLabel: null,
        ...commonMeta,
      };
    },
    [
      engineOptions,
      getWorkspaceEngineKey,
      refreshSingleEngineState,
      t,
      workspaceEngineOverrides,
      workspaceEngineRefreshing,
      workspaceOpenCodeLoginState,
    ],
  );

  const isEngineSessionEntryVisible = useCallback(
    (engineType: EngineType) => {
      switch (engineType) {
        case "gemini":
        case "opencode":
          return enabledEngines?.[engineType] !== false;
        case "claude":
        case "codex":
        default:
          return true;
      }
    },
    [enabledEngines],
  );

  const buildSessionMenuGroup = useCallback(
    (
      workspace: WorkspaceInfo,
      options?: { targetFolderId?: string | null },
    ): WorkspaceMenuGroup => {
      const targetFolderId = options?.targetFolderId?.trim() || null;
      const handleCreatedSession = async (threadId: string | null | void) => {
        if (!targetFolderId || !threadId) {
          return;
        }
        await onAssignNewSessionToFolder?.(workspace.id, threadId, targetFolderId);
      };
      const runAddAgent = (engine: EngineType) => {
        if (targetFolderId) {
          return onAddAgent(workspace, engine, { folderId: targetFolderId });
        }
        return onAddAgent(workspace, engine);
      };
      const actions = [
        {
          id: "new-session-shared",
          label: t("sidebar.newSharedSession"),
          iconKind: "new-shared",
          unavailable: !onAddSharedAgent,
          onSelect: async () => {
            const threadId = await onAddSharedAgent?.(workspace);
            await handleCreatedSession(threadId);
          },
        },
        {
          id: "new-session-claude",
          label: t("workspace.engineClaudeCode"),
          iconKind: "engine-claude",
          ...resolveEngineActionMeta(workspace, "claude"),
          onSelect: async () => {
            const threadId = await runAddAgent("claude");
            await handleCreatedSession(threadId);
          },
        },
        {
          id: "new-session-codex",
          label: t("workspace.engineCodex"),
          iconKind: "engine-codex",
          ...resolveEngineActionMeta(workspace, "codex"),
          onSelect: async () => {
            const threadId = await runAddAgent("codex");
            await handleCreatedSession(threadId);
          },
        },
        {
          id: "new-session-opencode",
          label: t("workspace.engineOpenCode"),
          iconKind: "engine-opencode",
          ...resolveEngineActionMeta(workspace, "opencode"),
          onSelect: async () => {
            const threadId = await runAddAgent("opencode");
            await handleCreatedSession(threadId);
          },
        },
        {
          id: "new-session-gemini",
          label: t("workspace.engineGemini"),
          iconKind: "engine-gemini",
          ...resolveEngineActionMeta(workspace, "gemini"),
          onSelect: async () => {
            const threadId = await runAddAgent("gemini");
            await handleCreatedSession(threadId);
          },
        },
      ] satisfies WorkspaceMenuAction[];

      const visibleActions = actions.filter((action) => {
        if (action.id === "new-session-opencode") {
          return isEngineSessionEntryVisible("opencode");
        }
        if (action.id === "new-session-gemini") {
          return isEngineSessionEntryVisible("gemini");
        }
        return true;
      });

      return {
        id: "new-session",
        label: t("sidebar.sessionActionsGroup"),
        actions: visibleActions,
      };
    },
    [
      t,
      onAddAgent,
      onAddSharedAgent,
      onAssignNewSessionToFolder,
      resolveEngineActionMeta,
      isEngineSessionEntryVisible,
    ],
  );

  useEffect(() => {
    if (!workspaceMenuState?.workspace) {
      return;
    }
    setWorkspaceMenuState((prev) => {
      if (!prev?.workspace) {
        return prev;
      }
      const sessionGroup = buildSessionMenuGroup(prev.workspace, {
        targetFolderId: prev.targetFolderId,
      });
      const nextGroups = prev.groups.map((group) =>
        group.id === "new-session" ? sessionGroup : group
      );
      const prevSignature = JSON.stringify(
        prev.groups.find((group) => group.id === "new-session")?.actions.map((action) => ({
          id: action.id,
          unavailable: action.unavailable,
          statusLabel: action.statusLabel ?? null,
          refreshing: action.refreshing ?? false,
        })) ?? [],
      );
      const nextSignature = JSON.stringify(
        sessionGroup.actions.map((action) => ({
          id: action.id,
          unavailable: action.unavailable,
          statusLabel: action.statusLabel ?? null,
          refreshing: action.refreshing ?? false,
        })),
      );
      if (prevSignature === nextSignature) {
        return prev;
      }
      return {
        ...prev,
        groups: nextGroups,
      };
    });
  }, [
    buildSessionMenuGroup,
    workspaceMenuState?.workspace,
    workspaceOpenCodeLoginState,
  ]);

  const resolveWorkspaceMenuPosition = useCallback((event: MouseEvent) => {
    const menuWidthEstimate = 328;
    const menuHeightEstimate = 420;
    const viewportPadding = 12;
    const maxX = Math.max(
      viewportPadding,
      window.innerWidth - menuWidthEstimate - viewportPadding,
    );
    const maxY = Math.max(
      viewportPadding,
      window.innerHeight - menuHeightEstimate - viewportPadding,
    );

    return {
      x: Math.min(Math.max(event.clientX, viewportPadding), maxX),
      y: Math.min(Math.max(event.clientY, viewportPadding), maxY),
    };
  }, []);

  const showThreadMenu = useCallback(
    async (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
      sizeBytes?: number,
      moveFolderTargets: ThreadMoveFolderTarget[] = [],
      currentFolderId: string | null = null,
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
      if (onMoveThreadToFolder && moveFolderTargets.length > 0) {
        items.push(
          await MenuItem.new({
            text: t("threads.moveToFolder"),
            enabled: false,
          }),
        );
        if (moveFolderTargets.length > INLINE_MOVE_FOLDER_TARGET_LIMIT && onOpenThreadFolderPicker) {
          items.push(
            await MenuItem.new({
              text: t("threads.searchFolderTargets"),
              action: () =>
                onOpenThreadFolderPicker(
                  workspaceId,
                  threadId,
                  moveFolderTargets,
                  currentFolderId,
                ),
            }),
          );
        } else {
          for (const target of moveFolderTargets) {
            const isCurrentTarget = (target.folderId ?? null) === (currentFolderId ?? null);
            items.push(
              await MenuItem.new({
                text: target.label,
                enabled: !isCurrentTarget,
                action: () => onMoveThreadToFolder(workspaceId, threadId, target.folderId),
              }),
            );
          }
        }
      }
      const sizeLabel = formatByteSize(sizeBytes);
      if (sizeLabel) {
        items.push(
          await MenuItem.new({
            text: `${t("threads.size")}: ${sizeLabel}`,
            enabled: false,
          }),
        );
      }
      const deleteItem = await MenuItem.new({
        text: t("threads.delete"),
        action: () => onDeleteThread(workspaceId, threadId),
      });
      items.push(deleteItem);
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
      onMoveThreadToFolder,
      onOpenThreadFolderPicker,
      onRenameThread,
      onSyncThread,
      onUnpinThread,
    ],
  );

  const showWorkspaceMenu = useCallback(
    (event: MouseEvent, workspace: WorkspaceInfo) => {
      event.preventDefault();
      event.stopPropagation();
      const workspaceId = workspace.id;
      const { x, y } = resolveWorkspaceMenuPosition(event);

      const groups: WorkspaceMenuGroup[] = [
        buildSessionMenuGroup(workspace),
        {
          id: "workspace-actions",
          label: t("sidebar.workspaceActionsGroup"),
          actions: [
            {
              id: "reload-threads",
              label: t("threads.reloadThreads"),
              iconKind: "reload",
              onSelect: () => onReloadWorkspaceThreads(workspaceId),
            },
            {
              id: "rename-workspace-alias",
              label: t("sidebar.setWorkspaceAlias"),
              iconKind: "alias",
              onSelect: () => onRenameWorkspaceAlias(workspace),
            },
            {
              id: "remove-workspace",
              label: t("sidebar.removeWorkspace"),
              iconKind: "remove",
              tone: "danger",
              onSelect: () => onDeleteWorkspace(workspaceId),
            },
            {
              id: "new-worktree-agent",
              label: t("sidebar.newWorktreeAgent"),
              iconKind: "new-worktree",
              onSelect: () => onAddWorktreeAgent(workspace),
            },
            {
              id: "new-clone-agent",
              label: t("sidebar.newCloneAgent"),
              iconKind: "new-clone",
              deprecated: true,
              onSelect: () => onAddCloneAgent(workspace),
            },
          ],
        },
      ];

      setWorkspaceMenuState({
        x,
        y,
        workspaceId,
        groups,
        workspace,
      });
    },
    [
      t,
      buildSessionMenuGroup,
      resolveWorkspaceMenuPosition,
      onReloadWorkspaceThreads,
      onDeleteWorkspace,
      onRenameWorkspaceAlias,
      onAddWorktreeAgent,
      onAddCloneAgent,
    ],
  );

  const showWorkspaceSessionMenu = useCallback(
    (
      event: MouseEvent,
      workspace: WorkspaceInfo,
      options?: { targetFolderId?: string | null },
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const { x, y } = resolveWorkspaceMenuPosition(event);

      setWorkspaceMenuState({
        x,
        y,
        workspaceId: workspace.id,
        groups: [buildSessionMenuGroup(workspace, options)],
        workspace,
        targetFolderId: options?.targetFolderId?.trim() || null,
      });
    },
    [buildSessionMenuGroup, resolveWorkspaceMenuPosition],
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

  return {
    showThreadMenu,
    showWorkspaceMenu,
    showWorkspaceSessionMenu,
    showWorktreeMenu,
    workspaceMenuState,
    closeWorkspaceMenu,
    onWorkspaceMenuAction,
  };
}
