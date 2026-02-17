import { useCallback, useEffect, useReducer, useRef } from "react";
import type { CustomPromptOption, DebugEntry, WorkspaceInfo } from "../../../types";
import { useAppServerEvents } from "../../app/hooks/useAppServerEvents";
import { initialState, threadReducer } from "./useThreadsReducer";
import { useThreadStorage } from "./useThreadStorage";
import { useThreadLinking } from "./useThreadLinking";
import { useThreadEventHandlers } from "./useThreadEventHandlers";
import { useThreadActions } from "./useThreadActions";
import { useThreadMessaging } from "./useThreadMessaging";
import { useThreadApprovals } from "./useThreadApprovals";
import { useThreadAccountInfo } from "./useThreadAccountInfo";
import { useThreadRateLimits } from "./useThreadRateLimits";
import { useThreadSelectors } from "./useThreadSelectors";
import { useThreadStatus } from "./useThreadStatus";
import { useThreadUserInput } from "./useThreadUserInput";
import {
  makeCustomNameKey,
  saveCustomName,
} from "../utils/threadStorage";
import { writeClientStoreValue } from "../../../services/clientStorage";
import {
  generateThreadTitle,
  listThreadTitles,
  resumeThread,
  setThreadTitle,
} from "../../../services/tauri";
import { buildItemsFromThread } from "../../../utils/threadItems";
import i18n from "../../../i18n";

const AUTO_TITLE_REQUEST_TIMEOUT_MS = 8_000;
const AUTO_TITLE_MAX_ATTEMPTS = 2;
const AUTO_TITLE_PENDING_STALE_MS = 20_000;

type UseThreadsOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onWorkspaceConnected: (id: string) => void;
  onDebug?: (entry: DebugEntry) => void;
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  accessMode?: "read-only" | "current" | "full-access";
  steerEnabled?: boolean;
  customPrompts?: CustomPromptOption[];
  onMessageActivity?: () => void;
  activeEngine?: "claude" | "codex" | "gemini" | "opencode";
  resolveOpenCodeAgent?: (threadId: string | null) => string | null;
  resolveOpenCodeVariant?: (threadId: string | null) => string | null;
};

type PendingResolutionInput = {
  workspaceId: string;
  engine: "claude" | "opencode";
  threadsByWorkspace: Record<string, Array<{ id: string }>>;
  activeThreadIdByWorkspace: Record<string, string | null>;
  threadStatusById: Record<string, { isProcessing?: boolean } | undefined>;
  activeTurnIdByThread: Record<string, string | null | undefined>;
};

export type ThreadDeleteErrorCode =
  | "WORKSPACE_NOT_CONNECTED"
  | "SESSION_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "IO_ERROR"
  | "ENGINE_UNSUPPORTED"
  | "UNKNOWN";

export type ThreadDeleteResult = {
  threadId: string;
  success: boolean;
  code: ThreadDeleteErrorCode | null;
  message: string | null;
};

