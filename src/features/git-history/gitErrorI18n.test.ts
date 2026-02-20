import { describe, expect, it } from "vitest";
import {
  isWorkingTreeDirtyBlockingError,
  localizeGitErrorMessage,
  type GitTranslate,
} from "./gitErrorI18n";

const t: GitTranslate = (key) => key;

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
});
