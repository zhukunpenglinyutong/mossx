import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  EngineType,
  MessageSendOptions,
  QueuedMessage,
  WorkspaceInfo,
} from "../../../types";

const OPENCODE_INFLIGHT_STALL_MS = 18_000;

type UseQueuedSendOptions = {
  activeThreadId: string | null;
  isProcessing: boolean;
  isReviewing: boolean;
  steerEnabled: boolean;
  activeWorkspace: WorkspaceInfo | null;
  activeEngine?: EngineType;
  connectWorkspace: (workspace: WorkspaceInfo) => Promise<void>;
  startThreadForWorkspace: (
    workspaceId: string,
    options?: { activate?: boolean; engine?: EngineType },
  ) => Promise<string | null>;
  sendUserMessage: (
    text: string,
    images?: string[],
    options?: MessageSendOptions,
  ) => Promise<void>;
  sendUserMessageToThread: (
    workspace: WorkspaceInfo,
    threadId: string,
    text: string,
    images?: string[],
    options?: MessageSendOptions,
  ) => Promise<void>;
  startFork: (text: string) => Promise<void>;
  startReview: (text: string) => Promise<void>;
  startResume: (text: string) => Promise<void>;
  startMcp: (text: string) => Promise<void>;
  startStatus: (text: string) => Promise<void>;
  startExport: (text: string) => Promise<void>;
  startImport: (text: string) => Promise<void>;
  startLsp: (text: string) => Promise<void>;
  startShare: (text: string) => Promise<void>;
  clearActiveImages: () => void;
};

type UseQueuedSendResult = {
  queuedByThread: Record<string, QueuedMessage[]>;
  activeQueue: QueuedMessage[];
  handleSend: (
    text: string,
    images?: string[],
    options?: MessageSendOptions,
  ) => Promise<void>;
  queueMessage: (
    text: string,
    images?: string[],
    options?: MessageSendOptions,
  ) => Promise<void>;
  removeQueuedMessage: (threadId: string, messageId: string) => void;
};

type SlashCommandKind =
  | "fork"
  | "mcp"
  | "new"
  | "resume"
  | "review"
  | "status"
  | "export"
  | "import"
  | "lsp"
  | "share";

function parseSlashCommand(text: string): SlashCommandKind | null {
  if (/^\/fork\b/i.test(text)) {
    return "fork";
  }
  if (/^\/mcp\b/i.test(text)) {
    return "mcp";
  }
  if (/^\/review\b/i.test(text)) {
    return "review";
  }
  if (/^\/new\b/i.test(text)) {
    return "new";
  }
  if (/^\/resume\b/i.test(text)) {
    return "resume";
  }
  if (/^\/status\b/i.test(text)) {
    return "status";
  }
  if (/^\/export\b/i.test(text)) {
    return "export";
  }
  if (/^\/import\b/i.test(text)) {
    return "import";
  }
  if (/^\/lsp\b/i.test(text)) {
    return "lsp";
  }
  if (/^\/share\b/i.test(text)) {
    return "share";
  }
  return null;
}

