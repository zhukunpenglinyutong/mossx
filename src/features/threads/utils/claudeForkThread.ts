const CLAUDE_FORK_THREAD_PREFIX = "claude-fork:";
const CLAUDE_PENDING_THREAD_PREFIX = "claude-pending-";

export function isClaudeForkThreadId(threadId: string): boolean {
  return threadId.startsWith(CLAUDE_FORK_THREAD_PREFIX);
}

export function isClaudeSessionBootstrapThreadId(threadId: string): boolean {
  return (
    threadId.startsWith(CLAUDE_PENDING_THREAD_PREFIX) ||
    isClaudeForkThreadId(threadId)
  );
}

export function isClaudeRuntimeThreadId(threadId: string): boolean {
  return (
    threadId.startsWith("claude:") ||
    isClaudeSessionBootstrapThreadId(threadId)
  );
}

export function extractClaudeForkParentSessionId(threadId: string): string | null {
  if (!isClaudeForkThreadId(threadId)) {
    return null;
  }
  const payload = threadId.slice(CLAUDE_FORK_THREAD_PREFIX.length);
  const separatorIndex = payload.lastIndexOf(":");
  const parentSessionId = separatorIndex >= 0 ? payload.slice(0, separatorIndex) : payload;
  const trimmed = parentSessionId.trim();
  return trimmed.length > 0 ? trimmed : null;
}
