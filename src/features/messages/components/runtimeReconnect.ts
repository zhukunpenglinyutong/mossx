export type RuntimeReconnectHint = {
  reason: "broken-pipe" | "workspace-not-connected";
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

export function resolveRuntimeReconnectHint(text: string): RuntimeReconnectHint | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }
  const lowered = normalized.toLowerCase();
  if (RUNTIME_PIPE_DISCONNECT_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return { reason: "broken-pipe", rawMessage: normalized };
  }
  if (lowered.includes("workspace not connected")) {
    return { reason: "workspace-not-connected", rawMessage: normalized };
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
