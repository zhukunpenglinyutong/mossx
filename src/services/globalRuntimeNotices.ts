export type GlobalRuntimeNoticeSeverity = "info" | "warning" | "error";

export type GlobalRuntimeNoticeCategory =
  | "bootstrap"
  | "runtime"
  | "workspace"
  | "diagnostic"
  | "user-action-error";

export type GlobalRuntimeNoticeMessageParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type GlobalRuntimeNotice = {
  id: string;
  severity: GlobalRuntimeNoticeSeverity;
  category: GlobalRuntimeNoticeCategory;
  messageKey: string;
  messageParams?: GlobalRuntimeNoticeMessageParams;
  timestampMs: number;
  repeatCount: number;
  dedupeKey: string;
};

export type GlobalRuntimeNoticeInput = {
  severity: GlobalRuntimeNoticeSeverity;
  category: GlobalRuntimeNoticeCategory;
  messageKey: string;
  messageParams?: GlobalRuntimeNoticeMessageParams;
  timestampMs?: number;
  dedupeKey?: string;
  mergeStrategy?: "last" | "buffer";
};

export type ThreadFailureRuntimeNoticeInput = {
  workspaceId: string;
  threadId: string;
  turnId?: string | null;
  engine?: "claude" | "codex" | "gemini" | "opencode" | string | null;
  message: string;
  reasonCode?: string | null;
  userAction?: string | null;
  timestampMs?: number;
};

type GlobalRuntimeNoticeListener = (
  notices: readonly GlobalRuntimeNotice[],
) => void;

export const GLOBAL_RUNTIME_NOTICE_BUFFER_LIMIT = 120;

const listeners = new Set<GlobalRuntimeNoticeListener>();
let notices: GlobalRuntimeNotice[] = [];
let nextNoticeId = 0;

function makeNoticeId(timestampMs: number) {
  nextNoticeId += 1;
  return `global-runtime-notice-${timestampMs}-${nextNoticeId}`;
}

function normalizeMessageParams(
  value: GlobalRuntimeNoticeMessageParams | undefined,
): GlobalRuntimeNoticeMessageParams | undefined {
  if (!value) {
    return undefined;
  }
  const normalizedEntries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (!normalizedEntries.length) {
    return undefined;
  }
  return Object.fromEntries(normalizedEntries);
}

