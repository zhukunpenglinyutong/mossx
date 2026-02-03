import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject } from "react";
import type {
  ConversationItem,
  DebugEntry,
  ThreadSummary,
  WorkspaceInfo,
} from "../../../types";
import {
  archiveThread as archiveThreadService,
  forkThread as forkThreadService,
  listThreads as listThreadsService,
  listClaudeSessions as listClaudeSessionsService,
  loadClaudeSession as loadClaudeSessionService,
  resumeThread as resumeThreadService,
  startThread as startThreadService,
} from "../../../services/tauri";
import {
  buildItemsFromThread,
  getThreadTimestamp,
  isReviewingFromThread,
  mergeThreadItems,
  previewThreadName,
} from "../../../utils/threadItems";
import {
  asString,
  normalizeRootPath,
} from "../utils/threadNormalize";
import { saveThreadActivity } from "../utils/threadStorage";
import type { ThreadAction, ThreadState } from "./useThreadsReducer";

type UseThreadActionsOptions = {
  dispatch: Dispatch<ThreadAction>;
  itemsByThread: ThreadState["itemsByThread"];
  threadsByWorkspace: ThreadState["threadsByWorkspace"];
  activeThreadIdByWorkspace: ThreadState["activeThreadIdByWorkspace"];
  threadListCursorByWorkspace: ThreadState["threadListCursorByWorkspace"];
  threadStatusById: ThreadState["threadStatusById"];
  onDebug?: (entry: DebugEntry) => void;
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  threadActivityRef: MutableRefObject<Record<string, Record<string, number>>>;
  loadedThreadsRef: MutableRefObject<Record<string, boolean>>;
  replaceOnResumeRef: MutableRefObject<Record<string, boolean>>;
  applyCollabThreadLinksFromThread: (
    threadId: string,
    thread: Record<string, unknown>,
  ) => void;
};

