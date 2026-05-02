export type ThreadDeleteErrorCode =
  | "WORKSPACE_NOT_CONNECTED"
  | "SESSION_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "IO_ERROR"
  | "ENGINE_UNSUPPORTED"
  | "UNKNOWN";

export function mapDeleteErrorCode(errorMessage: string): ThreadDeleteErrorCode {
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("[engine_unsupported]")) {
    return "ENGINE_UNSUPPORTED";
  }
  if (
    normalized.includes("[workspace_not_connected]") ||
    normalized.includes("workspace not connected") ||
    normalized.includes("workspace not found")
  ) {
    return "WORKSPACE_NOT_CONNECTED";
  }
  if (
    normalized.includes("[session_not_found]") ||
    normalized.includes("session file not found") ||
    normalized.includes("not found") ||
    normalized.includes("thread not found")
  ) {
    return "SESSION_NOT_FOUND";
  }
  if (normalized.includes("[io_error]")) {
    return "IO_ERROR";
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
}

export function shouldSettleDeleteAsSuccess(errorMessage: string): boolean {
  const normalized = errorMessage.trim().toLowerCase();
  if (
    normalized.includes("invalid claude session id") ||
    normalized.includes("invalid gemini session id") ||
    normalized.includes("invalid opencode session id")
  ) {
    return false;
  }
  return (
    normalized.includes("session file not found") ||
    normalized.includes("session not found") ||
    normalized.includes("thread not found")
  );
}
