import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { EngineType, WorkspaceInfo } from "../../../types";
import { getOpenCodeProviderHealth } from "../../../services/tauri";
import { pushGlobalRuntimeNotice } from "../../../services/globalRuntimeNotices";
import { formatByteSize } from "../../../utils/formatting";
import {
  clampRendererContextMenuPosition,
  type RendererContextMenuItem,
  type RendererContextMenuState,
} from "../../../components/ui/RendererContextMenu";
import {
  buildClaudeResumeCommand,
  extractClaudeNativeSessionId,
  type ClaudeResumeCommandPlatform,
} from "../utils/claudeResumeCommand";
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

export type SidebarContextMenuState = RendererContextMenuState & {
  source: "thread" | "worktree";
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
  onArchiveThread: (workspaceId: string, threadId: string) => void;
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
  onOpenClaudeTui?: (input: {
    workspaceId: string;
    workspacePath: string;
    sessionId: string;
  }) => void;
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
  onArchiveThread,
  onSyncThread,
  onPinThread,
  onUnpinThread,
  isThreadPinned,
  isThreadAutoNaming,
  onRenameThread,
  onAutoNameThread,
  onMoveThreadToFolder,
  onOpenThreadFolderPicker,
  onOpenClaudeTui,
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
  const [sidebarContextMenuState, setSidebarContextMenuState] =
    useState<SidebarContextMenuState | null>(null);
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

  const closeSidebarContextMenu = useCallback(() => {
    setSidebarContextMenuState(null);
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
    (
      event: MouseEvent,
      workspaceId: string,
      threadId: string,
      canPin: boolean,
      sizeBytes?: number,
      moveFolderTargets: ThreadMoveFolderTarget[] = [],
      currentFolderId: string | null = null,
      canArchive: boolean = true,
      workspacePath: string = "",
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const claudeSessionId = extractClaudeNativeSessionId(threadId);
      const isClaudeSession = Boolean(claudeSessionId);
      const claudeResumeCommand = claudeSessionId
        ? buildClaudeResumeCommand({
            workspacePath,
            sessionId: claudeSessionId,
            platform: navigator.userAgent.includes("Windows")
              ? "windows"
              : ("posix" satisfies ClaudeResumeCommandPlatform),
          })
        : null;
      const items: RendererContextMenuItem[] = [
        {
          type: "item",
          id: "rename",
          label: t("threads.rename"),
          onSelect: () => onRenameThread(workspaceId, threadId),
        },
      ];
      const isAutoNamingNow = isThreadAutoNaming(workspaceId, threadId);
      items.push({
        type: "item",
        id: "auto-name",
        label: isAutoNamingNow ? t("threads.autoNaming") : t("threads.autoName"),
        onSelect: () => {
          if (isAutoNamingNow) {
            return;
          }
          onAutoNameThread(workspaceId, threadId);
        },
      });
      // Sync and archive are Codex-specific — skip for Claude sessions
      if (!isClaudeSession) {
        items.push({
          type: "item",
          id: "sync",
          label: t("threads.syncFromServer"),
          onSelect: () => onSyncThread(workspaceId, threadId),
        });
      }
      if (canPin) {
        const isPinned = isThreadPinned(workspaceId, threadId);
        items.push({
          type: "item",
          id: "pin",
          label: isPinned ? t("threads.unpin") : t("threads.pin"),
          onSelect: () => {
            if (isPinned) {
              onUnpinThread(workspaceId, threadId);
            } else {
              onPinThread(workspaceId, threadId);
            }
          },
        });
      }
      items.push({
        type: "item",
        id: "copy-id",
        label: t("threads.copyId"),
        onSelect: async () => {
          try {
            const copyId = claudeSessionId ?? threadId;
            await navigator.clipboard.writeText(copyId);
          } catch {
            // Clipboard failures are non-fatal here.
          }
        },
      });
      if (claudeSessionId && claudeResumeCommand) {
        if (onOpenClaudeTui) {
          items.push({
            type: "item",
            id: "open-claude-tui",
            label: t("threads.openClaudeTui"),
            onSelect: () =>
              onOpenClaudeTui({
                workspaceId,
                workspacePath,
                sessionId: claudeSessionId,
              }),
          });
        }
        items.push({
          type: "item",
          id: "copy-claude-resume-command",
          label: t("threads.copyClaudeResumeCommand"),
          onSelect: async () => {
            try {
              await navigator.clipboard.writeText(claudeResumeCommand);
              pushGlobalRuntimeNotice({
                severity: "info",
                category: "runtime",
                messageKey: "runtimeNotice.claude.resumeCommandCopied",
                messageParams: {
                  sessionId: claudeSessionId,
                },
                dedupeKey: `claude-resume-command-copied:${workspaceId}:${claudeSessionId}`,
              });
            } catch {
              // Clipboard failures are non-fatal here.
            }
          },
        });
        items.push({
          type: "label",
          id: "claude-resume-help",
          label: t("threads.claudeResumeCommandHelp"),
        });
      }
      if (canArchive) {
        items.push({
          type: "item",
          id: "archive",
          label: t("threads.archive"),
          onSelect: () => onArchiveThread(workspaceId, threadId),
        });
      }
      if (onMoveThreadToFolder && moveFolderTargets.length > 0) {
        items.push({
          type: "label",
          id: "move-to-folder-label",
          label: t("threads.moveToFolder"),
        });
        if (moveFolderTargets.length > INLINE_MOVE_FOLDER_TARGET_LIMIT && onOpenThreadFolderPicker) {
          items.push({
            type: "item",
            id: "search-folder-targets",
            label: t("threads.searchFolderTargets"),
            onSelect: () =>
              onOpenThreadFolderPicker(
                workspaceId,
                threadId,
                moveFolderTargets,
                currentFolderId,
              ),
          });
        } else {
          for (const target of moveFolderTargets) {
            const isCurrentTarget = (target.folderId ?? null) === (currentFolderId ?? null);
            items.push({
              type: "item",
              id: `move-folder-${target.folderId ?? "root"}`,
              label: target.label,
              disabled: isCurrentTarget,
              onSelect: () => onMoveThreadToFolder(workspaceId, threadId, target.folderId),
            });
          }
        }
      }
      const sizeLabel = formatByteSize(sizeBytes);
      if (sizeLabel) {
        items.push({
          type: "label",
          id: "size",
          label: `${t("threads.size")}: ${sizeLabel}`,
        });
      }
      items.push({
        type: "item",
        id: "delete",
        label: t("threads.delete"),
        tone: "danger",
        onSelect: () => onDeleteThread(workspaceId, threadId),
      });
      const position = clampRendererContextMenuPosition(event.clientX, event.clientY);
      setSidebarContextMenuState({
        ...position,
        label: t("threads.threadActions"),
        source: "thread",
        items,
      });
    },
    [
      t,
      isThreadPinned,
      isThreadAutoNaming,
      onArchiveThread,
      onDeleteThread,
      onOpenClaudeTui,
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
    (event: MouseEvent, workspaceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const position = clampRendererContextMenuPosition(event.clientX, event.clientY, {
        width: 240,
        height: 120,
      });
      setSidebarContextMenuState({
        ...position,
        label: t("sidebar.workspaceActionsGroup"),
        source: "worktree",
        items: [
          {
            type: "item",
            id: "reload",
            label: t("threads.reloadThreads"),
            onSelect: () => onReloadWorkspaceThreads(workspaceId),
          },
          {
            type: "item",
            id: "delete-worktree",
            label: t("threads.deleteWorktree"),
            tone: "danger",
            onSelect: () => onDeleteWorktree(workspaceId),
          },
        ],
      });
    },
    [t, onReloadWorkspaceThreads, onDeleteWorktree],
  );

  return {
    showThreadMenu,
    showWorkspaceMenu,
    showWorkspaceSessionMenu,
    showWorktreeMenu,
    workspaceMenuState,
    sidebarContextMenuState,
    closeWorkspaceMenu,
    closeSidebarContextMenu,
    onWorkspaceMenuAction,
  };
}
