import type { Dispatch, MutableRefObject } from "react";

import type { DebugEntry, ThreadSummary } from "../../../types";
import { archiveThread as archiveThreadService } from "../../../services/tauri";
import {
  deleteClaudeSession as deleteClaudeSessionService,
  deleteGeminiSession as deleteGeminiSessionService,
  deleteOpenCodeSession as deleteOpenCodeSessionService,
  deleteCodexSession as deleteCodexSessionService,
  renameThreadTitleKey as renameThreadTitleKeyService,
  setThreadTitle as setThreadTitleService,
} from "../../../services/tauri";
import { asNumber, asString } from "../utils/threadNormalize";
import {
  deleteSharedSession as deleteSharedSessionService,
  startSharedSession as startSharedSessionService,
} from "../../shared-session/services/sharedSessions";
import { normalizeSharedSessionEngine } from "../../shared-session/utils/sharedSessionEngines";

import type { ThreadAction } from "./useThreadsReducer";

type ExtractThreadId = (
  response: Record<string, unknown> | null | undefined,
) => string;

type OnDebug = (entry: DebugEntry) => void;

export function createStartSharedSessionForWorkspace(params: {
  dispatch: Dispatch<ThreadAction>;
  extractThreadId: ExtractThreadId;
  loadedThreadsRef: MutableRefObject<Record<string, boolean>>;
  onDebug?: OnDebug;
  threadsByWorkspace: Record<string, ThreadSummary[] | undefined>;
}) {
  const {
    dispatch,
    extractThreadId,
    loadedThreadsRef,
    onDebug,
    threadsByWorkspace,
  } = params;

  return async (
    workspaceId: string,
    options?: {
      activate?: boolean;
      initialEngine?: "claude" | "codex" | "gemini" | "opencode";
    },
  ) => {
    const shouldActivate = options?.activate !== false;
    const initialEngine = normalizeSharedSessionEngine(options?.initialEngine);
    onDebug?.({
      id: `${Date.now()}-client-shared-thread-start`,
      timestamp: Date.now(),
      source: "client",
      label: "shared-session/start",
      payload: { workspaceId, initialEngine },
    });
    const response = await startSharedSessionService(workspaceId, initialEngine);
    const threadId = extractThreadId(response);
    if (!threadId) {
      return null;
    }
    const result =
      response?.result && typeof response.result === "object"
        ? (response.result as Record<string, unknown>)
        : response;
    const thread =
      result?.thread && typeof result.thread === "object"
        ? (result.thread as Record<string, unknown>)
        : null;
    const summary: ThreadSummary = {
      id: threadId,
      name: asString(thread?.name).trim() || "Shared Session",
      updatedAt: asNumber(thread?.updatedAt ?? thread?.updated_at) || Date.now(),
      engineSource: initialEngine,
      threadKind: "shared",
      selectedEngine: initialEngine,
      nativeThreadIds: [],
    };
    dispatch({
      type: "setThreads",
      workspaceId,
      threads: [summary, ...(threadsByWorkspace[workspaceId] ?? [])],
    });
    if (shouldActivate) {
      dispatch({ type: "setActiveThreadId", workspaceId, threadId });
    }
    loadedThreadsRef.current[threadId] = true;
    return threadId;
  };
}

export function createArchiveThreadAction(params: { onDebug?: OnDebug }) {
  const { onDebug } = params;

  return async (workspaceId: string, threadId: string) => {
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
      throw error;
    }
  };
}

export function createArchiveClaudeThreadAction(params: {
  onDebug?: OnDebug;
  workspacePathsByIdRef: MutableRefObject<Record<string, string>>;
}) {
  const { onDebug, workspacePathsByIdRef } = params;

  return async (workspaceId: string, threadId: string) => {
    const sessionId = threadId.startsWith("claude:")
      ? threadId.slice("claude:".length)
      : threadId;
    const workspacePath = workspacePathsByIdRef.current[workspaceId];
    if (!workspacePath) {
      throw new Error("workspace not connected");
    }
    try {
      await deleteClaudeSessionService(workspacePath, sessionId);
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-claude-archive-error`,
        timestamp: Date.now(),
        source: "error",
        label: "claude/archive error",
        payload: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

export function createDeleteThreadForWorkspaceAction(params: {
  archiveClaudeThread: (workspaceId: string, threadId: string) => Promise<void>;
  threadsByWorkspace: Record<string, ThreadSummary[] | undefined>;
  workspacePathsByIdRef: MutableRefObject<Record<string, string>>;
}) {
  const { archiveClaudeThread, threadsByWorkspace, workspacePathsByIdRef } = params;

  return async (workspaceId: string, threadId: string) => {
    if (threadId.includes("-pending-")) {
      return;
    }
    const thread = (threadsByWorkspace[workspaceId] ?? []).find((entry) => entry.id === threadId);
    if (thread?.threadKind === "shared" || threadId.startsWith("shared:")) {
      await deleteSharedSessionService(workspaceId, threadId);
      return;
    }
    if (threadId.startsWith("claude:")) {
      await archiveClaudeThread(workspaceId, threadId);
      return;
    }
    if (threadId.startsWith("opencode:")) {
      const sessionId = threadId.slice("opencode:".length);
      await deleteOpenCodeSessionService(workspaceId, sessionId);
      return;
    }
    if (threadId.startsWith("gemini:")) {
      const sessionId = threadId.slice("gemini:".length);
      const workspacePath = workspacePathsByIdRef.current[workspaceId];
      if (!workspacePath) {
        throw new Error("workspace not connected");
      }
      await deleteGeminiSessionService(workspacePath, sessionId);
      return;
    }
    await deleteCodexSessionService(workspaceId, threadId);
  };
}

export function createRenameThreadTitleMappingAction(params: {
  getCustomName: (workspaceId: string, threadId: string) => string | undefined;
  onRenameThreadTitleMapping?: (
    workspaceId: string,
    oldThreadId: string,
    newThreadId: string,
  ) => void;
}) {
  const { getCustomName, onRenameThreadTitleMapping } = params;

  return async (workspaceId: string, oldThreadId: string, newThreadId: string) => {
    try {
      await renameThreadTitleKeyService(workspaceId, oldThreadId, newThreadId);
      onRenameThreadTitleMapping?.(workspaceId, oldThreadId, newThreadId);
    } catch {
      const previousName = getCustomName(workspaceId, oldThreadId);
      if (!previousName) {
        return;
      }
      try {
        await setThreadTitleService(workspaceId, newThreadId, previousName);
        onRenameThreadTitleMapping?.(workspaceId, oldThreadId, newThreadId);
      } catch {
        // Best-effort persistence; ignore mapping failures.
      }
    }
  };
}
