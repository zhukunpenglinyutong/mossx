import { describe, expect, it } from "vitest";
import {
  isWorkingTreeDirtyBlockingError,
  localizeGitErrorMessage,
  type GitTranslate,
} from "./gitErrorI18n";

const t: GitTranslate = (key, options) => {
  if (key === "git.historyErrorBranchUsedByWorktreeAt" && options?.path) {
    return `${key}:${String(options.path)}`;
  }
  return key;
};

describe("gitErrorI18n", () => {
  it("localizes overwrite-by-revert errors as working tree dirty", () => {
    const raw =
      "error: your local changes would be overwritten by revert.\n" +
      "hint: commit your changes or stash them to proceed.\n" +
      "fatal: revert failed";
    expect(isWorkingTreeDirtyBlockingError(raw)).toBe(true);
    expect(localizeGitErrorMessage(raw, t)).toBe("git.historyErrorWorkingTreeDirty");
  });

  it("localizes overwrite-by-reset errors as working tree dirty", () => {
    const raw =
      "error: your local changes would be overwritten by reset.\n" +
      "hint: commit your changes or stash them to proceed.\n" +
      "fatal: could not reset index file";
    expect(isWorkingTreeDirtyBlockingError(raw)).toBe(true);
    expect(localizeGitErrorMessage(raw, t)).toBe("git.historyErrorWorkingTreeDirty");
  });

  it("localizes revert/cherry-pick/merge failures", () => {
    expect(localizeGitErrorMessage("fatal: revert failed", t)).toBe(
      "git.historyErrorRevertFailed",
    );
    expect(localizeGitErrorMessage("fatal: cherry-pick failed", t)).toBe(
      "git.historyErrorCherryPickFailed",
    );
    expect(localizeGitErrorMessage("fatal: merge failed", t)).toBe(
      "git.historyErrorMergeFailed",
    );
    expect(localizeGitErrorMessage("fatal: reset failed", t)).toBe(
      "git.historyErrorResetFailed",
    );
  });

  it("localizes git timeout and auth prompt errors", () => {
    expect(
      localizeGitErrorMessage(
        "Git command timed out after 120s: git pull. Check network/authentication and retry.",
        t,
      ),
    ).toBe("git.historyErrorCommandTimeout");
    expect(
      localizeGitErrorMessage(
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
        t,
      ),
    ).toBe("git.historyErrorAuthRequired");
  });

  it("localizes delete-branch used-by-worktree errors", () => {
    expect(
      localizeGitErrorMessage(
        "Cannot delete branch 'feature/test' because it is currently used by worktree at '/tmp/worktree'.",
        t,
      ),
    ).toBe("git.historyErrorBranchUsedByWorktreeAt:/tmp/worktree");
  });
});
