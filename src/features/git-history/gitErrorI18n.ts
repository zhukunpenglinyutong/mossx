export type GitTranslate = (key: string, options?: Record<string, unknown>) => string;

function normalize(raw: string): string {
  return raw.toLowerCase();
}

function extractWorktreePath(raw: string): string | null {
  const match = raw.match(/used by worktree at ['"]?([^'"\n]+)['"]?/i);
  const path = match?.[1]?.trim();
  return path ? path : null;
}

export function isWorkingTreeDirtyBlockingError(raw: string): boolean {
  const message = normalize(raw);
  return (
    message.includes("working tree has uncommitted changes") ||
    message.includes("commit your changes or stash them before you switch branches") ||
    message.includes("would be overwritten by checkout") ||
    message.includes("would be overwritten by revert") ||
    message.includes("would be overwritten by cherry-pick") ||
    message.includes("would be overwritten by merge") ||
    message.includes("would be overwritten by reset") ||
    message.includes("please commit your changes or stash them to proceed") ||
    message.includes("local changes would be overwritten")
  );
}

export function localizeGitErrorMessage(
  raw: string | null,
  t: GitTranslate,
): string | null {
  if (!raw) {
    return null;
  }
  const message = normalize(raw);
  if (message.includes("working tree clean")) {
    return t("git.workingTreeClean");
  }
  if (isWorkingTreeDirtyBlockingError(message)) {
    return t("git.historyErrorWorkingTreeDirty");
  }
  if (message.includes("revert failed")) {
    return t("git.historyErrorRevertFailed");
  }
  if (message.includes("cherry-pick failed") || message.includes("cherry pick failed")) {
    return t("git.historyErrorCherryPickFailed");
  }
  if (message.includes("merge failed")) {
    return t("git.historyErrorMergeFailed");
  }
  if (message.includes("reset failed")) {
    return t("git.historyErrorResetFailed");
  }
  if (message.includes("git command timed out after")) {
    return t("git.historyErrorCommandTimeout");
  }
  if (
    message.includes("terminal prompts disabled") ||
    message.includes("authentication failed") ||
    message.includes("could not read username")
  ) {
    return t("git.historyErrorAuthRequired");
  }
  if (
    message.includes("cannot delete branch") &&
    message.includes("used by worktree")
  ) {
    const worktreePath = extractWorktreePath(raw);
    if (worktreePath) {
      return t("git.historyErrorBranchUsedByWorktreeAt", { path: worktreePath });
    }
    return t("git.historyErrorBranchUsedByWorktree");
  }
  return raw;
}
