export type ThreadStabilityDiagnosticCategory =
  | "runtime_quarantined"
  | "connectivity_drift"
  | "partial_history";

export type RuntimeRecoveryHintReason =
  | "broken-pipe"
  | "workspace-not-connected"
  | "thread-not-found"
  | "recovery-quarantined"
  | "runtime-ended";

export type ThreadStabilityDiagnostic = {
  category: ThreadStabilityDiagnosticCategory;
  rawMessage: string;
  reconnectReason?: RuntimeRecoveryHintReason;
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

const RUNTIME_QUARANTINE_PATTERN = "[runtime_recovery_quarantined]";
const RUNTIME_ENDED_PATTERN = "[runtime_ended]";

const RECOVERABLE_ERROR_PREFIXES = [
  "会话启动失败",
  "会话失败",
  "上下文压缩失败",
  "turn failed",
  "context compaction failed",
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

function normalizeDiagnosticText(text: string): string {
  return text.trim();
}

function lineLooksLikeThreadRecoveryError(line: string): boolean {
  const lowered = line.toLowerCase();
  if (!THREAD_RECOVERY_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return false;
  }
  return RECOVERABLE_ERROR_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

function lineLooksLikeRecoveryQuarantine(line: string): boolean {
  return line.toLowerCase().includes(RUNTIME_QUARANTINE_PATTERN);
}

function lineLooksLikeRuntimeEnded(line: string): boolean {
  return line.toLowerCase().includes(RUNTIME_ENDED_PATTERN);
}

function lineLooksLikeRuntimeReconnectError(line: string): boolean {
  const lowered = line.toLowerCase();
  return (
    lineLooksLikeRuntimeEnded(line) ||
    lineLooksLikeRecoveryQuarantine(line) ||
    RUNTIME_PIPE_DISCONNECT_PATTERNS.some((pattern) => lowered.includes(pattern)) ||
    lowered.includes("workspace not connected") ||
    lineLooksLikeThreadRecoveryError(line)
  );
}

function getDiagnosticCandidate(text: string): string | null {
  const normalized = normalizeDiagnosticText(text);
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
  return lines[0] ?? null;
}

export function resolveThreadStabilityDiagnostic(
  text: string,
): ThreadStabilityDiagnostic | null {
  const candidate = getDiagnosticCandidate(text);
  if (!candidate) {
    return null;
  }
  const lowered = candidate.toLowerCase();
  if (lineLooksLikeRecoveryQuarantine(candidate)) {
    return {
      category: "runtime_quarantined",
      reconnectReason: "recovery-quarantined",
      rawMessage: candidate,
    };
  }
  if (lineLooksLikeRuntimeEnded(candidate)) {
    return {
      category: "connectivity_drift",
      reconnectReason: "runtime-ended",
      rawMessage: candidate,
    };
  }
  if (RUNTIME_PIPE_DISCONNECT_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return {
      category: "connectivity_drift",
      reconnectReason: "broken-pipe",
      rawMessage: candidate,
    };
  }
  if (lowered.includes("workspace not connected")) {
    return {
      category: "connectivity_drift",
      reconnectReason: "workspace-not-connected",
      rawMessage: candidate,
    };
  }
  if (lineLooksLikeThreadRecoveryError(candidate)) {
    return {
      category: "connectivity_drift",
      reconnectReason: "thread-not-found",
      rawMessage: candidate,
    };
  }
  return null;
}

export function buildPartialHistoryDiagnostic(
  message: string,
): ThreadStabilityDiagnostic {
  return {
    category: "partial_history",
    rawMessage: normalizeDiagnosticText(message) || "partial history fallback",
  };
}
