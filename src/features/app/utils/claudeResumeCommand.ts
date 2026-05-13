export type ClaudeResumeCommandPlatform = "posix" | "windows";

export type ClaudeResumeCommandInput = {
  workspacePath: string;
  sessionId: string;
  platform: ClaudeResumeCommandPlatform;
};

const CLAUDE_THREAD_PREFIX = "claude:";
const SAFE_TERMINAL_SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

function quotePosixShellValue(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteWindowsCmdValue(value: string) {
  return `"${value.replace(/"/g, `""`)}"`;
}

export function extractClaudeNativeSessionId(threadId: string) {
  if (!threadId.startsWith(CLAUDE_THREAD_PREFIX)) {
    return null;
  }
  const sessionId = threadId.slice(CLAUDE_THREAD_PREFIX.length).trim();
  return sessionId.length > 0 ? sessionId : null;
}

export function buildClaudeResumeCommand({
  workspacePath,
  sessionId,
  platform,
}: ClaudeResumeCommandInput) {
  const normalizedWorkspacePath = workspacePath.trim();
  const normalizedSessionId = sessionId.trim();
  if (!normalizedWorkspacePath || !normalizedSessionId) {
    return null;
  }

  if (platform === "windows") {
    return [
      "cd /d",
      quoteWindowsCmdValue(normalizedWorkspacePath),
      "&& claude --resume",
      quoteWindowsCmdValue(normalizedSessionId),
    ].join(" ");
  }

  return [
    "cd",
    quotePosixShellValue(normalizedWorkspacePath),
    "&& claude --resume",
    quotePosixShellValue(normalizedSessionId),
  ].join(" ");
}

export function buildClaudeResumeTerminalCommand(sessionId: string) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId || !SAFE_TERMINAL_SESSION_ID_PATTERN.test(normalizedSessionId)) {
    return null;
  }
  return `claude --resume ${normalizedSessionId}`;
}
