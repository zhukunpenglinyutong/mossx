function normalizeThreadId(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function isClaudeThreadId(threadId: string | null | undefined) {
  const normalizedThreadId = normalizeThreadId(threadId).toLowerCase();
  return (
    normalizedThreadId.startsWith("claude:") ||
    normalizedThreadId.startsWith("claude-pending-")
  );
}

export function shouldShowHistoryLoadingForSelectionThread(
  threadId: string | null | undefined,
) {
  const normalizedThreadId = normalizeThreadId(threadId).toLowerCase();
  if (!normalizedThreadId || normalizedThreadId.includes("-pending-")) {
    return false;
  }
  return (
    !normalizedThreadId.startsWith("shared:") &&
    !normalizedThreadId.startsWith("gemini:") &&
    !normalizedThreadId.startsWith("opencode:")
  );
}

type ResolveClaudeContinuationThreadIdInput = {
  workspaceId: string;
  threadId: string | null | undefined;
  turnId?: string | null;
  resolveCanonicalThreadId: (threadId: string) => string;
  resolvePendingThreadForSession?: (
    workspaceId: string,
    engine: "claude" | "gemini" | "opencode",
  ) => string | null;
  getActiveTurnIdForThread?: (threadId: string) => string | null;
};

export function resolveClaudeContinuationThreadId({
  workspaceId,
  threadId,
  turnId,
  resolveCanonicalThreadId,
  resolvePendingThreadForSession,
  getActiveTurnIdForThread,
}: ResolveClaudeContinuationThreadIdInput): string | null {
  const normalizedThreadId = normalizeThreadId(threadId);
  if (!normalizedThreadId) {
    return null;
  }

  const canonicalThreadId = resolveCanonicalThreadId(normalizedThreadId);
  if (!isClaudeThreadId(canonicalThreadId)) {
    return canonicalThreadId;
  }
  if (canonicalThreadId !== normalizedThreadId) {
    return canonicalThreadId;
  }

  const normalizedTurnId = normalizeThreadId(turnId);
  if (!normalizedTurnId || !getActiveTurnIdForThread) {
    return canonicalThreadId;
  }

  const pendingThreadId =
    resolvePendingThreadForSession?.(workspaceId, "claude") ?? null;
  if (!pendingThreadId || !isClaudeThreadId(pendingThreadId)) {
    return canonicalThreadId;
  }

  const pendingCanonicalThreadId = resolveCanonicalThreadId(pendingThreadId);
  const pendingTurnId =
    getActiveTurnIdForThread(pendingCanonicalThreadId) ??
    getActiveTurnIdForThread(pendingThreadId);
  if ((pendingTurnId ?? "").trim() !== normalizedTurnId) {
    return canonicalThreadId;
  }

  return pendingCanonicalThreadId;
}