function serializeMessageParams(value: GlobalRuntimeNoticeMessageParams | undefined) {
  const normalized = normalizeMessageParams(value);
  if (!normalized) {
    return "";
  }
  return Object.entries(normalized)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${key}:${String(item)}`)
    .join("|");
}

function resolveDedupeKey(input: GlobalRuntimeNoticeInput) {
  if (typeof input.dedupeKey === "string" && input.dedupeKey.trim().length > 0) {
    return input.dedupeKey.trim();
  }
  return [
    input.category,
    input.severity,
    input.messageKey,
    serializeMessageParams(input.messageParams),
  ].join("|");
}

function resolveRuntimeNoticeEngineLabel(engine: ThreadFailureRuntimeNoticeInput["engine"]) {
  switch (engine?.trim().toLowerCase()) {
    case "claude":
      return "Claude Code";
    case "gemini":
      return "Gemini";
    case "opencode":
      return "OpenCode";
    case "codex":
      return "Codex";
    default:
      return engine?.trim() || "Runtime";
  }
}

function normalizeThreadFailureMessage(message: string) {
  return message.trim().replace(/\s+/g, " ");
}

function resolveRuntimeNoticeActionLabel(userAction: string | null | undefined) {
  switch (userAction?.trim()) {
    case "reconnect":
      return "reconnect";
    case "recover-thread":
      return "recover-thread";
    case "start-fresh-thread":
      return "start-fresh-thread";
    case "retry":
      return "retry";
    case "wait":
      return "wait";
    default:
      return null;
  }
}

function resolveRuntimeNoticeActionHint(userAction: string | null | undefined) {
  switch (resolveRuntimeNoticeActionLabel(userAction)) {
    case "reconnect":
      return "Reconnect the runtime and retry.";
    case "recover-thread":
      return "Recover this thread binding and retry.";
    case "start-fresh-thread":
      return "Start a fresh thread to continue.";
    case "retry":
      return "Retry this action.";
    case "wait":
      return "Wait for recovery to finish.";
    default:
      return null;
  }
}

function buildThreadFailureDedupeKey(input: ThreadFailureRuntimeNoticeInput) {
  const message = normalizeThreadFailureMessage(input.message).slice(0, 240);
  return [
    "thread-turn-failed",
    input.workspaceId.trim() || "unknown-workspace",
    input.threadId.trim() || "unknown-thread",
    input.turnId?.trim() || "unknown-turn",
    input.engine?.trim().toLowerCase() || "unknown-engine",
    message,
  ].join("|");
}

function cloneSnapshot() {
  return notices.map((notice) => ({
    ...notice,
    messageParams: notice.messageParams ? { ...notice.messageParams } : undefined,
  }));
}

function notifyListeners() {
  const snapshot = cloneSnapshot();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("[globalRuntimeNotices] listener failed", error);
    }
  }
}

export function getGlobalRuntimeNoticesSnapshot(): readonly GlobalRuntimeNotice[] {
  return cloneSnapshot();
}

export function pushGlobalRuntimeNotice(
  input: GlobalRuntimeNoticeInput,
): GlobalRuntimeNotice {
  const timestampMs =
    typeof input.timestampMs === "number" && Number.isFinite(input.timestampMs)
      ? Math.trunc(input.timestampMs)
      : Date.now();
  const messageParams = normalizeMessageParams(input.messageParams);
  const dedupeKey = resolveDedupeKey(input);
  const lastNotice = notices[notices.length - 1];
  const mergeStrategy = input.mergeStrategy ?? "last";
  const mergeIndex =
    mergeStrategy === "buffer"
      ? notices.findIndex((notice) => notice.dedupeKey === dedupeKey)
      : lastNotice?.dedupeKey === dedupeKey
        ? notices.length - 1
        : -1;

  if (mergeIndex >= 0) {
    const matchingNotice = notices[mergeIndex];
    const mergedNotice: GlobalRuntimeNotice = {
      ...matchingNotice,
      timestampMs,
      repeatCount: matchingNotice.repeatCount + 1,
    };
    notices = [
      ...notices.slice(0, mergeIndex),
      ...notices.slice(mergeIndex + 1),
      mergedNotice,
    ];
    notifyListeners();
    return mergedNotice;
  }

  const notice: GlobalRuntimeNotice = {
    id: makeNoticeId(timestampMs),
    severity: input.severity,
    category: input.category,
    messageKey: input.messageKey,
    messageParams,
    timestampMs,
    repeatCount: 1,
    dedupeKey,
  };

  notices = [...notices, notice].slice(-GLOBAL_RUNTIME_NOTICE_BUFFER_LIMIT);
  notifyListeners();
  return notice;
}

export function pushThreadFailureRuntimeNotice(
  input: ThreadFailureRuntimeNoticeInput,
): GlobalRuntimeNotice | null {
  const message = normalizeThreadFailureMessage(input.message);
  if (!message) {
    return null;
  }
  return pushGlobalRuntimeNotice({
    severity: "error",
    category: "user-action-error",
    messageKey: "runtimeNotice.error.threadTurnFailed",
    messageParams: {
      engine: resolveRuntimeNoticeEngineLabel(input.engine),
      message,
      reasonCode: input.reasonCode?.trim() || undefined,
      userAction: resolveRuntimeNoticeActionLabel(input.userAction) ?? undefined,
      actionHint: resolveRuntimeNoticeActionHint(input.userAction) ?? undefined,
    },
    timestampMs: input.timestampMs,
    dedupeKey: buildThreadFailureDedupeKey(input),
  });
}

export function clearGlobalRuntimeNotices() {
  if (notices.length === 0) {
    return;
  }
  notices = [];
  notifyListeners();
}

export function subscribeGlobalRuntimeNotices(
  listener: GlobalRuntimeNoticeListener,
) {
  listeners.add(listener);
  listener(cloneSnapshot());
  return () => {
    listeners.delete(listener);
  };
}
