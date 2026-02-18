import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type {
  AccessMode,
  RateLimitSnapshot,
  CustomPromptOption,
  DebugEntry,
  ReviewTarget,
  WorkspaceInfo,
} from "../../../types";
import {
  sendUserMessage as sendUserMessageService,
  startReview as startReviewService,
  interruptTurn as interruptTurnService,
  listMcpServerStatus as listMcpServerStatusService,
  engineSendMessage as engineSendMessageService,
  engineInterrupt as engineInterruptService,
  exportOpenCodeSession as exportOpenCodeSessionService,
  getOpenCodeLspDiagnostics as getOpenCodeLspDiagnosticsService,
  getOpenCodeLspDocumentSymbols as getOpenCodeLspDocumentSymbolsService,
  getOpenCodeLspSymbols as getOpenCodeLspSymbolsService,
  getOpenCodeMcpStatus as getOpenCodeMcpStatusService,
  getOpenCodeStats as getOpenCodeStatsService,
  importOpenCodeSession as importOpenCodeSessionService,
  shareOpenCodeSession as shareOpenCodeSessionService,
} from "../../../services/tauri";
import { expandCustomPromptText } from "../../../utils/customPrompts";
import {
  asString,
  extractRpcErrorMessage,
  parseReviewTarget,
} from "../utils/threadNormalize";
import type { ThreadAction, ThreadState } from "./useThreadsReducer";
import { useReviewPrompt } from "./useReviewPrompt";
import { formatRelativeTime } from "../../../utils/time";
import { pushErrorToast } from "../../../services/toasts";

type SendMessageOptions = {
  skipPromptExpansion?: boolean;
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  accessMode?: AccessMode;
};

type UseThreadMessagingOptions = {
  activeWorkspace: WorkspaceInfo | null;
  activeThreadId: string | null;
  accessMode?: "read-only" | "current" | "full-access";
  model?: string | null;
  effort?: string | null;
  collaborationMode?: Record<string, unknown> | null;
  steerEnabled: boolean;
  customPrompts: CustomPromptOption[];
  activeEngine?: "claude" | "codex" | "gemini" | "opencode";
  threadStatusById: ThreadState["threadStatusById"];
  activeTurnIdByThread: ThreadState["activeTurnIdByThread"];
  rateLimitsByWorkspace: Record<string, RateLimitSnapshot | null>;
  pendingInterruptsRef: MutableRefObject<Set<string>>;
  interruptedThreadsRef: MutableRefObject<Set<string>>;
  dispatch: Dispatch<ThreadAction>;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  getThreadEngine: (
    workspaceId: string,
    threadId: string,
  ) => "claude" | "codex" | "opencode" | undefined;
  markProcessing: (threadId: string, isProcessing: boolean) => void;
  markReviewing: (threadId: string, isReviewing: boolean) => void;
  setActiveTurnId: (threadId: string, turnId: string | null) => void;
  recordThreadActivity: (
    workspaceId: string,
    threadId: string,
    timestamp?: number,
  ) => void;
  safeMessageActivity: () => void;
  onDebug?: (entry: DebugEntry) => void;
  pushThreadErrorMessage: (threadId: string, message: string) => void;
  ensureThreadForActiveWorkspace: () => Promise<string | null>;
  ensureThreadForWorkspace: (workspaceId: string) => Promise<string | null>;
  refreshThread: (workspaceId: string, threadId: string) => Promise<string | null>;
  forkThreadForWorkspace: (
    workspaceId: string,
    threadId: string,
    options?: { activate?: boolean },
  ) => Promise<string | null>;
  updateThreadParent: (parentId: string, childIds: string[]) => void;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean; engine?: "claude" | "codex" | "opencode" },
  ) => Promise<string | null>;
  resolveOpenCodeAgent?: (threadId: string | null) => string | null;
  resolveOpenCodeVariant?: (threadId: string | null) => string | null;
  autoNameThread?: (
    workspaceId: string,
    threadId: string,
    sourceText: string,
    options?: { force?: boolean; clearPendingOnSkip?: boolean },
  ) => Promise<string | null>;
};

