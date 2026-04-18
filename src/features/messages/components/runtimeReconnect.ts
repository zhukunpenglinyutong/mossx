export type RuntimeReconnectHint = {
  reason: "broken-pipe" | "workspace-not-connected" | "thread-not-found";
  rawMessage: string;
};

const RUNTIME_PIPE_DISCONNECT_PATTERNS = [
  "broken pipe",
  "the pipe is being closed",
  "the pipe has been ended",
  "os error 32",
  "os error 109",
  "os error 232",
] as const;

const THREAD_RECOVERY_PATTERNS = [
  "thread not found",
  "[session_not_found]",
  "session not found",
  "session file not found",
] as const;

const THREAD_RECOVERY_ERROR_PREFIXES = [
  "会话启动失败",
  "thread not found",
  "session not found",
  "session file not found",
  "[session_not_found]",
  "failed to start",
  "turn failed to start",
  "session failed to start",
  "error: thread not found",
  "error: session not found",
] as const;

function lineLooksLikeThreadRecoveryError(line: string): boolean {
  const lowered = line.toLowerCase();
  if (!THREAD_RECOVERY_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return false;
  }
  return THREAD_RECOVERY_ERROR_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

function lineLooksLikeRuntimeReconnectError(line: string): boolean {
  const lowered = line.toLowerCase();
  return (
    RUNTIME_PIPE_DISCONNECT_PATTERNS.some((pattern) => lowered.includes(pattern)) ||
    lowered.includes("workspace not connected") ||
    lineLooksLikeThreadRecoveryError(line)
  );
}

function getRuntimeReconnectCandidate(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  if (lines.length === 1) {
    return lineLooksLikeRuntimeReconnectError(lines[0] ?? "") ? (lines[0] ?? null) : null;
  }
  if (!lines.every((line) => lineLooksLikeRuntimeReconnectError(line))) {
    return null;
  }
  return lines[0];
}

export function resolveRuntimeReconnectHint(text: string): RuntimeReconnectHint | null {
  const candidate = getRuntimeReconnectCandidate(text);
  if (!candidate) {
    return null;
  }
  const lowered = candidate.toLowerCase();
  if (RUNTIME_PIPE_DISCONNECT_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return { reason: "broken-pipe", rawMessage: candidate };
  }
  if (lowered.includes("workspace not connected")) {
    return { reason: "workspace-not-connected", rawMessage: candidate };
  }
  if (lineLooksLikeThreadRecoveryError(candidate)) {
    return { reason: "thread-not-found", rawMessage: candidate };
  }
  return null;
}

export function normalizeRuntimeReconnectErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
