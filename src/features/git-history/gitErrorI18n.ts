export type GitTranslate = (key: string, options?: Record<string, unknown>) => string;

function normalize(raw: string): string {
  return raw.toLowerCase();
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
  return raw;
}