export function useThreadActions({
  dispatch,
  itemsByThread,
  threadsByWorkspace,
  activeThreadIdByWorkspace,
  threadListCursorByWorkspace,
  threadStatusById,
  onDebug,
  getCustomName,
  threadActivityRef,
  loadedThreadsRef,
  replaceOnResumeRef,
  applyCollabThreadLinksFromThread,
}: UseThreadActionsOptions) {
  // Map workspaceId → filesystem path, populated in listThreadsForWorkspace
  const workspacePathsByIdRef = useRef<Record<string, string>>({});

  const extractThreadId = useCallback((response: Record<string, any>) => {
    const thread = response.result?.thread ?? response.thread ?? null;
    return String(thread?.id ?? "");
  }, []);

  const startThreadForWorkspace = useCallback(
    async (workspaceId: string, options?: { activate?: boolean; engine?: "claude" | "codex" | "gemini" | "opencode" }) => {
      const shouldActivate = options?.activate !== false;
      const engine = options?.engine;

      // For Claude engine, generate a local thread ID (the actual session_id
      // will be assigned when the first message is sent and Claude responds)
      if (engine === "claude") {
        const threadId = `claude-pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        onDebug?.({
          id: `${Date.now()}-client-thread-start`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/start (claude)",
          payload: { workspaceId, threadId },
        });
        dispatch({ type: "ensureThread", workspaceId, threadId, engine: "claude" });
        if (shouldActivate) {
          dispatch({ type: "setActiveThreadId", workspaceId, threadId });
        }
        loadedThreadsRef.current[threadId] = true;
        return threadId;
      }

      // For Codex and other engines, use the standard start_thread RPC
      onDebug?.({
        id: `${Date.now()}-client-thread-start`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/start",
        payload: { workspaceId },
      });
      try {
        const response = await startThreadService(workspaceId);
        onDebug?.({
          id: `${Date.now()}-server-thread-start`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/start response",
          payload: response,
        });
        const threadId = extractThreadId(response);
        if (threadId) {
          dispatch({ type: "ensureThread", workspaceId, threadId, engine: "codex" });
          if (shouldActivate) {
            dispatch({ type: "setActiveThreadId", workspaceId, threadId });
          }
          loadedThreadsRef.current[threadId] = true;
          return threadId;
        }
        return null;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-start-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/start error",
          payload: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    [dispatch, extractThreadId, loadedThreadsRef, onDebug],
  );

  const resumeThreadForWorkspace = useCallback(
    async (
      workspaceId: string,
      threadId: string,
      force = false,
      replaceLocal = false,
    ) => {
      if (!threadId) {
        return null;
      }
      // Claude sessions don't use Codex thread/resume RPC —
      // load message history from JSONL and populate the thread
      if (threadId.startsWith("claude:")) {
        dispatch({ type: "ensureThread", workspaceId, threadId, engine: "claude" });
        const workspacePath = workspacePathsByIdRef.current[workspaceId];
        if (workspacePath && !loadedThreadsRef.current[threadId]) {
          const realSessionId = threadId.slice("claude:".length);
          try {
            const result = await loadClaudeSessionService(
              workspacePath,
              realSessionId,
            );
            // Handle both new format { messages, usage } and old format (array)
            const messagesData = (result as { messages?: unknown }).messages ?? result;
            const usageData = (result as { usage?: unknown }).usage as {
              inputTokens?: number;
              outputTokens?: number;
              cacheCreationInputTokens?: number;
              cacheReadInputTokens?: number;
            } | undefined;

            const items: ConversationItem[] = [];
            const arr = Array.isArray(messagesData) ? messagesData : [];
            for (const msg of arr) {
              if (msg.kind === "message") {
                items.push({
                  id: msg.id,
                  kind: "message",
                  role: msg.role === "user" ? "user" : "assistant",
                  text: msg.text ?? "",
                });
              } else if (msg.kind === "reasoning") {
                items.push({
                  id: msg.id,
                  kind: "reasoning",
                  summary: (msg.text ?? "").slice(0, 100),
                  content: msg.text ?? "",
                });
              } else if (msg.kind === "tool") {
                items.push({
                  id: msg.id,
                  kind: "tool",
                  toolType: msg.toolType ?? "unknown",
                  title: msg.title ?? "Tool",
                  detail: msg.text ?? "",
                });
              }
            }
            if (items.length > 0) {
              dispatch({ type: "setThreadItems", threadId, items });
            }

            // Dispatch usage data if available
            if (usageData && (usageData.inputTokens || usageData.outputTokens)) {
              const cachedTokens = (usageData.cacheCreationInputTokens ?? 0) + (usageData.cacheReadInputTokens ?? 0);
              dispatch({
                type: "setThreadTokenUsage",
                threadId,
                tokenUsage: {
                  total: {
                    inputTokens: usageData.inputTokens ?? 0,
                    outputTokens: usageData.outputTokens ?? 0,
                    cachedInputTokens: cachedTokens,
                    totalTokens: (usageData.inputTokens ?? 0) + (usageData.outputTokens ?? 0),
                    reasoningOutputTokens: 0,
                  },
                  last: {
                    inputTokens: usageData.inputTokens ?? 0,
                    outputTokens: usageData.outputTokens ?? 0,
                    cachedInputTokens: cachedTokens,
                    totalTokens: (usageData.inputTokens ?? 0) + (usageData.outputTokens ?? 0),
                    reasoningOutputTokens: 0,
                  },
                  modelContextWindow: 200000, // Default Claude context window
                },
              });
            }
          } catch {
            // Failed to load Claude session history — not fatal
          }
        }
        loadedThreadsRef.current[threadId] = true;
        return threadId;
      }
      if (!force && loadedThreadsRef.current[threadId]) {
        return threadId;
      }
      const status = threadStatusById[threadId];
      if (status?.isProcessing && loadedThreadsRef.current[threadId] && !force) {
        onDebug?.({
          id: `${Date.now()}-client-thread-resume-skipped`,
          timestamp: Date.now(),
          source: "client",
          label: "thread/resume skipped",
          payload: { workspaceId, threadId, reason: "active-turn" },
        });
        return threadId;
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-resume`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/resume",
        payload: { workspaceId, threadId },
      });
      try {
        const response =
          (await resumeThreadService(workspaceId, threadId)) as
            | Record<string, unknown>
            | null;
        onDebug?.({
          id: `${Date.now()}-server-thread-resume`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/resume response",
          payload: response,
        });
        const result = (response?.result ?? response) as
          | Record<string, unknown>
          | null;
        const thread = (result?.thread ?? response?.thread ?? null) as
          | Record<string, unknown>
          | null;
        if (thread) {
          dispatch({ type: "ensureThread", workspaceId, threadId, engine: "codex" });
          applyCollabThreadLinksFromThread(threadId, thread);
          const items = buildItemsFromThread(thread);
          const localItems = itemsByThread[threadId] ?? [];
          const shouldReplace =
            replaceLocal || replaceOnResumeRef.current[threadId] === true;
          if (shouldReplace) {
            replaceOnResumeRef.current[threadId] = false;
          }
          if (localItems.length > 0 && !shouldReplace) {
            loadedThreadsRef.current[threadId] = true;
            return threadId;
          }
          const hasOverlap =
            items.length > 0 &&
            localItems.length > 0 &&
            items.some((item) => localItems.some((local) => local.id === item.id));
          const mergedItems =
            items.length > 0
              ? shouldReplace
                ? items
                : localItems.length > 0 && !hasOverlap
                  ? localItems
                  : mergeThreadItems(items, localItems)
              : localItems;
          if (mergedItems.length > 0) {
            dispatch({ type: "setThreadItems", threadId, items: mergedItems });
          }
          dispatch({
            type: "markReviewing",
            threadId,
            isReviewing: isReviewingFromThread(thread),
          });
          const preview = asString(thread?.preview ?? "");
          const customName = getCustomName(workspaceId, threadId);
          if (!customName && preview) {
            dispatch({
              type: "setThreadName",
              workspaceId,
              threadId,
              name: previewThreadName(preview, `Agent ${threadId.slice(0, 4)}`),
            });
          }
          const lastAgentMessage = [...mergedItems]
            .reverse()
            .find(
              (item) => item.kind === "message" && item.role === "assistant",
            ) as ConversationItem | undefined;
          const lastText =
            lastAgentMessage && lastAgentMessage.kind === "message"
              ? lastAgentMessage.text
              : preview;
          if (lastText) {
            dispatch({
              type: "setLastAgentMessage",
              threadId,
              text: lastText,
              timestamp: getThreadTimestamp(thread),
            });
          }
        }
        loadedThreadsRef.current[threadId] = true;
        return threadId;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-resume-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/resume error",
          payload: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [
      applyCollabThreadLinksFromThread,
      dispatch,
      getCustomName,
      itemsByThread,
      loadedThreadsRef,
      onDebug,
      replaceOnResumeRef,
      threadStatusById,
    ],
  );

  const forkThreadForWorkspace = useCallback(
    async (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return null;
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-fork`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/fork",
        payload: { workspaceId, threadId },
      });
      try {
        const response = await forkThreadService(workspaceId, threadId);
        onDebug?.({
          id: `${Date.now()}-server-thread-fork`,
          timestamp: Date.now(),
          source: "server",
          label: "thread/fork response",
          payload: response,
        });
        const forkedThreadId = extractThreadId(response);
        if (!forkedThreadId) {
          return null;
        }
        // Fork currently only works with Codex threads
        dispatch({ type: "ensureThread", workspaceId, threadId: forkedThreadId, engine: "codex" });
        dispatch({
          type: "setActiveThreadId",
          workspaceId,
          threadId: forkedThreadId,
        });
        loadedThreadsRef.current[forkedThreadId] = false;
        await resumeThreadForWorkspace(workspaceId, forkedThreadId, true, true);
        return forkedThreadId;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-fork-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/fork error",
          payload: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
    [dispatch, extractThreadId, loadedThreadsRef, onDebug, resumeThreadForWorkspace],
  );

  const refreshThread = useCallback(
    async (workspaceId: string, threadId: string) => {
      if (!threadId) {
        return null;
      }
      replaceOnResumeRef.current[threadId] = true;
      return resumeThreadForWorkspace(workspaceId, threadId, true, true);
    },
    [replaceOnResumeRef, resumeThreadForWorkspace],
  );

  const resetWorkspaceThreads = useCallback(
    (workspaceId: string) => {
      const threadIds = new Set<string>();
      const list = threadsByWorkspace[workspaceId] ?? [];
      list.forEach((thread) => threadIds.add(thread.id));
      const activeThread = activeThreadIdByWorkspace[workspaceId];
      if (activeThread) {
        threadIds.add(activeThread);
      }
      threadIds.forEach((threadId) => {
        loadedThreadsRef.current[threadId] = false;
      });
    },
    [activeThreadIdByWorkspace, loadedThreadsRef, threadsByWorkspace],
  );

  const listThreadsForWorkspace = useCallback(
    async (
      workspace: WorkspaceInfo,
      options?: {
        preserveState?: boolean;
      },
    ) => {
      // Store workspace path for Claude session loading
      workspacePathsByIdRef.current[workspace.id] = workspace.path;
      const preserveState = options?.preserveState ?? false;
      const workspacePath = normalizeRootPath(workspace.path);
      if (!preserveState) {
        dispatch({
          type: "setThreadListLoading",
          workspaceId: workspace.id,
          isLoading: true,
        });
        dispatch({
          type: "setThreadListCursor",
          workspaceId: workspace.id,
          cursor: null,
        });
      }
      onDebug?.({
        id: `${Date.now()}-client-thread-list`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/list",
        payload: { workspaceId: workspace.id, path: workspace.path },
      });
      try {
        const existingThreads = threadsByWorkspace[workspace.id] ?? [];
        const engineById = new Map(
          existingThreads.map((thread) => [thread.id, thread.engineSource]),
        );
        const knownActivityByThread = threadActivityRef.current[workspace.id] ?? {};
        const hasKnownActivity = Object.keys(knownActivityByThread).length > 0;
        const matchingThreads: Record<string, unknown>[] = [];
        const targetCount = 20;
        const pageSize = 20;
        const maxPagesWithoutMatch = hasKnownActivity ? Number.POSITIVE_INFINITY : 5;
        let pagesFetched = 0;
        let cursor: string | null = null;
        do {
          pagesFetched += 1;
          const response =
            (await listThreadsService(
              workspace.id,
              cursor,
              pageSize,
            )) as Record<string, unknown>;
          onDebug?.({
            id: `${Date.now()}-server-thread-list`,
            timestamp: Date.now(),
            source: "server",
            label: "thread/list response",
            payload: response,
          });
          const result = (response.result ?? response) as Record<string, unknown>;
          const data = Array.isArray(result?.data)
            ? (result.data as Record<string, unknown>[])
            : [];
          const nextCursor =
            (result?.nextCursor ?? result?.next_cursor ?? null) as string | null;
          matchingThreads.push(
            ...data.filter(
              (thread) =>
                normalizeRootPath(String(thread?.cwd ?? "")) === workspacePath,
            ),
          );
          cursor = nextCursor;
          if (matchingThreads.length === 0 && pagesFetched >= maxPagesWithoutMatch) {
            break;
          }
        } while (cursor && matchingThreads.length < targetCount);

        const uniqueById = new Map<string, Record<string, unknown>>();
        matchingThreads.forEach((thread) => {
          const id = String(thread?.id ?? "");
          if (id && !uniqueById.has(id)) {
            uniqueById.set(id, thread);
          }
        });
        const uniqueThreads = Array.from(uniqueById.values());
        const activityByThread = threadActivityRef.current[workspace.id] ?? {};
        const nextActivityByThread = { ...activityByThread };
        let didChangeActivity = false;
        uniqueThreads.forEach((thread) => {
          const threadId = String(thread?.id ?? "");
          if (!threadId) {
            return;
          }
          const timestamp = getThreadTimestamp(thread);
          if (timestamp > (nextActivityByThread[threadId] ?? 0)) {
            nextActivityByThread[threadId] = timestamp;
            didChangeActivity = true;
          }
        });
        if (didChangeActivity) {
          const next = {
            ...threadActivityRef.current,
            [workspace.id]: nextActivityByThread,
          };
          threadActivityRef.current = next;
          saveThreadActivity(next);
        }
        uniqueThreads.sort((a, b) => {
          const aId = String(a?.id ?? "");
          const bId = String(b?.id ?? "");
          const aCreated = getThreadTimestamp(a);
          const bCreated = getThreadTimestamp(b);
          const aActivity = Math.max(nextActivityByThread[aId] ?? 0, aCreated);
          const bActivity = Math.max(nextActivityByThread[bId] ?? 0, bCreated);
          return bActivity - aActivity;
        });
        const summaries = uniqueThreads
          .slice(0, targetCount)
          .map((thread, index) => {
            const id = String(thread?.id ?? "");
            const preview = asString(thread?.preview ?? "").trim();
            const customName = getCustomName(workspace.id, id);
            const fallbackName = `Agent ${index + 1}`;
            const name = customName
              ? customName
              : preview.length > 0
                ? preview.length > 38
                  ? `${preview.slice(0, 38)}…`
                  : preview
                : fallbackName;
            const engineSource = engineById.get(id) ?? ("codex" as const);
            return {
              id,
              name,
              updatedAt: getThreadTimestamp(thread),
              engineSource,
            };
          })
          .filter((entry) => entry.id);

        // Also fetch Claude Code sessions and merge them
        let allSummaries: ThreadSummary[] = summaries;
        try {
          const claudeResponse = await listClaudeSessionsService(
            workspace.path,
            20,
          );
          const claudeSessions = Array.isArray(claudeResponse)
            ? claudeResponse
            : [];
          const claudeSummaries: ThreadSummary[] = claudeSessions.map(
            (session: {
              sessionId: string;
              firstMessage: string;
              updatedAt: number;
            }) => ({
              id: `claude:${session.sessionId}`,
              name:
                getCustomName(workspace.id, `claude:${session.sessionId}`) ||
                session.firstMessage ||
                "Claude Session",
              updatedAt: session.updatedAt,
              engineSource: "claude" as const,
            }),
          );
          allSummaries = [...summaries, ...claudeSummaries].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          );
        } catch {
          // Claude sessions are optional — don't fail if unavailable
        }

        dispatch({
          type: "setThreads",
          workspaceId: workspace.id,
          threads: allSummaries,
        });
        dispatch({
          type: "setThreadListCursor",
          workspaceId: workspace.id,
          cursor,
        });
        uniqueThreads.forEach((thread) => {
          const threadId = String(thread?.id ?? "");
          const preview = asString(thread?.preview ?? "").trim();
          if (!threadId || !preview) {
            return;
          }
          dispatch({
            type: "setLastAgentMessage",
            threadId,
            text: preview,
            timestamp: getThreadTimestamp(thread),
          });
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-list-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/list error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!preserveState) {
          dispatch({
            type: "setThreadListLoading",
            workspaceId: workspace.id,
            isLoading: false,
          });
        }
      }
    },
    [dispatch, getCustomName, onDebug, threadActivityRef, threadsByWorkspace],
  );

  const loadOlderThreadsForWorkspace = useCallback(
    async (workspace: WorkspaceInfo) => {
      workspacePathsByIdRef.current[workspace.id] = workspace.path;
      const nextCursor = threadListCursorByWorkspace[workspace.id] ?? null;
      if (!nextCursor) {
        return;
      }
      const workspacePath = normalizeRootPath(workspace.path);
      const existing = threadsByWorkspace[workspace.id] ?? [];
      dispatch({
        type: "setThreadListPaging",
        workspaceId: workspace.id,
        isLoading: true,
      });
      onDebug?.({
        id: `${Date.now()}-client-thread-list-older`,
        timestamp: Date.now(),
        source: "client",
        label: "thread/list older",
        payload: { workspaceId: workspace.id, cursor: nextCursor },
      });
      try {
        const matchingThreads: Record<string, unknown>[] = [];
        const targetCount = 20;
        const pageSize = 20;
        const maxPagesWithoutMatch = 10;
        let pagesFetched = 0;
        let cursor: string | null = nextCursor;
        do {
          pagesFetched += 1;
          const response =
            (await listThreadsService(
              workspace.id,
              cursor,
              pageSize,
            )) as Record<string, unknown>;
          onDebug?.({
            id: `${Date.now()}-server-thread-list-older`,
            timestamp: Date.now(),
            source: "server",
            label: "thread/list older response",
            payload: response,
          });
          const result = (response.result ?? response) as Record<string, unknown>;
          const data = Array.isArray(result?.data)
            ? (result.data as Record<string, unknown>[])
            : [];
          const next =
            (result?.nextCursor ?? result?.next_cursor ?? null) as string | null;
          matchingThreads.push(
            ...data.filter(
              (thread) =>
                normalizeRootPath(String(thread?.cwd ?? "")) === workspacePath,
            ),
          );
          cursor = next;
          if (matchingThreads.length === 0 && pagesFetched >= maxPagesWithoutMatch) {
            break;
          }
        } while (cursor && matchingThreads.length < targetCount);

        const existingIds = new Set(existing.map((thread) => thread.id));
        const additions: ThreadSummary[] = [];
        matchingThreads.forEach((thread) => {
          const id = String(thread?.id ?? "");
          if (!id || existingIds.has(id)) {
            return;
          }
          const preview = asString(thread?.preview ?? "").trim();
          const customName = getCustomName(workspace.id, id);
          const fallbackName = `Agent ${existing.length + additions.length + 1}`;
          const name = customName
            ? customName
            : preview.length > 0
              ? preview.length > 38
                ? `${preview.slice(0, 38)}…`
                : preview
              : fallbackName;
          additions.push({ id, name, updatedAt: getThreadTimestamp(thread) });
          existingIds.add(id);
        });

        if (additions.length > 0) {
          dispatch({
            type: "setThreads",
            workspaceId: workspace.id,
            threads: [...existing, ...additions],
          });
        }
        dispatch({
          type: "setThreadListCursor",
          workspaceId: workspace.id,
          cursor,
        });
        matchingThreads.forEach((thread) => {
          const threadId = String(thread?.id ?? "");
          const preview = asString(thread?.preview ?? "").trim();
          if (!threadId || !preview) {
            return;
          }
          dispatch({
            type: "setLastAgentMessage",
            threadId,
            text: preview,
            timestamp: getThreadTimestamp(thread),
          });
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-list-older-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/list older error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        dispatch({
          type: "setThreadListPaging",
          workspaceId: workspace.id,
          isLoading: false,
        });
      }
    },
    [dispatch, getCustomName, onDebug, threadListCursorByWorkspace, threadsByWorkspace],
  );

  const archiveThread = useCallback(
    async (workspaceId: string, threadId: string) => {
      try {
        await archiveThreadService(workspaceId, threadId);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-thread-archive-error`,
          timestamp: Date.now(),
          source: "error",
          label: "thread/archive error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onDebug],
  );

  return {
    startThreadForWorkspace,
    forkThreadForWorkspace,
    resumeThreadForWorkspace,
    refreshThread,
    resetWorkspaceThreads,
    listThreadsForWorkspace,
    loadOlderThreadsForWorkspace,
    archiveThread,
  };
}
