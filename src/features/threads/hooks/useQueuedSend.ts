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
  startSpecRoot: (text: string) => Promise<void>;
  startStatus: (text: string) => Promise<void>;
  startContext: (text: string) => Promise<void>;
  startExport: (text: string) => Promise<void>;
  startImport: (text: string) => Promise<void>;
  startLsp: (text: string) => Promise<void>;
  startShare: (text: string) => Promise<void>;
  startFast: (text: string) => Promise<void>;
  startMode: (text: string) => Promise<void>;
  setCodexCollaborationMode?: (mode: "plan" | "code") => void;
  getCodexCollaborationMode?: () => "plan" | "code" | null;
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
  | "fast"
  | "clear"
  | "mcp"
  | "new"
  | "resume"
  | "specRoot"
  | "review"
  | "status"
  | "context"
  | "export"
  | "import"
  | "lsp"
  | "share"
  | "plan"
  | "defaultMode"
  | "code"
  | "mode";

const MODE_QUERY_DENYLIST =
  /(区别|差别|不同|怎么|如何|为什么|为何|影响|不影响|约束|规则|行为|能力|planfirst|agents\.?md)/i;

function isImplicitModeQuery(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 64) {
    return false;
  }
  if (MODE_QUERY_DENYLIST.test(trimmed)) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (
    /^(?:mode|current\s+mode|what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?mode|am i in (?:plan|default) mode)\s*[?]?$/i
      .test(normalized)
  ) {
    return true;
  }
  if (/^(现在呢|当前呢|此时呢)\s*[？?]?$/u.test(trimmed)) {
    return true;
  }
  return /^(现在|当前|此时).{0,24}(模式|计划模式|default|默认).{0,24}(吗|呢)?\s*[？?]?$/u
    .test(trimmed);
}