export function useThreadMessaging({
  activeWorkspace,
  activeThreadId,
  accessMode,
  model,
  effort,
  collaborationMode,
  steerEnabled,
  customPrompts,
  activeEngine = "claude",
  threadStatusById,
  activeTurnIdByThread,
  rateLimitsByWorkspace,
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
  resolveOpenCodeAgent,
  resolveOpenCodeVariant,
  autoNameThread,
}: UseThreadMessagingOptions) {
  const { t, i18n } = useTranslation();
  const lastOpenCodeModelByThreadRef = useRef<Map<string, string>>(new Map());
  const normalizeEngineSelection = useCallback(
    (
      engine: "claude" | "codex" | "gemini" | "opencode" | undefined,
    ): "claude" | "codex" | "opencode" =>
      engine === "claude" ? "claude" : engine === "opencode" ? "opencode" : "codex",
    [],
  );

  const resolveThreadEngine = useCallback(
    (
      workspaceId: string,
      threadId: string,
    ): "claude" | "codex" | "opencode" => {
      const persistedEngine = getThreadEngine(workspaceId, threadId);
      if (persistedEngine) {
        return persistedEngine;
      }
      if (threadId.startsWith("claude:") || threadId.startsWith("claude-pending-")) {
        return "claude";
      }
      if (
        threadId.startsWith("opencode:") ||
        threadId.startsWith("opencode-pending-")
      ) {
        return "opencode";
      }
      return normalizeEngineSelection(activeEngine);
    },
    [activeEngine, getThreadEngine, normalizeEngineSelection],
  );

  const isThreadIdCompatibleWithEngine = useCallback(
    (
      engine: "claude" | "codex" | "opencode",
      threadId: string,
    ): boolean => {
      if (engine === "claude") {
        return (
          threadId.startsWith("claude:") ||
          threadId.startsWith("claude-pending-")
        );
      }
      if (engine === "opencode") {
        return (
          threadId.startsWith("opencode:") ||
          threadId.startsWith("opencode-pending-")
        );
      }
      return (
        !threadId.startsWith("claude:")
        && !threadId.startsWith("claude-pending-")
        && !threadId.startsWith("opencode:")
        && !threadId.startsWith("opencode-pending-")
      );
    },
    [],
  );

  const sendMessageToThread = useCallback(
    async (
      workspace: WorkspaceInfo,
      threadId: string,
      text: string,
      images: string[] = [],
      options?: SendMessageOptions,
    ) => {
      const messageText = text.trim();
      if (!messageText && images.length === 0) {
        return;
      }
      const resolvedEngine = resolveThreadEngine(workspace.id, threadId);
      dispatch({
        type: "ensureThread",
        workspaceId: workspace.id,
        threadId,
        engine: resolvedEngine,
      });
      dispatch({
        type: "setThreadEngine",
        workspaceId: workspace.id,
        threadId,
        engine: resolvedEngine,
      });
      let finalText = messageText;
      if (!options?.skipPromptExpansion) {
        const promptExpansion = expandCustomPromptText(messageText, customPrompts);
        if (promptExpansion && "error" in promptExpansion) {
          pushThreadErrorMessage(threadId, promptExpansion.error);
          safeMessageActivity();
          return;
        }
        finalText = promptExpansion?.expanded ?? messageText;
      }
      const resolvedModel =
        options?.model !== undefined ? options.model : model;
      const resolvedEffort =
        options?.effort !== undefined ? options.effort : effort;
      const resolvedCollaborationMode =
        options?.collaborationMode !== undefined
          ? options.collaborationMode
          : collaborationMode;
      const sanitizedCollaborationMode =
        resolvedCollaborationMode &&
        typeof resolvedCollaborationMode === "object" &&
        "settings" in resolvedCollaborationMode
          ? resolvedCollaborationMode
          : null;
      const resolvedAccessMode =
        options?.accessMode !== undefined ? options.accessMode : accessMode;
      const resolvedOpenCodeAgent =
        resolvedEngine === "opencode" ? (resolveOpenCodeAgent?.(threadId) ?? null) : null;
      const resolvedOpenCodeVariant =
        resolvedEngine === "opencode" ? (resolveOpenCodeVariant?.(threadId) ?? null) : null;
      const sanitizeOpenCodeModel = (candidate: string | null | undefined) => {
        if (!candidate) {
          return null;
        }
        const trimmed = candidate.trim();
        if (!trimmed) {
          return null;
        }
        // Guard against cross-engine leakage like "claude-sonnet-*".
        if (trimmed.startsWith("claude-")) {
          return null;
        }
        return trimmed;
      };
      const sanitizedModel =
        resolvedEngine === "claude" &&
        resolvedModel &&
        !resolvedModel.startsWith("claude-")
          ? null
          : resolvedModel;
      const sanitizedOpenCodeModel =
        resolvedEngine === "opencode"
          ? sanitizeOpenCodeModel(sanitizedModel)
          : sanitizedModel;
      const modelForSend =
        resolvedEngine === "opencode"
          ? (sanitizedOpenCodeModel ?? "openai/gpt-5.3-codex")
          : sanitizedOpenCodeModel;
      if (resolvedEngine === "opencode") {
        const normalizedModel = (modelForSend ?? "").trim().toLowerCase();
        const prevModel = lastOpenCodeModelByThreadRef.current.get(threadId);
        const isSessionThread = threadId.startsWith("opencode:");
        if (
          isSessionThread &&
          prevModel &&
          normalizedModel &&
          prevModel !== normalizedModel
        ) {
          pushErrorToast({
            title: "OpenCode 提示",
            message: "检测到同会话切换模型，已自动新建后端会话以避免超时。",
            durationMs: 3200,
          });
        }
        if (normalizedModel) {
          lastOpenCodeModelByThreadRef.current.set(threadId, normalizedModel);
        }
      }
      if (resolvedEngine === "claude" && resolvedModel && !sanitizedModel) {
        onDebug?.({
          id: `${Date.now()}-client-model-sanitize`,
          timestamp: Date.now(),
          source: "client",
          label: "model/sanitize",
          payload: {
            reason: "non-claude-model",
            model: resolvedModel,
          },
        });
        console.warn("[model/sanitize]", {
          reason: "non-claude-model",
          model: resolvedModel,
        });
      }
      if (
        resolvedEngine === "opencode" &&
        resolvedModel &&
        !sanitizedOpenCodeModel
      ) {
        onDebug?.({
          id: `${Date.now()}-client-opencode-model-sanitize`,
          timestamp: Date.now(),
          source: "client",
          label: "model/sanitize",
          payload: {
            reason: "invalid-opencode-model",
            model: resolvedModel,
            fallback: "openai/gpt-5.3-codex",
          },
        });
      }

      const wasProcessing =
        (threadStatusById[threadId]?.isProcessing ?? false) && steerEnabled;
      if (wasProcessing) {
        const optimisticText = finalText;
        if (optimisticText || images.length > 0) {
          dispatch({
            type: "upsertItem",
            workspaceId: workspace.id,
            threadId,
            item: {
              id: `optimistic-user-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,
              kind: "message",
              role: "user",
              text: optimisticText,
              images: images.length > 0 ? images : undefined,
            },
            hasCustomName: Boolean(getCustomName(workspace.id, threadId)),
          });
        }
      }
      const timestamp = Date.now();
      recordThreadActivity(workspace.id, threadId, timestamp);
      dispatch({
        type: "setThreadTimestamp",
        workspaceId: workspace.id,
        threadId,
        timestamp,
      });
      markProcessing(threadId, true);
      safeMessageActivity();
      onDebug?.({
        id: `${Date.now()}-client-turn-start`,
        timestamp: Date.now(),
        source: "client",
        label: "turn/start",
        payload: {
          workspaceId: workspace.id,
          threadId,
          engine: resolvedEngine,
          selectedEngine: activeEngine,
          text: finalText,
          images,
          model: modelForSend,
          effort: resolvedEffort,
          collaborationMode: sanitizedCollaborationMode,
          accessMode: resolvedAccessMode ?? null,
          agent: resolvedOpenCodeAgent,
          variant: resolvedOpenCodeVariant,
        },
      });
      console.info("[turn/start]", {
        workspaceId: workspace.id,
        threadId,
        engine: resolvedEngine,
        selectedEngine: activeEngine,
        model: modelForSend,
        effort: resolvedEffort,
        accessMode: resolvedAccessMode ?? null,
        agent: resolvedOpenCodeAgent,
        variant: resolvedOpenCodeVariant,
        textLength: finalText.length,
        hasImages: images.length > 0,
      });
      try {
        let response: Record<string, unknown>;

        const isClaudeSession = threadId.startsWith("claude:");
        const isOpenCodeSession = threadId.startsWith("opencode:");
        const cliEngine = resolvedEngine === "codex" ? null : resolvedEngine;
        const realSessionId =
          resolvedEngine === "claude" && isClaudeSession
            ? threadId.slice("claude:".length)
            : resolvedEngine === "opencode" && isOpenCodeSession
              ? threadId.slice("opencode:".length)
              : null;

        if (cliEngine) {
          // Claude/OpenCode: backend only streams assistant/tool events, so add user item locally.
          const userMessageId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          dispatch({
            type: "upsertItem",
            workspaceId: workspace.id,
            threadId,
            item: {
              id: userMessageId,
              kind: "message",
              role: "user",
              text: finalText,
              images: images.length > 0 ? images : undefined,
            },
            hasCustomName: Boolean(getCustomName(workspace.id, threadId)),
          });

          response = await engineSendMessageService(workspace.id, {
            text: finalText,
            engine: resolvedEngine,
            model: modelForSend,
            effort: resolvedEffort,
            images: images.length > 0 ? images : null,
            accessMode: resolvedAccessMode,
            continueSession: realSessionId !== null,
            sessionId: realSessionId,
            threadId: threadId,
            agent: resolvedOpenCodeAgent,
            variant: resolvedOpenCodeVariant,
          });

          onDebug?.({
            id: `${Date.now()}-server-turn-start`,
            timestamp: Date.now(),
            source: "server",
            label: `turn/start response (${cliEngine})`,
            payload: response,
          });

          const rpcError = extractRpcErrorMessage(response);
          if (rpcError) {
            markProcessing(threadId, false);
            setActiveTurnId(threadId, null);
            pushThreadErrorMessage(threadId, t("threads.turnFailedWithMessage", { message: rpcError }));
            safeMessageActivity();
            return;
          }

          // Extract turn ID - streaming events will handle the rest
          const result = (response?.result ?? response) as Record<string, unknown>;
          const turn = (result?.turn ?? response?.turn ?? null) as
            | Record<string, unknown>
            | null;
          const turnId = asString(turn?.id ?? "");

          if (!turnId) {
            markProcessing(threadId, false);
            setActiveTurnId(threadId, null);
            pushThreadErrorMessage(threadId, t("threads.turnFailedToStart"));
            safeMessageActivity();
            return;
          }

          // Set active turn ID - useAppServerEvents will handle streaming deltas
          // and mark processing complete when turn/completed event arrives
          setActiveTurnId(threadId, turnId);

          if (
            cliEngine !== "opencode" &&
            autoNameThread &&
            !getCustomName(workspace.id, threadId)
          ) {
            onDebug?.({
              id: `${Date.now()}-thread-title-trigger-${cliEngine}`,
              timestamp: Date.now(),
              source: "client",
              label: "thread/title trigger",
              payload: { workspaceId: workspace.id, threadId, engine: cliEngine },
            });
            void autoNameThread(workspace.id, threadId, finalText, {
              clearPendingOnSkip: true,
            }).catch((error) => {
              onDebug?.({
                id: `${Date.now()}-thread-title-trigger-${cliEngine}-error`,
                timestamp: Date.now(),
                source: "error",
                label: "thread/title trigger error",
                payload: error instanceof Error ? error.message : String(error),
              });
            });
          }
        } else {
          // Codex is event-driven and emits user/assistant events from backend.
          const preferredLanguage = i18n.language.toLowerCase().startsWith("zh")
            ? "zh"
            : "en";
          response =
            (await sendUserMessageService(
              workspace.id,
              threadId,
              finalText,
              {
                model: modelForSend,
                effort: resolvedEffort,
                collaborationMode: sanitizedCollaborationMode,
                accessMode: resolvedAccessMode,
                images,
                preferredLanguage,
              },
            )) as Record<string, unknown>;
        }

        onDebug?.({
          id: `${Date.now()}-server-turn-start`,
          timestamp: Date.now(),
          source: "server",
          label: "turn/start response",
          payload: response,
        });
        const rpcError = extractRpcErrorMessage(response);
        if (rpcError) {
          markProcessing(threadId, false);
          setActiveTurnId(threadId, null);
          pushThreadErrorMessage(threadId, t("threads.turnFailedToStartWithMessage", { message: rpcError }));
          safeMessageActivity();
          return;
        }
        const result = (response?.result ?? response) as Record<string, unknown>;
        const turn = (result?.turn ?? response?.turn ?? null) as
          | Record<string, unknown>
          | null;
        const turnId = asString(turn?.id ?? "");
        if (!turnId) {
          markProcessing(threadId, false);
          setActiveTurnId(threadId, null);
          pushThreadErrorMessage(threadId, t("threads.turnFailedToStart"));
          safeMessageActivity();
          return;
        }
        setActiveTurnId(threadId, turnId);

        if (!cliEngine && autoNameThread && !getCustomName(workspace.id, threadId)) {
          onDebug?.({
            id: `${Date.now()}-thread-title-trigger-codex`,
            timestamp: Date.now(),
            source: "client",
            label: "thread/title trigger",
            payload: { workspaceId: workspace.id, threadId, engine: "codex" },
          });
          void autoNameThread(workspace.id, threadId, finalText, {
            clearPendingOnSkip: true,
          }).catch((error) => {
            onDebug?.({
              id: `${Date.now()}-thread-title-trigger-codex-error`,
              timestamp: Date.now(),
              source: "error",
              label: "thread/title trigger error",
              payload: error instanceof Error ? error.message : String(error),
            });
          });
        }
      } catch (error) {
        markProcessing(threadId, false);
        setActiveTurnId(threadId, null);
        onDebug?.({
          id: `${Date.now()}-client-turn-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "turn/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
      }
    },
    [
      accessMode,
      activeEngine,
      collaborationMode,
      customPrompts,
      dispatch,
      effort,
      getCustomName,
      markProcessing,
      model,
      onDebug,
      pushThreadErrorMessage,
      recordThreadActivity,
      resolveThreadEngine,
      resolveOpenCodeAgent,
      resolveOpenCodeVariant,
      safeMessageActivity,
      setActiveTurnId,
      autoNameThread,
      steerEnabled,
      t,
      threadStatusById,
    ],
  );

  const sendUserMessage = useCallback(
    async (text: string, images: string[] = []) => {
      if (!activeWorkspace) {
        return;
      }
      const messageText = text.trim();
      if (!messageText && images.length === 0) {
        return;
      }
      const promptExpansion = expandCustomPromptText(messageText, customPrompts);
      if (promptExpansion && "error" in promptExpansion) {
        if (activeThreadId) {
          pushThreadErrorMessage(activeThreadId, promptExpansion.error);
          safeMessageActivity();
        } else {
          onDebug?.({
            id: `${Date.now()}-client-prompt-expand-error`,
            timestamp: Date.now(),
            source: "error",
            label: "prompt/expand error",
            payload: promptExpansion.error,
          });
        }
        return;
      }
      const finalText = promptExpansion?.expanded ?? messageText;

      // Detect engine switch from the selected engine to thread ownership.
      const currentEngine = normalizeEngineSelection(activeEngine);
      if (activeThreadId) {
        const storedThreadEngine = getThreadEngine(activeWorkspace.id, activeThreadId);
        const threadEngine = resolveThreadEngine(activeWorkspace.id, activeThreadId);
        const threadIdCompatible = isThreadIdCompatibleWithEngine(
          currentEngine,
          activeThreadId,
        );
        // If current thread differs from current selection, or threadId prefix is incompatible, create a new thread.
        if (threadEngine !== currentEngine || !threadIdCompatible) {
          onDebug?.({
            id: `${Date.now()}-client-engine-switch`,
            timestamp: Date.now(),
            source: "client",
            label: "engine/switch",
            payload: {
              workspaceId: activeWorkspace.id,
              oldThreadId: activeThreadId,
              oldEngineFromStore: storedThreadEngine ?? null,
              oldEngine: threadEngine,
              newEngine: currentEngine,
              threadIdCompatible,
            },
          });
          // Create a new thread with the current engine
          const newThreadId = await startThreadForWorkspace(activeWorkspace.id, {
            activate: true,
            engine: currentEngine,
          });
          if (!newThreadId) {
            return;
          }
          // Send message to the new thread
          await sendMessageToThread(activeWorkspace, newThreadId, finalText, images, {
            skipPromptExpansion: true,
          });
          return;
        }
      }

      // No engine switch, proceed normally
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      await sendMessageToThread(activeWorkspace, threadId, finalText, images, {
        skipPromptExpansion: true,
      });
    },
    [
      activeEngine,
      activeThreadId,
      activeWorkspace,
      customPrompts,
      ensureThreadForActiveWorkspace,
      isThreadIdCompatibleWithEngine,
      normalizeEngineSelection,
      onDebug,
      pushThreadErrorMessage,
      resolveThreadEngine,
      safeMessageActivity,
      sendMessageToThread,
      startThreadForWorkspace,
    ],
  );

  const sendUserMessageToThread = useCallback(
    async (
      workspace: WorkspaceInfo,
      threadId: string,
      text: string,
      images: string[] = [],
      options?: SendMessageOptions,
    ) => {
      await sendMessageToThread(workspace, threadId, text, images, options);
    },
    [sendMessageToThread],
  );

  const interruptTurn = useCallback(async () => {
    if (!activeWorkspace || !activeThreadId) {
      return;
    }
    const activeTurnId = activeTurnIdByThread[activeThreadId] ?? null;
    const turnId = activeTurnId ?? "pending";
    // Mark this thread as interrupted so late-arriving delta events are ignored
    interruptedThreadsRef.current.add(activeThreadId);
    markProcessing(activeThreadId, false);
    setActiveTurnId(activeThreadId, null);
    dispatch({
      type: "addAssistantMessage",
      threadId: activeThreadId,
      text: t("threads.sessionStopped"),
    });
    if (!activeTurnId) {
      pendingInterruptsRef.current.add(activeThreadId);
    }

    // Determine if this is a Claude session
    const resolvedThreadEngine = resolveThreadEngine(activeWorkspace.id, activeThreadId);
    const isCliManagedEngine = resolvedThreadEngine !== "codex";

    onDebug?.({
      id: `${Date.now()}-client-turn-interrupt`,
      timestamp: Date.now(),
      source: "client",
      label: "turn/interrupt",
      payload: {
        workspaceId: activeWorkspace.id,
        threadId: activeThreadId,
        turnId,
        queued: !activeTurnId,
        engine: resolvedThreadEngine,
      },
    });
    try {
      if (isCliManagedEngine) {
        // Claude/OpenCode: kill the local CLI process via engine_interrupt.
        await engineInterruptService(activeWorkspace.id);
      } else {
        // Codex: notify daemon via turn_interrupt RPC, plus engine_interrupt fallback.
        await Promise.allSettled([
          interruptTurnService(
            activeWorkspace.id,
            activeThreadId,
            turnId,
          ),
          engineInterruptService(activeWorkspace.id),
        ]);
      }
      onDebug?.({
        id: `${Date.now()}-server-turn-interrupt`,
        timestamp: Date.now(),
        source: "server",
        label: "turn/interrupt response",
        payload: { success: true },
      });
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-turn-interrupt-error`,
        timestamp: Date.now(),
        source: "error",
        label: "turn/interrupt error",
        payload: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    activeThreadId,
    activeTurnIdByThread,
    activeWorkspace,
    dispatch,
    interruptedThreadsRef,
    markProcessing,
    onDebug,
    pendingInterruptsRef,
    resolveThreadEngine,
    setActiveTurnId,
    t,
  ]);

  const startReviewTarget = useCallback(
    async (target: ReviewTarget, workspaceIdOverride?: string): Promise<boolean> => {
      const workspaceId = workspaceIdOverride ?? activeWorkspace?.id ?? null;
      if (!workspaceId) {
        return false;
      }
      const threadId = workspaceIdOverride
        ? await ensureThreadForWorkspace(workspaceId)
        : await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return false;
      }

      markProcessing(threadId, true);
      markReviewing(threadId, true);
      safeMessageActivity();
      onDebug?.({
        id: `${Date.now()}-client-review-start`,
        timestamp: Date.now(),
        source: "client",
        label: "review/start",
        payload: {
          workspaceId,
          threadId,
          target,
        },
      });
      try {
        const response = await startReviewService(
          workspaceId,
          threadId,
          target,
          "inline",
        );
        onDebug?.({
          id: `${Date.now()}-server-review-start`,
          timestamp: Date.now(),
          source: "server",
          label: "review/start response",
          payload: response,
        });
        const rpcError = extractRpcErrorMessage(response);
        if (rpcError) {
          markProcessing(threadId, false);
          markReviewing(threadId, false);
          setActiveTurnId(threadId, null);
          pushThreadErrorMessage(threadId, `Review failed to start: ${rpcError}`);
          safeMessageActivity();
          return false;
        }
        return true;
      } catch (error) {
        markProcessing(threadId, false);
        markReviewing(threadId, false);
        onDebug?.({
          id: `${Date.now()}-client-review-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "review/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
        return false;
      }
    },
    [
      activeWorkspace,
      ensureThreadForActiveWorkspace,
      ensureThreadForWorkspace,
      markProcessing,
      markReviewing,
      onDebug,
      pushThreadErrorMessage,
      safeMessageActivity,
      setActiveTurnId,
    ],
  );

  const {
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
  } = useReviewPrompt({
    activeWorkspace,
    activeThreadId,
    onDebug,
    startReviewTarget,
  });

  const startReview = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !text.trim()) {
        return;
      }
      const trimmed = text.trim();
      const rest = trimmed.replace(/^\/review\b/i, "").trim();
      if (!rest) {
        openReviewPrompt();
        return;
      }

      const target = parseReviewTarget(trimmed);
      await startReviewTarget(target);
    },
    [
      activeWorkspace,
      openReviewPrompt,
      startReviewTarget,
    ],
  );

  const startStatus = useCallback(
    async (text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      const resolvedThreadEngine = resolveThreadEngine(activeWorkspace.id, threadId);
      if (resolvedThreadEngine === "opencode") {
        try {
          const match = text.trim().match(/^\/status(?:\s+(\d+))?/i);
          const days = match?.[1] ? Number(match[1]) : null;
          const stats = await getOpenCodeStatsService(
            activeWorkspace.id,
            Number.isFinite(days as number) ? (days as number) : null,
          );
          const timestamp = Date.now();
          recordThreadActivity(activeWorkspace.id, threadId, timestamp);
          dispatch({
            type: "addAssistantMessage",
            threadId,
            text: `OpenCode stats:\n\n${stats}`,
          });
          safeMessageActivity();
        } catch (error) {
          pushThreadErrorMessage(
            threadId,
            error instanceof Error ? error.message : String(error),
          );
          safeMessageActivity();
        }
        return;
      }

      const rateLimits = rateLimitsByWorkspace[activeWorkspace.id] ?? null;
      const primaryUsed = rateLimits?.primary?.usedPercent;
      const secondaryUsed = rateLimits?.secondary?.usedPercent;
      const primaryReset = rateLimits?.primary?.resetsAt;
      const secondaryReset = rateLimits?.secondary?.resetsAt;
      const credits = rateLimits?.credits ?? null;

      const normalizeReset = (value?: number | null) => {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return null;
        }
        return value > 1_000_000_000_000 ? value : value * 1000;
      };

      const resetLabel = (value?: number | null) => {
        const resetAt = normalizeReset(value);
        return resetAt ? formatRelativeTime(resetAt) : null;
      };

      const collabId =
        collaborationMode &&
        typeof collaborationMode === "object" &&
        "settings" in collaborationMode &&
        collaborationMode.settings &&
        typeof collaborationMode.settings === "object" &&
        "id" in collaborationMode.settings
          ? String(collaborationMode.settings.id ?? "")
          : "";

      const lines = [
        "Session status:",
        `- Model: ${model ?? "default"}`,
        `- Reasoning effort: ${effort ?? "default"}`,
        `- Access: ${accessMode ?? "current"}`,
        `- Collaboration: ${collabId || "off"}`,
      ];

      if (typeof primaryUsed === "number") {
        const reset = resetLabel(primaryReset);
        lines.push(
          `- Session usage: ${Math.round(primaryUsed)}%${
            reset ? ` (resets ${reset})` : ""
          }`,
        );
      }
      if (typeof secondaryUsed === "number") {
        const reset = resetLabel(secondaryReset);
        lines.push(
          `- Weekly usage: ${Math.round(secondaryUsed)}%${
            reset ? ` (resets ${reset})` : ""
          }`,
        );
      }
      if (credits?.hasCredits) {
        if (credits.unlimited) {
          lines.push("- Credits: unlimited");
        } else if (credits.balance) {
          lines.push(`- Credits: ${credits.balance}`);
        }
      }

      const timestamp = Date.now();
      recordThreadActivity(activeWorkspace.id, threadId, timestamp);
      dispatch({
        type: "addAssistantMessage",
        threadId,
        text: lines.join("\n"),
      });
      safeMessageActivity();
    },
    [
      accessMode,
      activeWorkspace,
      collaborationMode,
      dispatch,
      effort,
      ensureThreadForActiveWorkspace,
      model,
      pushThreadErrorMessage,
      rateLimitsByWorkspace,
      recordThreadActivity,
      resolveThreadEngine,
      safeMessageActivity,
    ],
  );

  const resolveOpenCodeSessionId = useCallback((threadId: string, text: string): string | null => {
    if (threadId.startsWith("opencode:")) {
      return threadId.slice("opencode:".length);
    }
    const args = text.trim().split(/\s+/).slice(1);
    return args[0] ?? null;
  }, []);

  const normalizeCommandArg = useCallback((value: string) => {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }, []);

  const resolveFileUri = useCallback(
    (rawPath: string) => {
      const cleaned = normalizeCommandArg(rawPath);
      if (cleaned.startsWith("file://")) {
        return cleaned;
      }
      if (!activeWorkspace) {
        return cleaned;
      }
      const absolutePath = cleaned.startsWith("/")
        ? cleaned
        : `${activeWorkspace.path.replace(/\/$/, "")}/${cleaned}`;
      return `file://${encodeURI(absolutePath)}`;
    },
    [activeWorkspace, normalizeCommandArg],
  );

  const startExport = useCallback(
    async (text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      const sessionId = resolveOpenCodeSessionId(threadId, text);
      if (!sessionId) {
        pushThreadErrorMessage(
          threadId,
          "OpenCode export requires an opencode session. Open an OpenCode thread first.",
        );
        safeMessageActivity();
        return;
      }
      try {
        const pathArg = text.trim().split(/\s+/).slice(2).join(" ").trim();
        const outputPath = pathArg.length > 0 ? pathArg : null;
        const result = await exportOpenCodeSessionService(
          activeWorkspace.id,
          sessionId,
          outputPath,
        );
        const timestamp = Date.now();
        recordThreadActivity(activeWorkspace.id, threadId, timestamp);
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: `Session exported:\n- session: ${result.sessionId}\n- file: ${result.filePath}`,
        });
        safeMessageActivity();
      } catch (error) {
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      pushThreadErrorMessage,
      recordThreadActivity,
      resolveOpenCodeSessionId,
      safeMessageActivity,
    ],
  );

  const startShare = useCallback(
    async (text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      const sessionId = resolveOpenCodeSessionId(threadId, text);
      if (!sessionId) {
        pushThreadErrorMessage(
          threadId,
          "OpenCode share requires an opencode session. Open an OpenCode thread first.",
        );
        safeMessageActivity();
        return;
      }
      try {
        const result = await shareOpenCodeSessionService(activeWorkspace.id, sessionId);
        const timestamp = Date.now();
        recordThreadActivity(activeWorkspace.id, threadId, timestamp);
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: `Shared session link:\n${result.url}`,
        });
        safeMessageActivity();
      } catch (error) {
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      pushThreadErrorMessage,
      recordThreadActivity,
      resolveOpenCodeSessionId,
      safeMessageActivity,
    ],
  );

  const startImport = useCallback(
    async (text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      const source = normalizeCommandArg(
        text.trim().split(/\s+/).slice(1).join(" ").trim(),
      );
      if (!source) {
        pushThreadErrorMessage(
          threadId,
          "Usage: /import <path-or-url>",
        );
        safeMessageActivity();
        return;
      }
      try {
        const result = await importOpenCodeSessionService(activeWorkspace.id, source);
        const importedSessionId =
          typeof result.sessionId === "string" ? result.sessionId : null;
        const importedThreadId = importedSessionId
          ? `opencode:${importedSessionId}`
          : null;
        const timestamp = Date.now();
        recordThreadActivity(activeWorkspace.id, threadId, timestamp);
        if (importedThreadId) {
          dispatch({
            type: "ensureThread",
            workspaceId: activeWorkspace.id,
            threadId: importedThreadId,
            engine: "opencode",
          });
          dispatch({
            type: "setThreadEngine",
            workspaceId: activeWorkspace.id,
            threadId: importedThreadId,
            engine: "opencode",
          });
          dispatch({
            type: "setThreadTimestamp",
            workspaceId: activeWorkspace.id,
            threadId: importedThreadId,
            timestamp,
          });
          dispatch({
            type: "addAssistantMessage",
            threadId: importedThreadId,
            text: `Imported from ${source}`,
          });
        }
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: importedSessionId
            ? `Session imported:\n- session: ${importedSessionId}\n- source: ${source}`
            : `Session import completed:\n- source: ${source}\n- output: ${result.output}`,
        });
      } catch (error) {
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      normalizeCommandArg,
      pushThreadErrorMessage,
      recordThreadActivity,
      safeMessageActivity,
    ],
  );

  const startMcp = useCallback(
    async (_text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }

      try {
        const resolvedThreadEngine = resolveThreadEngine(activeWorkspace.id, threadId);
        if (resolvedThreadEngine === "opencode") {
          const response = await getOpenCodeMcpStatusService(activeWorkspace.id);
          const text = (response.text ?? "").trim();
          const timestamp = Date.now();
          recordThreadActivity(activeWorkspace.id, threadId, timestamp);
          dispatch({
            type: "addAssistantMessage",
            threadId,
            text: text
              ? `OpenCode MCP status:\n${text}`
              : "OpenCode MCP status: no output.",
          });
          return;
        }

        const response = (await listMcpServerStatusService(
          activeWorkspace.id,
          null,
          null,
        )) as Record<string, unknown> | null;
        const result = (response?.result ?? response) as
          | Record<string, unknown>
          | null;
        const data = Array.isArray(result?.data)
          ? (result?.data as Array<Record<string, unknown>>)
          : [];

        const lines: string[] = ["MCP tools:"];
        if (data.length === 0) {
          lines.push("- No MCP servers configured.");
        } else {
          const servers = [...data].sort((a, b) =>
            String(a.name ?? "").localeCompare(String(b.name ?? "")),
          );
          for (const server of servers) {
            const name = String(server.name ?? "unknown");
            const authStatus = server.authStatus ?? server.auth_status ?? null;
            const authLabel =
              typeof authStatus === "string"
                ? authStatus
                : authStatus &&
                    typeof authStatus === "object" &&
                    "status" in authStatus
                  ? String((authStatus as { status?: unknown }).status ?? "")
                  : "";
            lines.push(`- ${name}${authLabel ? ` (auth: ${authLabel})` : ""}`);

            const toolsRecord =
              server.tools && typeof server.tools === "object"
                ? (server.tools as Record<string, unknown>)
                : {};
            const prefix = `mcp__${name}__`;
            const toolNames = Object.keys(toolsRecord)
              .map((toolName) =>
                toolName.startsWith(prefix)
                  ? toolName.slice(prefix.length)
                  : toolName,
              )
              .sort((a, b) => a.localeCompare(b));
            lines.push(
              toolNames.length > 0
                ? `  tools: ${toolNames.join(", ")}`
                : "  tools: none",
            );

            const resources = Array.isArray(server.resources)
              ? server.resources.length
              : 0;
            const templates = Array.isArray(server.resourceTemplates)
              ? server.resourceTemplates.length
              : Array.isArray(server.resource_templates)
                ? server.resource_templates.length
                : 0;
            if (resources > 0 || templates > 0) {
              lines.push(`  resources: ${resources}, templates: ${templates}`);
            }
          }
        }

        const timestamp = Date.now();
        recordThreadActivity(activeWorkspace.id, threadId, timestamp);
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: lines.join("\n"),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load MCP status.";
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: `MCP tools:\n- ${message}`,
        });
      } finally {
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      recordThreadActivity,
      resolveThreadEngine,
      safeMessageActivity,
    ],
  );

  const startLsp = useCallback(
    async (text: string) => {
      if (!activeWorkspace) {
        return;
      }
      const threadId = await ensureThreadForActiveWorkspace();
      if (!threadId) {
        return;
      }
      const resolvedThreadEngine = resolveThreadEngine(activeWorkspace.id, threadId);
      if (resolvedThreadEngine !== "opencode") {
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: "LSP command is currently supported only for OpenCode.",
        });
        safeMessageActivity();
        return;
      }

      const rest = text.trim().replace(/^\/lsp\b/i, "").trim();
      const [sub, ...parts] = rest.split(/\s+/);
      const arg = normalizeCommandArg(parts.join(" ").trim());
      if (!sub) {
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: "Usage: /lsp <diagnostics|symbols|document-symbols> <arg>",
        });
        safeMessageActivity();
        return;
      }

      try {
        let payload: unknown;
        let heading = "";
        if (sub === "diagnostics") {
          if (!arg) {
            throw new Error("Usage: /lsp diagnostics <file-path>");
          }
          const response = await getOpenCodeLspDiagnosticsService(
            activeWorkspace.id,
            arg,
          );
          heading = `LSP diagnostics (${arg})`;
          payload = response.result;
        } else if (sub === "symbols") {
          if (!arg) {
            throw new Error("Usage: /lsp symbols <query>");
          }
          const response = await getOpenCodeLspSymbolsService(
            activeWorkspace.id,
            arg,
          );
          heading = `LSP symbols (${arg})`;
          payload = response.result;
        } else if (sub === "document-symbols") {
          if (!arg) {
            throw new Error("Usage: /lsp document-symbols <file-path-or-file-uri>");
          }
          const fileUri = resolveFileUri(arg);
          const response = await getOpenCodeLspDocumentSymbolsService(
            activeWorkspace.id,
            fileUri,
          );
          heading = `LSP document symbols (${fileUri})`;
          payload = response.result;
        } else {
          throw new Error(
            "Unknown LSP command. Use diagnostics, symbols, or document-symbols.",
          );
        }

        const rendered =
          typeof payload === "string"
            ? payload
            : JSON.stringify(payload ?? null, null, 2);
        const timestamp = Date.now();
        recordThreadActivity(activeWorkspace.id, threadId, timestamp);
        dispatch({
          type: "addAssistantMessage",
          threadId,
          text: `${heading}:\n${rendered}`,
        });
      } catch (error) {
        pushThreadErrorMessage(
          threadId,
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        safeMessageActivity();
      }
    },
    [
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      normalizeCommandArg,
      pushThreadErrorMessage,
      recordThreadActivity,
      resolveFileUri,
      resolveThreadEngine,
      safeMessageActivity,
    ],
  );

  const startFork = useCallback(
    async (text: string) => {
      if (!activeWorkspace || !activeThreadId) {
        return;
      }
      const trimmed = text.trim();
      const rest = trimmed.replace(/^\/fork\b/i, "").trim();
      const threadId = await forkThreadForWorkspace(activeWorkspace.id, activeThreadId);
      if (!threadId) {
        return;
      }
      updateThreadParent(activeThreadId, [threadId]);
      if (rest) {
        await sendMessageToThread(activeWorkspace, threadId, rest, []);
      }
    },
    [
      activeThreadId,
      activeWorkspace,
      forkThreadForWorkspace,
      sendMessageToThread,
      updateThreadParent,
    ],
  );

  const startResume = useCallback(
    async (text: string) => {
      if (!activeWorkspace) {
        return;
      }
      if (activeThreadId && threadStatusById[activeThreadId]?.isProcessing) {
        return;
      }
      const resumeTargetRaw = text.trim().replace(/^\/resume\b/i, "").trim();
      let threadId: string | null = null;
      if (resumeTargetRaw.length > 0) {
        const sessionId = resumeTargetRaw.split(/\s+/)[0] ?? "";
        if (sessionId) {
          const targetThreadId = sessionId.startsWith("opencode:")
            ? sessionId
            : `opencode:${sessionId}`;
          const timestamp = Date.now();
          dispatch({
            type: "ensureThread",
            workspaceId: activeWorkspace.id,
            threadId: targetThreadId,
            engine: "opencode",
          });
          dispatch({
            type: "setThreadEngine",
            workspaceId: activeWorkspace.id,
            threadId: targetThreadId,
            engine: "opencode",
          });
          dispatch({
            type: "setThreadTimestamp",
            workspaceId: activeWorkspace.id,
            threadId: targetThreadId,
            timestamp,
          });
          dispatch({
            type: "setActiveThreadId",
            workspaceId: activeWorkspace.id,
            threadId: targetThreadId,
          });
          threadId = targetThreadId;
        }
      }
      if (!threadId) {
        threadId = activeThreadId ?? (await ensureThreadForActiveWorkspace());
      }
      if (!threadId) {
        return;
      }
      await refreshThread(activeWorkspace.id, threadId);
      safeMessageActivity();
    },
    [
      activeThreadId,
      activeWorkspace,
      dispatch,
      ensureThreadForActiveWorkspace,
      refreshThread,
      safeMessageActivity,
      threadStatusById,
    ],
  );

  return {
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
  };
}
