import {
  useCallback,
  useEffect,
  useMemo,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { BranchContextAction } from "../components/GitHistoryPanelTypes";

export function useGitHistoryPanelBranchContextMenu(scope: any, handlers: any) {
  const {
    Download,
    FileText,
    FolderTree,
    GitBranch,
    GitMerge,
    Pencil,
    Plus,
    RefreshCw,
    Repeat,
    Trash2,
    Upload,
    branchContextMenu,
    branchContextMenuRef,
    clamp,
    clearOperationNotice,
    closeBranchContextMenu,
    createBranchSourceOptions,
    createOperationErrorState,
    currentBranch,
    fetchGit,
    getOperationDisplayName,
    operationLoading,
    refreshAll,
    runOperation,
    setOperationLoading,
    showOperationNotice,
    t,
    updateGitBranch,
    workspaceId,
  } = scope;
  const {
    handleCheckoutAndRebaseCurrent,
    handleCheckoutBranch,
    handleCompareWithCurrentBranch,
    handleCreateBranch,
    handleDeleteBranch,
    handleMergeBranch,
    handleOpenPushDialog,
    handleOpenRenameBranchDialog,
    handleRebaseCurrentOntoBranch,
    handleShowDiffWithWorktree,
  } = handlers;

  const branchContextTrackingSummary = useMemo(() => {
    if (!branchContextMenu) {
      return null;
    }
    const branchName = branchContextMenu.branch.name;
    const isRemote = branchContextMenu.source === "remote" || branchContextMenu.branch.isRemote;
    if (isRemote) {
      return `${branchName} -> ${branchName}`;
    }
    const upstreamName = branchContextMenu.branch.upstream?.trim();
    const trackingTarget = upstreamName && upstreamName.length > 0
      ? upstreamName
      : `(${t("git.historyBranchMenuNoUpstreamTracking")})`;
    return `${branchName} -> ${trackingTarget}`;
  }, [branchContextMenu, t]);

  const handleUpdateBranchFromContextMenu = useCallback(
    async (
      targetBranch: string,
      options: {
        isCurrent: boolean;
        isRemote: boolean;
        remoteName: string | null;
      },
    ) => {
      closeBranchContextMenu();
      if (options.isRemote && options.remoteName) {
        await runOperation("fetch", () => fetchGit(workspaceId, options.remoteName));
        return;
      }

      const operationName = "updateBranch";
      clearOperationNotice();
      setOperationLoading(operationName);
      try {
        const result = await updateGitBranch(workspaceId, targetBranch);
        await refreshAll();
        if (result.status === "blocked") {
          const message = result.reason === "diverged"
            ? t("git.historyBranchUpdateBlockedDiverged", { branch: targetBranch })
            : result.reason === "occupied_worktree"
              ? t("git.historyBranchUpdateBlockedOccupiedWorktree", {
                branch: targetBranch,
                path: result.worktreePath ?? "",
              })
              : result.reason === "stale_ref"
                ? t("git.historyBranchUpdateBlockedStaleRef", { branch: targetBranch })
                : t("git.historyBranchUpdateBlockedNoUpstream", { branch: targetBranch });
          showOperationNotice({
            kind: "error",
            message,
            debugMessage: result.message,
          });
          return;
        }

        const message = result.status === "no-op"
          ? result.reason === "ahead_only"
            ? t("git.historyBranchUpdateAheadOnly", { branch: targetBranch })
            : t("git.historyBranchUpdateAlreadyUpToDate", { branch: targetBranch })
          : t("git.historyBranchUpdateSuccess", { branch: targetBranch });
        showOperationNotice({
          kind: "success",
          message,
          debugMessage: result.message,
        });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const operationState = createOperationErrorState(rawMessage);
        showOperationNotice({
          kind: "error",
          message: `${t("git.historyOperationFailed", {
            operation: getOperationDisplayName(operationName),
          })} ${operationState.userMessage}${
            operationState.retryable ? ` ${t("git.historyOperationRetryHint")}` : ""
          }`,
          debugMessage: operationState.debugMessage,
        });
      } finally {
        setOperationLoading(null);
      }
    },
    [
      clearOperationNotice,
      closeBranchContextMenu,
      createOperationErrorState,
      fetchGit,
      getOperationDisplayName,
      refreshAll,
      runOperation,
      setOperationLoading,
      showOperationNotice,
      t,
      updateGitBranch,
      workspaceId,
    ],
  );

  const branchContextActions = useMemo<BranchContextAction[]>(() => {
    if (!workspaceId || !branchContextMenu) {
      return [];
    }
    const targetBranch = branchContextMenu.branch.name;
    const isCurrent = branchContextMenu.branch.isCurrent || currentBranch === targetBranch;
    const isRemote = branchContextMenu.source === "remote" || branchContextMenu.branch.isRemote;
    const baseDisabledReason = operationLoading ? t("git.historyBranchMenuUnavailableBusy") : null;
    const currentDisabledReason = t("git.historyBranchMenuUnavailableCurrent");
    const remoteDisabledReason = t("git.historyBranchMenuUnavailableRemote");
    const noCurrentBranchDisabledReason = t("git.historyBranchMenuUnavailableNoCurrent");
    const currentBranchName = currentBranch ?? t("git.unknown");
    const remoteName = branchContextMenu.branch.remote ?? null;
    const createDisabledReason = createBranchSourceOptions.length === 0
      ? baseDisabledReason
      : null;

    return [
      {
        id: "checkout",
        label: t("git.historyBranchMenuCheckout"),
        icon: <GitBranch size={14} aria-hidden />,
        disabled: Boolean(baseDisabledReason || isCurrent),
        disabledReason: baseDisabledReason || (isCurrent ? currentDisabledReason : null),
        onSelect: () => {
          closeBranchContextMenu();
          void handleCheckoutBranch(targetBranch);
        },
      },
      {
        id: "create-branch",
        label: t("git.historyBranchMenuCreateFromBranch", { branch: targetBranch }),
        icon: <Plus size={14} aria-hidden />,
        disabled: Boolean(baseDisabledReason || createDisabledReason),
        disabledReason: baseDisabledReason || createDisabledReason,
        onSelect: () => {
          closeBranchContextMenu();
          handleCreateBranch(targetBranch);
        },
      },
      {
        id: "checkout-rebase",
        label: t("git.historyBranchMenuCheckoutAndRebaseCurrent", { current: currentBranchName }),
        icon: <Repeat size={14} aria-hidden />,
        disabled: Boolean(baseDisabledReason || isCurrent || isRemote || !currentBranch),
        disabledReason:
          baseDisabledReason ||
          (isCurrent
            ? currentDisabledReason
            : isRemote
              ? remoteDisabledReason
              : !currentBranch
                ? noCurrentBranchDisabledReason
                : null),
        onSelect: () => {
          closeBranchContextMenu();
          void handleCheckoutAndRebaseCurrent(targetBranch);
        },
      },
      {
        id: "compare-current",
        label: t("git.historyBranchMenuCompareWithCurrent", { current: currentBranchName }),
        icon: <FileText size={14} aria-hidden />,
        dividerBefore: true,
        disabled: Boolean(baseDisabledReason || isCurrent),
        disabledReason: baseDisabledReason || (isCurrent ? currentDisabledReason : null),
        onSelect: () => {
          void handleCompareWithCurrentBranch(targetBranch);
        },
      },
      {
        id: "diff-worktree",
        label: t("git.historyBranchMenuShowDiffWithWorktree"),
        icon: <FolderTree size={14} aria-hidden />,
        disabled: Boolean(baseDisabledReason),
        disabledReason: baseDisabledReason,
        onSelect: () => {
          void handleShowDiffWithWorktree(targetBranch);
        },
      },
      {
        id: "rebase-current-onto",
        label: t("git.historyBranchMenuRebaseCurrentOnto", {
          current: currentBranchName,
          branch: targetBranch,
        }),
        icon: <RefreshCw size={14} aria-hidden />,
        dividerBefore: true,
        disabled: Boolean(baseDisabledReason || isCurrent || isRemote || !currentBranch),
        disabledReason:
          baseDisabledReason ||
          (isCurrent
            ? currentDisabledReason
            : isRemote
              ? remoteDisabledReason
              : !currentBranch
                ? noCurrentBranchDisabledReason
                : null),
        onSelect: () => {
          closeBranchContextMenu();
          void handleRebaseCurrentOntoBranch(targetBranch);
        },
      },
      {
        id: "merge-into-current",
        label: t("git.historyBranchMenuMergeIntoCurrent", {
          branch: targetBranch,
          current: currentBranchName,
        }),
        icon: <GitMerge size={14} aria-hidden />,
        disabled: Boolean(baseDisabledReason || isCurrent || isRemote),
        disabledReason:
          baseDisabledReason ||
          (isCurrent ? currentDisabledReason : isRemote ? remoteDisabledReason : null),
        onSelect: () => {
          closeBranchContextMenu();
          void handleMergeBranch(targetBranch);
        },
      },
      {
        id: "update",
        label: t("git.historyBranchMenuUpdate"),
        icon: <Download size={14} aria-hidden />,
        dividerBefore: true,
        disabled: Boolean(baseDisabledReason || (isRemote ? !remoteName : false)),
        disabledReason:
          baseDisabledReason ||
          (isRemote
            ? (!remoteName ? remoteDisabledReason : null)
            : null),
        onSelect: () => {
          void handleUpdateBranchFromContextMenu(targetBranch, {
            isCurrent,
            isRemote,
            remoteName,
          });
        },
      },
      {
        id: "push",
        label: t("git.historyBranchMenuPush"),
        icon: <Upload size={14} aria-hidden />,
        disabled: Boolean(baseDisabledReason || isRemote || !isCurrent),
        disabledReason:
          baseDisabledReason ||
          (isRemote ? remoteDisabledReason : !isCurrent ? currentDisabledReason : null),
        onSelect: () => {
          closeBranchContextMenu();
          handleOpenPushDialog();
        },
      },
      {
        id: "rename",
        label: t("git.historyBranchMenuRename"),
        icon: <Pencil size={14} aria-hidden />,
        dividerBefore: true,
        disabled: Boolean(baseDisabledReason || isRemote),
        disabledReason: baseDisabledReason || (isRemote ? remoteDisabledReason : null),
        onSelect: () => {
          closeBranchContextMenu();
          handleOpenRenameBranchDialog(targetBranch);
        },
      },
      {
        id: "delete",
        label: t("git.historyBranchMenuDelete"),
        icon: <Trash2 size={14} aria-hidden />,
        tone: "danger",
        disabled: Boolean(baseDisabledReason || isCurrent || isRemote),
        disabledReason:
          baseDisabledReason ||
          (isCurrent ? currentDisabledReason : isRemote ? remoteDisabledReason : null),
        onSelect: () => {
          closeBranchContextMenu();
          void handleDeleteBranch(targetBranch);
        },
      },
    ];
  }, [
    Download,
    FileText,
    FolderTree,
    GitBranch,
    GitMerge,
    Pencil,
    Plus,
    RefreshCw,
    Repeat,
    Trash2,
    Upload,
    branchContextMenu,
    closeBranchContextMenu,
    createBranchSourceOptions.length,
    currentBranch,
    handleCheckoutAndRebaseCurrent,
    handleCheckoutBranch,
    handleCompareWithCurrentBranch,
    handleCreateBranch,
    handleDeleteBranch,
    handleMergeBranch,
    handleOpenPushDialog,
    handleOpenRenameBranchDialog,
    handleRebaseCurrentOntoBranch,
    handleShowDiffWithWorktree,
    handleUpdateBranchFromContextMenu,
    operationLoading,
    t,
    workspaceId,
  ]);

  const handleBranchContextMenuKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const menuElement = branchContextMenuRef.current as HTMLDivElement | null;
      if (!menuElement) {
        return;
      }
      const enabledItems = Array.from(
        menuElement.querySelectorAll(
          '.git-history-branch-context-item[role="menuitem"]:not(:disabled)',
        ),
      ) as HTMLButtonElement[];
      if (!enabledItems.length) {
        return;
      }
      const activeElement = document.activeElement;
      const currentIndex = enabledItems.findIndex((item) => item === activeElement);
      const focusIndex = (index: number) => {
        const normalized =
          ((index % enabledItems.length) + enabledItems.length) % enabledItems.length;
        enabledItems[normalized]?.focus();
      };

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        focusIndex(currentIndex < 0 ? 0 : currentIndex + 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        focusIndex(currentIndex < 0 ? enabledItems.length - 1 : currentIndex - 1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        event.stopPropagation();
        focusIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        event.stopPropagation();
        focusIndex(enabledItems.length - 1);
      }
    },
    [branchContextMenuRef],
  );

  useEffect(() => {
    if (!branchContextMenu) {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      const menuElement = branchContextMenuRef.current as HTMLDivElement | null;
      if (!menuElement) {
        return;
      }
      const firstEnabled = menuElement.querySelector(
        '.git-history-branch-context-item[role="menuitem"]:not(:disabled)',
      ) as HTMLButtonElement | null;
      firstEnabled?.focus();
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [branchContextActions, branchContextMenu, branchContextMenuRef]);

  const branchContextMenuStyle = useMemo<CSSProperties | undefined>(() => {
    if (!branchContextMenu) {
      return undefined;
    }
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
    const longestLabelLength = branchContextActions.reduce(
      (max, action) => Math.max(max, action.label.length),
      0,
    );
    const estimatedMenuWidth = clamp(longestLabelLength * 8 + 96, 276, 520);
    const dividerCount = branchContextActions.reduce(
      (count, action) => count + (action.dividerBefore ? 1 : 0),
      0,
    );
    const estimatedMenuHeight = clamp(
      branchContextActions.length * 38 + dividerCount * 8 + 18,
      220,
      560,
    );
    const padding = 10;
    return {
      left: clamp(
        branchContextMenu.x,
        padding,
        Math.max(padding, viewportWidth - estimatedMenuWidth - padding),
      ),
      top: clamp(
        branchContextMenu.y,
        padding,
        Math.max(padding, viewportHeight - estimatedMenuHeight - padding),
      ),
    };
  }, [branchContextActions, branchContextMenu, clamp]);

  return {
    branchContextTrackingSummary,
    branchContextActions,
    handleBranchContextMenuKeyDown,
    branchContextMenuStyle,
  };
}