export function useQueuedSend({
  activeThreadId,
  isProcessing,
  isReviewing,
  steerEnabled,
  activeWorkspace,
  activeEngine = "claude",
  connectWorkspace,
  startThreadForWorkspace,
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
  clearActiveImages,
}: UseQueuedSendOptions): UseQueuedSendResult {
  const [queuedByThread, setQueuedByThread] = useState<
    Record<string, QueuedMessage[]>
  >({});
  const [inFlightByThread, setInFlightByThread] = useState<
    Record<string, QueuedMessage | null>
  >({});
  const [hasStartedByThread, setHasStartedByThread] = useState<
    Record<string, boolean>
  >({});

  const activeQueue = useMemo(
    () => (activeThreadId ? queuedByThread[activeThreadId] ?? [] : []),
    [activeThreadId, queuedByThread],
  );

  const enqueueMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [...(prev[threadId] ?? []), item],
    }));
  }, []);

  const removeQueuedMessage = useCallback(
    (threadId: string, messageId: string) => {
      setQueuedByThread((prev) => ({
        ...prev,
        [threadId]: (prev[threadId] ?? []).filter(
          (entry) => entry.id !== messageId,
        ),
      }));
    },
    [],
  );

  const prependQueuedMessage = useCallback((threadId: string, item: QueuedMessage) => {
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: [item, ...(prev[threadId] ?? [])],
    }));
  }, []);

  const runSlashCommand = useCallback(
    async (
      command: SlashCommandKind,
      trimmed: string,
      options?: MessageSendOptions,
    ) => {
      if (command === "fork") {
        await startFork(trimmed);
        return;
      }
      if (command === "review") {
        await startReview(trimmed);
        return;
      }
      if (command === "resume") {
        await startResume(trimmed);
        return;
      }
      if (command === "mcp") {
        await startMcp(trimmed);
        return;
      }
      if (command === "status") {
        await startStatus(trimmed);
        return;
      }
      if (command === "export") {
        await startExport(trimmed);
        return;
      }
      if (command === "import") {
        await startImport(trimmed);
        return;
      }
      if (command === "lsp") {
        await startLsp(trimmed);
        return;
      }
      if (command === "share") {
        await startShare(trimmed);
        return;
      }
      if (command === "new" && activeWorkspace) {
        const threadId = await startThreadForWorkspace(activeWorkspace.id, { engine: activeEngine });
        const rest = trimmed.replace(/^\/new\b/i, "").trim();
        if (threadId && rest) {
          if (options) {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, [], options);
          } else {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, []);
          }
        }
      }
    },
    [
      activeWorkspace,
      activeEngine,
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
      startThreadForWorkspace,
    ],
  );

  const handleSend = useCallback(
    async (
      text: string,
      images: string[] = [],
      options?: MessageSendOptions,
    ) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed);
      const nextImages = command ? [] : images;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (isProcessing && activeThreadId && !steerEnabled) {
        const item: QueuedMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: trimmed,
          createdAt: Date.now(),
          images: nextImages,
          sendOptions: options,
        };
        enqueueMessage(activeThreadId, item);
        clearActiveImages();
        return;
      }
      if (activeWorkspace && !activeWorkspace.connected) {
        await connectWorkspace(activeWorkspace);
      }
      if (command) {
        await runSlashCommand(command, trimmed, options);
        clearActiveImages();
        return;
      }
      if (options) {
        await sendUserMessage(trimmed, nextImages, options);
      } else {
        await sendUserMessage(trimmed, nextImages);
      }
      clearActiveImages();
    },
    [
      activeThreadId,
      activeWorkspace,
      clearActiveImages,
      connectWorkspace,
      enqueueMessage,
      isProcessing,
      isReviewing,
      steerEnabled,
      runSlashCommand,
      sendUserMessage,
    ],
  );

  const queueMessage = useCallback(
    async (
      text: string,
      images: string[] = [],
      options?: MessageSendOptions,
    ) => {
      const trimmed = text.trim();
      const command = parseSlashCommand(trimmed);
      const nextImages = command ? [] : images;
      if (!trimmed && nextImages.length === 0) {
        return;
      }
      if (activeThreadId && isReviewing) {
        return;
      }
      if (!activeThreadId) {
        return;
      }
      const item: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        createdAt: Date.now(),
        images: nextImages,
        sendOptions: options,
      };
      enqueueMessage(activeThreadId, item);
      clearActiveImages();
    },
    [activeThreadId, clearActiveImages, enqueueMessage, isReviewing],
  );

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }
    const inFlight = inFlightByThread[activeThreadId];
    if (!inFlight) {
      return;
    }
    if (isProcessing || isReviewing) {
      if (!hasStartedByThread[activeThreadId]) {
        setHasStartedByThread((prev) => ({
          ...prev,
          [activeThreadId]: true,
        }));
      }
      return;
    }
    if (hasStartedByThread[activeThreadId]) {
      setInFlightByThread((prev) => ({ ...prev, [activeThreadId]: null }));
      setHasStartedByThread((prev) => ({ ...prev, [activeThreadId]: false }));
    }
  }, [
    activeThreadId,
    hasStartedByThread,
    inFlightByThread,
    isProcessing,
    isReviewing,
  ]);

  useEffect(() => {
    if (activeEngine !== "opencode") {
      return;
    }
    if (!activeThreadId || isProcessing || isReviewing) {
      return;
    }
    const inFlight = inFlightByThread[activeThreadId];
    if (!inFlight) {
      return;
    }
    if (hasStartedByThread[activeThreadId]) {
      return;
    }
    const timer = window.setTimeout(() => {
      setInFlightByThread((prev) => {
        const current = prev[activeThreadId];
        if (!current || current.id !== inFlight.id) {
          return prev;
        }
        return { ...prev, [activeThreadId]: null };
      });
      setHasStartedByThread((prev) => ({ ...prev, [activeThreadId]: false }));
      prependQueuedMessage(activeThreadId, inFlight);
    }, OPENCODE_INFLIGHT_STALL_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeEngine,
    activeThreadId,
    hasStartedByThread,
    inFlightByThread,
    isProcessing,
    isReviewing,
    prependQueuedMessage,
  ]);

  useEffect(() => {
    if (!activeThreadId || isProcessing || isReviewing) {
      return;
    }
    if (inFlightByThread[activeThreadId]) {
      return;
    }
    const queue = queuedByThread[activeThreadId] ?? [];
    if (queue.length === 0) {
      return;
    }
    const threadId = activeThreadId;
    const nextItem = queue[0];
    setInFlightByThread((prev) => ({ ...prev, [threadId]: nextItem }));
    setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
    setQueuedByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).slice(1),
    }));
    (async () => {
      try {
        const trimmed = nextItem.text.trim();
        const command = parseSlashCommand(trimmed);
        if (command) {
          await runSlashCommand(command, trimmed, nextItem.sendOptions);
        } else {
          if (nextItem.sendOptions) {
            await sendUserMessage(
              nextItem.text,
              nextItem.images ?? [],
              nextItem.sendOptions,
            );
          } else {
            await sendUserMessage(nextItem.text, nextItem.images ?? []);
          }
        }
      } catch {
        setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
        setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
        prependQueuedMessage(threadId, nextItem);
      }
    })();
  }, [
    activeThreadId,
    inFlightByThread,
    isProcessing,
    isReviewing,
    prependQueuedMessage,
    queuedByThread,
    runSlashCommand,
    sendUserMessage,
  ]);

  return {
    queuedByThread,
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
  };
}
