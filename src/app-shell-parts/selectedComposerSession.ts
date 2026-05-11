export type ComposerSessionSelection = {
  modelId: string | null;
  effort: string | null;
};

const THREAD_COMPOSER_SELECTION_STORAGE_KEY_PREFIX = "selectedModelByThread.";
const CLAUDE_FORK_THREAD_PREFIX = "claude-fork:";

function resolveThreadEngine(
  threadId: string,
): "claude" | "gemini" | "opencode" | "codex" | null {
  if (
    threadId.startsWith("claude:") ||
    threadId.startsWith("claude-pending-") ||
    threadId.startsWith(CLAUDE_FORK_THREAD_PREFIX)
  ) {
    return "claude";
  }
  if (threadId.startsWith("gemini:") || threadId.startsWith("gemini-pending-")) {
    return "gemini";
  }
  if (threadId.startsWith("opencode:") || threadId.startsWith("opencode-pending-")) {
    return "opencode";
  }
  if (threadId.startsWith("codex:") || threadId.startsWith("codex-pending-")) {
    return "codex";
  }
  return null;
}

export function extractClaudeForkParentThreadId(threadId: string): string | null {
  if (!threadId.startsWith(CLAUDE_FORK_THREAD_PREFIX)) {
    return null;
  }
  const payload = threadId.slice(CLAUDE_FORK_THREAD_PREFIX.length);
  const separatorIndex = payload.lastIndexOf(":");
  const parentSessionId = separatorIndex >= 0 ? payload.slice(0, separatorIndex) : payload;
  const trimmed = parentSessionId.trim();
  return trimmed.length > 0 ? `claude:${trimmed}` : null;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeComposerSessionSelection(
  value: unknown,
): ComposerSessionSelection | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const modelId = normalizeNullableString(record.modelId);
  const effort = normalizeNullableString(record.effort);
  if (modelId === null && effort === null) {
    return null;
  }
  return { modelId, effort };
}

export function getThreadComposerSelectionStorageKey(
  workspaceId: string | null,
  threadId: string,
): string {
  const workspaceKey =
    typeof workspaceId === "string" && workspaceId.trim().length > 0
      ? workspaceId.trim()
      : "__workspace__unknown__";
  return `${THREAD_COMPOSER_SELECTION_STORAGE_KEY_PREFIX}${workspaceKey}:${threadId}`;
}

export function shouldApplyDraftComposerSelectionToThread(input: {
  candidate: ComposerSessionSelection | null;
  shouldApplyDraftToNextThread: boolean;
  draftComposerSelection: ComposerSessionSelection | null;
  activeThreadId: string | null;
}): boolean {
  return Boolean(
    !input.candidate &&
      input.shouldApplyDraftToNextThread &&
      input.draftComposerSelection &&
      input.activeThreadId &&
      input.activeThreadId.includes("-pending-"),
  );
}

export function shouldMigrateComposerSelectionBetweenThreadIds(input: {
  previousThreadId: string | null;
  activeThreadId: string | null;
  previousSessionKey: string | null;
  activeSessionKey: string | null;
  hasSourceSelection: boolean;
  hasTargetSelection: boolean;
  resolveCanonicalThreadId: (threadId: string) => string;
}): boolean {
  const {
    previousThreadId,
    activeThreadId,
    previousSessionKey,
    activeSessionKey,
    hasSourceSelection,
    hasTargetSelection,
    resolveCanonicalThreadId,
  } = input;

  const previousEngine = previousThreadId ? resolveThreadEngine(previousThreadId) : null;
  const activeEngine = activeThreadId ? resolveThreadEngine(activeThreadId) : null;
  const hasEngineMismatch =
    previousEngine !== null && activeEngine !== null && previousEngine !== activeEngine;
  const hasForwardFinalizeTransition = Boolean(
    previousThreadId &&
      activeThreadId &&
      previousThreadId.includes("-pending-") &&
      !activeThreadId.includes("-pending-"),
  );
  const hasCanonicalMatch = Boolean(
    previousThreadId &&
      activeThreadId &&
      resolveCanonicalThreadId(previousThreadId) === resolveCanonicalThreadId(activeThreadId),
  );

  return Boolean(
    previousThreadId &&
      activeThreadId &&
      previousThreadId !== activeThreadId &&
      previousSessionKey &&
      activeSessionKey &&
      hasSourceSelection &&
      !hasTargetSelection &&
      !hasEngineMismatch &&
      (hasForwardFinalizeTransition || hasCanonicalMatch),
  );
}

export function shouldInheritComposerSelectionFromClaudeForkParent(input: {
  activeThreadId: string | null;
  hasCandidate: boolean;
  hasParentSelection: boolean;
}): boolean {
  return Boolean(
    input.activeThreadId &&
      input.activeThreadId.startsWith(CLAUDE_FORK_THREAD_PREFIX) &&
      !input.hasCandidate &&
      input.hasParentSelection,
  );
}