export function resolvePendingThreadIdForSession({
  workspaceId,
  engine,
  threadsByWorkspace,
  activeThreadIdByWorkspace,
  threadStatusById,
  activeTurnIdByThread,
}: PendingResolutionInput): string | null {
  const prefix = `${engine}-pending-`;
  const threads = threadsByWorkspace[workspaceId] ?? [];
  const pendingThreads = threads.filter((thread) => thread.id.startsWith(prefix));
  if (pendingThreads.length === 0) {
    return null;
  }

  const parsePendingTimestamp = (threadId: string): number | null => {
    const match = threadId.match(/^[a-z]+-pending-(\d+)-/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const pickNewestPending = (candidates: Array<{ id: string }>): string | null => {
    let selected: string | null = null;
    let maxTimestamp = -1;
    for (const candidate of candidates) {
      const timestamp = parsePendingTimestamp(candidate.id);
      if (timestamp === null || timestamp <= maxTimestamp) {
        continue;
      }
      maxTimestamp = timestamp;
      selected = candidate.id;
    }
    return selected;
  };

  const activePendingId = activeThreadIdByWorkspace[workspaceId] ?? null;
  const pickActivePending = (candidates: Array<{ id: string }>): string | null => {
    if (!activePendingId || !activePendingId.startsWith(prefix)) {
      return null;
    }
    return candidates.some((candidate) => candidate.id === activePendingId)
      ? activePendingId
      : null;
  };

  const processingPending = pendingThreads.filter((thread) =>
    Boolean(threadStatusById[thread.id]?.isProcessing),
  );
  if (processingPending.length === 1) {
    return processingPending[0].id;
  }
  if (processingPending.length > 1) {
    return pickActivePending(processingPending) ?? pickNewestPending(processingPending);
  }

  const turnBoundPending = pendingThreads.filter(
    (thread) => (activeTurnIdByThread[thread.id] ?? null) !== null,
  );
  if (turnBoundPending.length === 1) {
    return turnBoundPending[0].id;
  }
  if (turnBoundPending.length > 1) {
    return pickActivePending(turnBoundPending) ?? pickNewestPending(turnBoundPending);
  }

  if (pendingThreads.length === 1) {
    return pendingThreads[0].id;
  }

  return pickActivePending(pendingThreads) ?? pickNewestPending(pendingThreads);
}

export function useThreads({
  activeWorkspace,
  onWorkspaceConnected,
  onDebug,
  model,
  effort,
  collaborationMode,
  accessMode,
  steerEnabled = false,
  customPrompts = [],
  onMessageActivity,
  activeEngine = "claude",
  resolveOpenCodeAgent,
  resolveOpenCodeVariant,
}: UseThreadsOptions) {
  const [state, dispatch] = useReducer(threadReducer, initialState);
  const loadedThreadsRef = useRef<Record<string, boolean>>({});
  const replaceOnResumeRef = useRef<Record<string, boolean>>({});
  const pendingInterruptsRef = useRef<Set<string>>(new Set());
  const interruptedThreadsRef = useRef<Set<string>>(new Set());
  const { approvalAllowlistRef, handleApprovalDecision, handleApprovalRemember } =
    useThreadApprovals({ dispatch, onDebug });
  const { handleUserInputSubmit } = useThreadUserInput({ dispatch });
  const {
    customNamesRef,
    threadActivityRef,
    pinnedThreadsVersion,
    getCustomName,
    recordThreadActivity,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    markAutoTitlePending,
    clearAutoTitlePending,
    isAutoTitlePending,
    getAutoTitlePendingStartedAt,
    renameAutoTitlePendingKey,
    autoTitlePendingVersion,
  } = useThreadStorage();

  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const { activeThreadId, activeItems } = useThreadSelectors({
    activeWorkspaceId,
    activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
    itemsByThread: state.itemsByThread,
  });

  const { refreshAccountRateLimits } = useThreadRateLimits({
    activeWorkspaceId,
    activeWorkspaceConnected: activeWorkspace?.connected,
    dispatch,
    onDebug,
  });
  const { refreshAccountInfo } = useThreadAccountInfo({
    activeWorkspaceId,
    activeWorkspaceConnected: activeWorkspace?.connected,
    dispatch,
    onDebug,
  });

  const { markProcessing, markReviewing, setActiveTurnId } = useThreadStatus({
    dispatch,
  });

  const pushThreadErrorMessage = useCallback(
    (threadId: string, message: string) => {
      dispatch({
        type: "addAssistantMessage",
        threadId,
        text: message,
      });
      if (threadId !== activeThreadId) {
        dispatch({ type: "markUnread", threadId, hasUnread: true });
      }
    },
    [activeThreadId, dispatch],
  );

  const safeMessageActivity = useCallback(() => {
    try {
      void onMessageActivity?.();
    } catch {
      // Ignore refresh errors to avoid breaking the UI.
    }
  }, [onMessageActivity]);
  const { applyCollabThreadLinks, applyCollabThreadLinksFromThread, updateThreadParent } =
    useThreadLinking({
      dispatch,
      threadParentById: state.threadParentById,
    });

  const handleWorkspaceConnected = useCallback(
    (workspaceId: string) => {
      onWorkspaceConnected(workspaceId);
      void refreshAccountRateLimits(workspaceId);
      void refreshAccountInfo(workspaceId);
    },
    [onWorkspaceConnected, refreshAccountRateLimits, refreshAccountInfo],
  );

  const isThreadHidden = useCallback(
    (workspaceId: string, threadId: string) =>
      Boolean(state.hiddenThreadIdsByWorkspace[workspaceId]?.[threadId]),
    [state.hiddenThreadIdsByWorkspace],
  );

  const getThreadEngine = useCallback(
    (workspaceId: string, threadId: string): "claude" | "codex" | "opencode" | undefined => {
      const threads = state.threadsByWorkspace[workspaceId] ?? [];
      const thread = threads.find((t) => t.id === threadId);
      return thread?.engineSource;
    },
    [state.threadsByWorkspace],
  );

  const resolvePendingThreadForSession = useCallback(
    (
      workspaceId: string,
      engine: "claude" | "opencode",
    ): string | null => {
      return resolvePendingThreadIdForSession({
        workspaceId,
        engine,
        threadsByWorkspace: state.threadsByWorkspace,
        activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
        threadStatusById: state.threadStatusById,
        activeTurnIdByThread: state.activeTurnIdByThread,
      });
    },
    [
      state.activeThreadIdByWorkspace,
      state.activeTurnIdByThread,
      state.threadStatusById,
      state.threadsByWorkspace,
    ],
  );

  const renameCustomNameKey = useCallback(
    (workspaceId: string, oldThreadId: string, newThreadId: string) => {
      const fromKey = makeCustomNameKey(workspaceId, oldThreadId);
      const value = customNamesRef.current[fromKey];
      if (!value) {
        return;
      }
      const toKey = makeCustomNameKey(workspaceId, newThreadId);
      const next = { ...customNamesRef.current };
      delete next[fromKey];
      next[toKey] = value;
      customNamesRef.current = next;
      writeClientStoreValue("threads", "customNames", next);
    },
    [customNamesRef],
  );

  useEffect(() => {
    if (!activeWorkspaceId || !activeThreadId) {
      return;
    }
    const currentEngine = getThreadEngine(activeWorkspaceId, activeThreadId);
    const targetEngine =
      activeEngine === "claude"
        ? "claude"
        : activeEngine === "opencode"
          ? "opencode"
          : "codex";
    if (currentEngine === targetEngine) {
      return;
    }
    const items = state.itemsByThread[activeThreadId] ?? [];
    if (items.length > 0) {
      return;
    }
    dispatch({
      type: "setThreadEngine",
      workspaceId: activeWorkspaceId,
      threadId: activeThreadId,
      engine: targetEngine,
    });
  }, [
    activeEngine,
    activeThreadId,
    activeWorkspaceId,
    getThreadEngine,
    state.itemsByThread,
  ]);

  const {
    startThreadForWorkspace,
    forkThreadForWorkspace,
    resumeThreadForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    archiveThread,
    archiveClaudeThread,
    renameThreadTitleMapping,
  } = useThreadActions({
    dispatch,
    itemsByThread: state.itemsByThread,
    threadsByWorkspace: state.threadsByWorkspace,
    activeThreadIdByWorkspace: state.activeThreadIdByWorkspace,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    threadStatusById: state.threadStatusById,
    onDebug,
    getCustomName,
    threadActivityRef,
    loadedThreadsRef,
    replaceOnResumeRef,
    applyCollabThreadLinksFromThread,
    onThreadTitleMappingsLoaded: (workspaceId, titles) => {
      Object.entries(titles).forEach(([threadId, title]) => {
        if (!threadId.trim() || !title.trim()) {
          return;
        }
        saveCustomName(workspaceId, threadId, title);
        const key = makeCustomNameKey(workspaceId, threadId);
        customNamesRef.current[key] = title;
        dispatch({ type: "setThreadName", workspaceId, threadId, name: title });
      });
    },
    onRenameThreadTitleMapping: (workspaceId, oldThreadId, _newThreadId) => {
      clearAutoTitlePending(workspaceId, oldThreadId);
    },
  });

  const startThread = useCallback(async () => {
    if (!activeWorkspaceId) {
      return null;
    }
    return startThreadForWorkspace(activeWorkspaceId, { engine: activeEngine });
  }, [activeWorkspaceId, activeEngine, startThreadForWorkspace]);

  const ensureThreadForActiveWorkspace = useCallback(async () => {
    if (!activeWorkspace) {
      return null;
    }
    let threadId = activeThreadId;
    if (!threadId) {
      threadId = await startThreadForWorkspace(activeWorkspace.id, { engine: activeEngine });
      if (!threadId) {
        return null;
      }
    } else if (!loadedThreadsRef.current[threadId]) {
      await resumeThreadForWorkspace(activeWorkspace.id, threadId);
    }
    return threadId;
  }, [activeWorkspace, activeThreadId, activeEngine, resumeThreadForWorkspace, startThreadForWorkspace]);

  const ensureThreadForWorkspace = useCallback(
    async (workspaceId: string) => {
      const currentActiveThreadId = state.activeThreadIdByWorkspace[workspaceId] ?? null;
      const shouldActivate = workspaceId === activeWorkspaceId;
      let threadId = currentActiveThreadId;
      if (!threadId) {
        threadId = await startThreadForWorkspace(workspaceId, {
          activate: shouldActivate,
          engine: activeEngine,
        });
        if (!threadId) {
          return null;
        }
      } else if (!loadedThreadsRef.current[threadId]) {
        await resumeThreadForWorkspace(workspaceId, threadId);
      }
      if (shouldActivate && currentActiveThreadId !== threadId) {
        dispatch({ type: "setActiveThreadId", workspaceId, threadId });
      }
      return threadId;
    },
    [
      activeWorkspaceId,
      activeEngine,
      dispatch,
      loadedThreadsRef,
      resumeThreadForWorkspace,
      startThreadForWorkspace,
      state.activeThreadIdByWorkspace,
    ],
  );

  const autoNameThread = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      sourceText: string,
      options?: { force?: boolean; clearPendingOnSkip?: boolean },
    ): Promise<string | null> => {
      const key = makeCustomNameKey(workspaceId, threadId);
      const hasCustomName = Boolean(customNamesRef.current[key]);
      if (hasCustomName && !options?.force) {
        onDebug?.({
          id: `${Date.now()}-thread-title-skip-custom`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/title skipped",
          payload: { workspaceId, threadId, reason: "has-custom-name" },
        });
        if (options?.clearPendingOnSkip) {
          clearAutoTitlePending(workspaceId, threadId);
        }
        return null;
      }

      const message = sourceText.trim();
      if (!message) {
        onDebug?.({
          id: `${Date.now()}-thread-title-skip-empty`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/title skipped",
          payload: { workspaceId, threadId, reason: "empty-source-text" },
        });
        if (options?.clearPendingOnSkip) {
          clearAutoTitlePending(workspaceId, threadId);
        }
        return null;
      }

      const pendingStartedAt = getAutoTitlePendingStartedAt(workspaceId, threadId);
      if (pendingStartedAt) {
        const pendingAgeMs = Date.now() - pendingStartedAt;
        if (pendingAgeMs >= AUTO_TITLE_PENDING_STALE_MS) {
          onDebug?.({
            id: `${Date.now()}-thread-title-pending-timeout-reset`,
            timestamp: Date.now(),
            source: "client",
            label: "thread/title pending reset",
            payload: {
              workspaceId,
              threadId,
              pendingStartedAt,
              pendingAgeMs,
              reason: "timeout",
            },
          });
          clearAutoTitlePending(workspaceId, threadId);
        } else {
          onDebug?.({
            id: `${Date.now()}-thread-title-skip-pending`,
            timestamp: Date.now(),
            source: "client",
            label: "thread/title skipped",
            payload: {
              workspaceId,
              threadId,
              reason: "already-pending",
              pendingStartedAt,
              pendingAgeMs,
            },
          });
          return null;
        }
      }

      if (isAutoTitlePending(workspaceId, threadId)) {
        onDebug?.({
          id: `${Date.now()}-thread-title-skip-pending-after-reset`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/title skipped",
          payload: { workspaceId, threadId, reason: "already-pending-after-reset" },
        });
        return null;
      }

      markAutoTitlePending(workspaceId, threadId);
      const markAt = getAutoTitlePendingStartedAt(workspaceId, threadId);
      onDebug?.({
        id: `${Date.now()}-thread-title-generate-start`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/title generate",
        payload: {
          workspaceId,
          threadId,
          force: Boolean(options?.force),
          pendingStartedAt: markAt,
        },
      });

      try {
        const applyGeneratedTitle = (title: string, source: "generated" | "recovered") => {
          saveCustomName(workspaceId, threadId, title);
          const nextKey = makeCustomNameKey(workspaceId, threadId);
          customNamesRef.current[nextKey] = title;
          dispatch({ type: "setThreadName", workspaceId, threadId, name: title });
          onDebug?.({
            id: `${Date.now()}-thread-title-${source}-success`,
            timestamp: Date.now(),
            source: "server",
            label: source === "generated" ? "thread/title generated" : "thread/title recovered",
            payload: { workspaceId, threadId, title, source },
          });
          return title;
        };

        const generateWithTimeout = async (
          preferredLanguage: "zh" | "en",
        ): Promise<string> =>
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error("auto-title-timeout"));
            }, AUTO_TITLE_REQUEST_TIMEOUT_MS);

            void generateThreadTitle(
              workspaceId,
              threadId,
              message,
              preferredLanguage,
            ).then(
              (value) => {
                clearTimeout(timeoutId);
                resolve(value);
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              },
            );
          });

        const language = i18n.language.toLowerCase().startsWith("zh")
          ? "zh"
          : "en";
        for (let attempt = 1; attempt <= AUTO_TITLE_MAX_ATTEMPTS; attempt += 1) {
          const attemptStartedAt = Date.now();
          try {
            onDebug?.({
              id: `${Date.now()}-thread-title-attempt-start`,
              timestamp: Date.now(),
              source: "client",
              label: "thread/title attempt",
              payload: {
                workspaceId,
                threadId,
                attempt,
                maxAttempts: AUTO_TITLE_MAX_ATTEMPTS,
                timeoutMs: AUTO_TITLE_REQUEST_TIMEOUT_MS,
                language,
              },
            });

            const generated = await generateWithTimeout(language);
            const title = generated.trim();
            if (!title) {
              throw new Error("empty-generated-title");
            }
            return applyGeneratedTitle(title, "generated");
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isTimeout = errorMessage.includes("auto-title-timeout");
            const elapsedMs = Date.now() - attemptStartedAt;

            onDebug?.({
              id: `${Date.now()}-thread-title-attempt-failed`,
              timestamp: Date.now(),
              source: isTimeout ? "client" : "error",
              label: "thread/title attempt failed",
              payload: {
                workspaceId,
                threadId,
                attempt,
                maxAttempts: AUTO_TITLE_MAX_ATTEMPTS,
                isTimeout,
                elapsedMs,
                error: errorMessage,
              },
            });

            if (isTimeout) {
              await new Promise((resolve) => setTimeout(resolve, 1200));
            }

            try {
              const mappedTitles = await listThreadTitles(workspaceId);
              const recovered = mappedTitles[threadId]?.trim();
              if (recovered) {
                return applyGeneratedTitle(recovered, "recovered");
              }
            } catch (recoveryError) {
              onDebug?.({
                id: `${Date.now()}-thread-title-recovery-check-error`,
                timestamp: Date.now(),
                source: "error",
                label: "thread/title recovery error",
                payload:
                  recoveryError instanceof Error
                    ? recoveryError.message
                    : String(recoveryError),
              });
            }

            if (attempt < AUTO_TITLE_MAX_ATTEMPTS) {
              onDebug?.({
                id: `${Date.now()}-thread-title-retry`,
                timestamp: Date.now(),
                source: "client",
                label: "thread/title retry",
                payload: {
                  workspaceId,
                  threadId,
                  nextAttempt: attempt + 1,
                  maxAttempts: AUTO_TITLE_MAX_ATTEMPTS,
                },
              });
              continue;
            }

            onDebug?.({
              id: `${Date.now()}-thread-title-generate-error`,
              timestamp: Date.now(),
              source: "error",
              label: "thread/title generate error",
              payload: {
                workspaceId,
                threadId,
                attempt,
                maxAttempts: AUTO_TITLE_MAX_ATTEMPTS,
                error: errorMessage,
              },
            });
            return null;
          }
        }

        return null;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-thread-title-generate-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/title generate error",
          payload: {
            workspaceId,
            threadId,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        return null;
      } finally {
        clearAutoTitlePending(workspaceId, threadId);
      }
    },
    [
      clearAutoTitlePending,
      customNamesRef,
      dispatch,
      getAutoTitlePendingStartedAt,
      isAutoTitlePending,
      markAutoTitlePending,
      onDebug,
    ],
  );

  const {
    interruptTurn,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startMcp,
    startStatus,
    startExport,
    startImport,
    startLsp,
    startShare,
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
  } = useThreadMessaging({
    activeWorkspace,
    activeThreadId,
    accessMode,
    model,
    effort,
    collaborationMode,
    steerEnabled,
    customPrompts,
    activeEngine,
    threadStatusById: state.threadStatusById,
    activeTurnIdByThread: state.activeTurnIdByThread,
    rateLimitsByWorkspace: state.rateLimitsByWorkspace,
    pendingInterruptsRef,
    interruptedThreadsRef,
    dispatch,
    getCustomName,
    getThreadEngine,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    recordThreadActivity,
    safeMessageActivity,
    onDebug,
    pushThreadErrorMessage,
    ensureThreadForActiveWorkspace,
    ensureThreadForWorkspace,
    refreshThread,
    forkThreadForWorkspace,
    updateThreadParent,
    startThreadForWorkspace,
    autoNameThread,
    resolveOpenCodeAgent,
    resolveOpenCodeVariant,
  });

  const setActiveThreadId = useCallback(
    (threadId: string | null, workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      dispatch({ type: "setActiveThreadId", workspaceId: targetId, threadId });
      if (threadId) {
        void resumeThreadForWorkspace(targetId, threadId);
      }
    },
    [activeWorkspaceId, resumeThreadForWorkspace, state.activeThreadIdByWorkspace],
  );

  const removeThread = useCallback(
    async (workspaceId: string, threadId: string): Promise<ThreadDeleteResult> => {
      const mapDeleteErrorCode = (errorMessage: string): ThreadDeleteErrorCode => {
        const normalized = errorMessage.toLowerCase();
        if (normalized.includes("workspace not connected")) {
          return "WORKSPACE_NOT_CONNECTED";
        }
        if (
          normalized.includes("session file not found") ||
          normalized.includes("not found") ||
          normalized.includes("thread not found")
        ) {
          return "SESSION_NOT_FOUND";
        }
        if (normalized.includes("permission denied")) {
          return "PERMISSION_DENIED";
        }
        if (normalized.includes("io") || normalized.includes("failed to delete session file")) {
          return "IO_ERROR";
        }
        if (normalized.includes("unsupported")) {
          return "ENGINE_UNSUPPORTED";
        }
        return "UNKNOWN";
      };

      try {
        if (threadId.startsWith("claude:")) {
          await archiveClaudeThread(workspaceId, threadId);
        } else {
          await archiveThread(workspaceId, threadId);
        }
        unpinThread(workspaceId, threadId);
        dispatch({ type: "removeThread", workspaceId, threadId });
        return {
          threadId,
          success: true,
          code: null,
          message: null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          threadId,
          success: false,
          code: mapDeleteErrorCode(message),
          message,
        };
      }
    },
    [archiveClaudeThread, archiveThread, unpinThread],
  );

  const renameThread = useCallback(
    (workspaceId: string, threadId: string, newName: string) => {
      saveCustomName(workspaceId, threadId, newName);
      void setThreadTitle(workspaceId, threadId, newName).catch(() => {
        // Keep local rename even if file persistence fails.
      });
      const key = makeCustomNameKey(workspaceId, threadId);
      customNamesRef.current[key] = newName;
      dispatch({ type: "setThreadName", workspaceId, threadId, name: newName });
      clearAutoTitlePending(workspaceId, threadId);
    },
    [clearAutoTitlePending, customNamesRef, dispatch],
  );

  const triggerAutoThreadTitle = useCallback(
    async (workspaceId: string, threadId: string, options?: { force?: boolean }) => {
      const items = state.itemsByThread[threadId] ?? [];
      const userMessage = items.find(
        (item) => item.kind === "message" && item.role === "user",
      );
      let text =
        userMessage && userMessage.kind === "message" ? userMessage.text : "";

      if (!text.trim() && !threadId.startsWith("claude:")) {
        try {
          const response = (await resumeThread(workspaceId, threadId)) as
            | Record<string, unknown>
            | null;
          const result = (response?.result ?? response) as
            | Record<string, unknown>
            | null;
          const thread = (result?.thread ?? response?.thread ?? null) as
            | Record<string, unknown>
            | null;
          if (thread) {
            const loadedItems = buildItemsFromThread(thread);
            const loadedFirstUserMessage = loadedItems.find(
              (item) => item.kind === "message" && item.role === "user",
            );
            if (
              loadedFirstUserMessage &&
              loadedFirstUserMessage.kind === "message" &&
              loadedFirstUserMessage.text.trim()
            ) {
              text = loadedFirstUserMessage.text;
              onDebug?.({
                id: `${Date.now()}-thread-title-manual-source-resume`,
                timestamp: Date.now(),
                source: "client",
                label: "thread/title manual source",
                payload: { workspaceId, threadId, source: "thread/resume" },
              });
            }
          }
        } catch (error) {
          onDebug?.({
            id: `${Date.now()}-thread-title-manual-source-resume-error`,
            timestamp: Date.now(),
            source: "error",
            label: "thread/title manual source error",
            payload: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (!text.trim()) {
        const fallbackName =
          state.threadsByWorkspace[workspaceId]
            ?.find((thread) => thread.id === threadId)
            ?.name?.trim() ?? "";
        if (fallbackName && !/^agent\s+\d+$/i.test(fallbackName)) {
          text = fallbackName;
          onDebug?.({
            id: `${Date.now()}-thread-title-manual-source-name`,
            timestamp: Date.now(),
            source: "client",
            label: "thread/title manual source",
            payload: { workspaceId, threadId, source: "thread/name" },
          });
        }
      }

      if (!text.trim()) {
        onDebug?.({
          id: `${Date.now()}-thread-title-manual-missing-source`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/title manual skipped",
          payload: { workspaceId, threadId, reason: "no-user-message-found" },
        });
      }
      const generated = await autoNameThread(workspaceId, threadId, text, {
        force: options?.force ?? true,
        clearPendingOnSkip: true,
      });
      return generated;
    },
    [autoNameThread, onDebug, state.itemsByThread, state.threadsByWorkspace],
  );

  const isThreadAutoNaming = useCallback(
    (workspaceId: string, threadId: string) =>
      isAutoTitlePending(workspaceId, threadId),
    [isAutoTitlePending, autoTitlePendingVersion],
  );

  const handlers = useThreadEventHandlers({
    activeThreadId,
    dispatch,
    getCustomName,
    isAutoTitlePending,
    isThreadHidden,
    markProcessing,
    markReviewing,
    setActiveTurnId,
    safeMessageActivity,
    recordThreadActivity,
    pushThreadErrorMessage,
    onDebug,
    onWorkspaceConnected: handleWorkspaceConnected,
    applyCollabThreadLinks,
    approvalAllowlistRef,
    pendingInterruptsRef,
    interruptedThreadsRef,
    renameCustomNameKey,
    renameAutoTitlePendingKey,
    renameThreadTitleMapping,
    resolvePendingThreadForSession,
  });

  useAppServerEvents(handlers);

  return {
    activeThreadId,
    setActiveThreadId,
    activeItems,
    threadItemsByThread: state.itemsByThread,
    approvals: state.approvals,
    userInputRequests: state.userInputRequests,
    threadsByWorkspace: state.threadsByWorkspace,
    threadParentById: state.threadParentById,
    threadStatusById: state.threadStatusById,
    threadListLoadingByWorkspace: state.threadListLoadingByWorkspace,
    threadListPagingByWorkspace: state.threadListPagingByWorkspace,
    threadListCursorByWorkspace: state.threadListCursorByWorkspace,
    activeTurnIdByThread: state.activeTurnIdByThread,
    tokenUsageByThread: state.tokenUsageByThread,
    rateLimitsByWorkspace: state.rateLimitsByWorkspace,
    accountByWorkspace: state.accountByWorkspace,
    planByThread: state.planByThread,
    lastAgentMessageByThread: state.lastAgentMessageByThread,
    refreshAccountRateLimits,
    refreshAccountInfo,
    interruptTurn,
    removeThread,
    pinThread,
    unpinThread,
    isThreadPinned,
    getPinTimestamp,
    pinnedThreadsVersion,
    renameThread,
    autoNameThread,
    triggerAutoThreadTitle,
    isThreadAutoNaming,
    startThread,
    startThreadForWorkspace,
    forkThreadForWorkspace,
    listThreadsForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    loadOlderThreadsForWorkspace,
    sendUserMessage,
    sendUserMessageToThread,
    startFork,
    startReview,
    startResume,
    startMcp,
    startStatus,
    startExport,
    startImport,
    startLsp,
    startShare,
    reviewPrompt,
    openReviewPrompt,
    closeReviewPrompt,
    showPresetStep,
    choosePreset,
    highlightedPresetIndex,
    setHighlightedPresetIndex,
    highlightedBranchIndex,
    setHighlightedBranchIndex,
    highlightedCommitIndex,
    setHighlightedCommitIndex,
    handleReviewPromptKeyDown,
    confirmBranch,
    selectBranch,
    selectBranchAtIndex,
    selectCommit,
    selectCommitAtIndex,
    confirmCommit,
    updateCustomInstructions,
    confirmCustom,
    handleApprovalDecision,
    handleApprovalRemember,
    handleUserInputSubmit,
  };
}