function parseSlashCommand(text: string): SlashCommandKind | null {
  if (/^\/fork\b/i.test(text)) {
    return "fork";
  }
  if (/^\/fast\b/i.test(text)) {
    return "fast";
  }
  if (/^\/(?:clear|reset)\b/i.test(text)) {
    return "clear";
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
  if (/^\/spec-root\b/i.test(text)) {
    return "specRoot";
  }
  if (/^\/status\b/i.test(text)) {
    return "status";
  }
  if (/^\/context\b/i.test(text)) {
    return "context";
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
  if (/^\/plan\b/i.test(text)) {
    return "plan";
  }
  if (/^\/default\b/i.test(text)) {
    return "defaultMode";
  }
  if (/^\/code\b/i.test(text)) {
    return "code";
  }
  if (/^\/mode\b/i.test(text)) {
    return "mode";
  }
  return null;
}

function isCodexOnlyCommand(command: SlashCommandKind): boolean {
  return (
    command === "fast" ||
    command === "plan" ||
    command === "defaultMode" ||
    command === "code" ||
    command === "mode"
  );
}

function canExecuteSlashCommand(
  command: SlashCommandKind | null,
  activeEngine: EngineType,
): command is SlashCommandKind {
  if (!command) {
    return false;
  }
  if (command === "clear" && activeEngine !== "claude") {
    return false;
  }
  if (isCodexOnlyCommand(command) && activeEngine !== "codex") {
    return false;
  }
  return true;
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
  startSpecRoot,
  startStatus,
  startContext,
  startExport,
  startImport,
  startLsp,
  startShare,
  startFast,
  startMode,
  setCodexCollaborationMode,
  getCodexCollaborationMode,
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

  const withCodexCollaborationMode = useCallback(
    (options?: MessageSendOptions): MessageSendOptions | undefined => {
      if (activeEngine !== "codex") {
        return options;
      }
      const existingModeRaw = options?.collaborationMode?.mode;
      const existingMode = typeof existingModeRaw === "string"
        ? existingModeRaw.trim().toLowerCase()
        : null;
      if (existingMode === "plan" || existingMode === "code" || existingMode === "default") {
        return options;
      }
      const currentMode = getCodexCollaborationMode?.();
      if (currentMode !== "plan" && currentMode !== "code") {
        return options;
      }
      return {
        ...(options ?? {}),
        collaborationMode: {
          mode: currentMode,
          settings: {},
        },
      };
    },
    [activeEngine, getCodexCollaborationMode],
  );

  const runSlashCommand = useCallback(
    async (
      command: SlashCommandKind,
      trimmed: string,
      options?: MessageSendOptions,
    ): Promise<boolean> => {
      if (
        (command === "plan" || command === "defaultMode" || command === "code") &&
        activeEngine === "codex" &&
        setCodexCollaborationMode
      ) {
        const targetMode = command === "plan" ? "plan" : "code";
        setCodexCollaborationMode(targetMode);
        const rest = trimmed
          .replace(/^\/(?:plan|default|code)\b/i, "")
          .trim();
        if (rest) {
          const modeOverrideOptions: MessageSendOptions = {
            ...(options ?? {}),
            collaborationMode: {
              mode: targetMode,
              settings: {},
            },
          };
          if (options) {
            await sendUserMessage(rest, [], modeOverrideOptions);
          } else {
            await sendUserMessage(rest, [], modeOverrideOptions);
          }
        }
        return true;
      }
      if (command === "mode" && activeEngine === "codex") {
        await startMode(trimmed);
        return true;
      }
      if (command === "fast" && activeEngine === "codex") {
        await startFast(trimmed);
        return true;
      }
      if (command === "fork") {
        await startFork(trimmed);
        return true;
      }
      if (command === "review") {
        await startReview(trimmed);
        return true;
      }
      if (command === "resume") {
        await startResume(trimmed);
        return true;
      }
      if (command === "mcp") {
        await startMcp(trimmed);
        return true;
      }
      if (command === "specRoot") {
        await startSpecRoot(trimmed);
        return true;
      }
      if (command === "status") {
        await startStatus(trimmed);
        return true;
      }
      if (command === "context") {
        await startContext(trimmed);
        return true;
      }
      if (command === "export") {
        await startExport(trimmed);
        return true;
      }
      if (command === "import") {
        await startImport(trimmed);
        return true;
      }
      if (command === "lsp") {
        await startLsp(trimmed);
        return true;
      }
      if (command === "share") {
        await startShare(trimmed);
        return true;
      }
      if (command === "clear" && activeWorkspace) {
        const threadId = await startThreadForWorkspace(activeWorkspace.id, { engine: activeEngine });
        const rest = trimmed.replace(/^\/(?:clear|reset)\b/i, "").trim();
        const effectiveOptions = withCodexCollaborationMode(options);
        if (threadId && rest) {
          if (effectiveOptions) {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, [], effectiveOptions);
          } else {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, []);
          }
        }
        return true;
      }
      if (command === "new" && activeWorkspace) {
        const threadId = await startThreadForWorkspace(activeWorkspace.id, { engine: activeEngine });
        const rest = trimmed.replace(/^\/new\b/i, "").trim();
        const effectiveOptions = withCodexCollaborationMode(options);
        if (threadId && rest) {
          if (effectiveOptions) {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, [], effectiveOptions);
          } else {
            await sendUserMessageToThread(activeWorkspace, threadId, rest, []);
          }
        }
        return true;
      }
      return false;
    },
    [
      activeWorkspace,
      activeEngine,
      setCodexCollaborationMode,
      sendUserMessage,
      sendUserMessageToThread,
      startFork,
      startReview,
      startResume,
      startMcp,
      startSpecRoot,
      startStatus,
      startContext,
      startExport,
      startImport,
      startLsp,
      startShare,
      startFast,
      startMode,
      startThreadForWorkspace,
      withCodexCollaborationMode,
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
      const commandEnabled = canExecuteSlashCommand(command, activeEngine);
      const nextImages = commandEnabled ? [] : images;
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
      if (commandEnabled && command) {
        const handled = await runSlashCommand(command, trimmed, options);
        if (handled) {
          clearActiveImages();
          return;
        }
      }
      const implicitModeQuery =
        activeEngine === "codex" &&
        !command &&
        nextImages.length === 0 &&
        isImplicitModeQuery(trimmed);
      if (implicitModeQuery) {
        await startMode(trimmed);
        clearActiveImages();
        return;
      }
      const effectiveOptions = withCodexCollaborationMode(options);
      if (effectiveOptions) {
        await sendUserMessage(trimmed, nextImages, effectiveOptions);
      } else {
        await sendUserMessage(trimmed, nextImages);
      }
      clearActiveImages();
    },
    [
      activeEngine,
      activeThreadId,
      activeWorkspace,
      clearActiveImages,
      connectWorkspace,
      enqueueMessage,
      isProcessing,
      isReviewing,
      steerEnabled,
      runSlashCommand,
      startMode,
      sendUserMessage,
      withCodexCollaborationMode,
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
      const commandEnabled = canExecuteSlashCommand(command, activeEngine);
      const nextImages = commandEnabled ? [] : images;
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
    [activeEngine, activeThreadId, clearActiveImages, enqueueMessage, isReviewing],
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
        const commandEnabled = canExecuteSlashCommand(command, activeEngine);
        if (commandEnabled && command) {
          const handled = await runSlashCommand(command, trimmed, nextItem.sendOptions);
          if (handled) {
            return;
          }
        }
        const effectiveOptions = withCodexCollaborationMode(nextItem.sendOptions);
        if (effectiveOptions) {
          await sendUserMessage(
            nextItem.text,
            nextItem.images ?? [],
            effectiveOptions,
          );
        } else {
          await sendUserMessage(nextItem.text, nextItem.images ?? []);
        }
      } catch {
        setInFlightByThread((prev) => ({ ...prev, [threadId]: null }));
        setHasStartedByThread((prev) => ({ ...prev, [threadId]: false }));
        prependQueuedMessage(threadId, nextItem);
      }
    })();
  }, [
    activeEngine,
    activeThreadId,
    inFlightByThread,
    isProcessing,
    isReviewing,
    prependQueuedMessage,
    queuedByThread,
    runSlashCommand,
    sendUserMessage,
    withCodexCollaborationMode,
  ]);

  return {
    queuedByThread,
    activeQueue,
    handleSend,
    queueMessage,
    removeQueuedMessage,
  };
}
