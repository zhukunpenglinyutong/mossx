import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Check from "lucide-react/dist/esm/icons/check";
import X from "lucide-react/dist/esm/icons/x";
import type { GitFileStatus } from "../../../types";
import { CommitMessageEngineIcon } from "../../git/components/CommitMessageEngineIcon";
import {
  CommitButton,
  useGitCommitSelection,
} from "../../git/components/GitDiffPanelCommitScope";
import { normalizeGitPath } from "../../git/utils/commitScope";
import type { FileChangeSummary } from "../types";

type CheckpointCommitDialogProps = {
  commitMessage: string;
  commitMessageLoading: boolean;
  commitMessageError: string | null;
  commitLoading: boolean;
  commitError: string | null;
  fileChanges: FileChangeSummary[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
  workspacePath?: string | null;
  onCommitMessageChange?: (value: string) => void;
  onGenerateCommitMessage?: (
    language?: "zh" | "en",
    engine?: "codex" | "claude" | "gemini" | "opencode",
    selectedPaths?: string[],
  ) => void | Promise<void>;
  onCommit?: (selectedPaths?: string[]) => void | Promise<void>;
  onClose: () => void;
};

type CommitDialogFile = FileChangeSummary & {
  commitPath: string;
};
type CommitMessageEngine = "codex" | "claude" | "gemini" | "opencode";
type CommitMessageLanguage = "zh" | "en";

const COMMIT_MESSAGE_ENGINES: CommitMessageEngine[] = [
  "codex",
  "claude",
  "gemini",
  "opencode",
];

const COMMIT_MESSAGE_LANGUAGES: CommitMessageLanguage[] = ["zh", "en"];

export function CheckpointCommitDialog({
  commitError,
  commitLoading,
  commitMessage,
  commitMessageError,
  commitMessageLoading,
  fileChanges,
  onClose,
  onCommit,
  onCommitMessageChange,
  onGenerateCommitMessage,
  stagedFiles,
  totalAdditions,
  totalDeletions,
  unstagedFiles,
  workspacePath,
}: CheckpointCommitDialogProps) {
  const { t } = useTranslation();
  const [commitMessageMenuEngine, setCommitMessageMenuEngine] =
    useState<CommitMessageEngine>("claude");
  const [isCommitMessageMenuOpen, setIsCommitMessageMenuOpen] = useState(false);
  const commitMessageMenuRef = useRef<HTMLDivElement | null>(null);
  const fallbackUnstagedFiles = useMemo(
    () =>
      stagedFiles.length > 0 || unstagedFiles.length > 0
        ? unstagedFiles
        : fileChanges.map((entry) => ({
            path: entry.filePath,
            status: entry.status,
            additions: entry.additions,
            deletions: entry.deletions,
          })),
    [fileChanges, stagedFiles.length, unstagedFiles],
  );
  const commitDialogFiles = useMemo(
    () => buildCommitDialogFiles({ fileChanges, stagedFiles, unstagedFiles: fallbackUnstagedFiles }),
    [fallbackUnstagedFiles, fileChanges, stagedFiles],
  );
  const {
    includedCommitPaths,
    isCommitPathLocked,
    selectedCommitCount,
    selectedCommitPaths,
    setCommitSelection,
  } = useGitCommitSelection({ stagedFiles, unstagedFiles: fallbackUnstagedFiles });
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const stagedPathSet = useMemo(
    () => new Set(stagedFiles.map((entry) => entry.path)),
    [stagedFiles],
  );
  const selectableCommitPaths = useMemo(
    () => commitDialogFiles
      .map((file) => file.commitPath)
      .filter((path) => !isCommitPathLocked(path)),
    [commitDialogFiles, isCommitPathLocked],
  );
  const includedCommitPathSet = useMemo(
    () => new Set(includedCommitPaths),
    [includedCommitPaths],
  );
  const selectedSelectableCommitPathCount = selectableCommitPaths.filter((path) =>
    includedCommitPathSet.has(normalizeGitPath(path)),
  ).length;
  const hasSelectableCommitPaths = selectableCommitPaths.length > 0;
  const areAllSelectableCommitPathsSelected =
    hasSelectableCommitPaths &&
    selectedSelectableCommitPathCount === selectableCommitPaths.length;
  const isSelectAllCommitPathsIndeterminate =
    selectedSelectableCommitPathCount > 0 && !areAllSelectableCommitPathsSelected;
  const hasAnyChanges = commitDialogFiles.length > 0;
  const canGenerateCommitMessage =
    Boolean(onGenerateCommitMessage) &&
    !commitMessageLoading &&
    !commitLoading &&
    hasAnyChanges &&
    selectedCommitCount > 0;

  const handleGenerateCommitMessage = useCallback(
    async (language: CommitMessageLanguage, engine: CommitMessageEngine) => {
      if (!canGenerateCommitMessage) {
        return;
      }
      setIsCommitMessageMenuOpen(false);
      setCommitMessageMenuEngine(engine);
      await onGenerateCommitMessage?.(language, engine, selectedCommitPaths);
    },
    [canGenerateCommitMessage, onGenerateCommitMessage, selectedCommitPaths],
  );
  const showCommitMessageEngineMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canGenerateCommitMessage) {
        return;
      }
      setIsCommitMessageMenuOpen((current) => !current);
    },
    [canGenerateCommitMessage],
  );

  useEffect(() => {
    if (!isCommitMessageMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (commitMessageMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsCommitMessageMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCommitMessageMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCommitMessageMenuOpen]);
  const handleToggleAllCommitPaths = () => {
    if (!hasSelectableCommitPaths || commitLoading) {
      return;
    }
    setCommitSelection(selectableCommitPaths, !areAllSelectableCommitPathsSelected);
  };

  useEffect(() => {
    if (!selectAllCheckboxRef.current) {
      return;
    }
    selectAllCheckboxRef.current.indeterminate = isSelectAllCommitPathsIndeterminate;
  }, [isSelectAllCommitPathsIndeterminate]);

  return (
    <div
      className="sp-checkpoint-commit-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="sp-checkpoint-commit-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("statusPanel.checkpoint.commitDialog.title")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sp-checkpoint-commit-dialog-header">
          <div>
            <div className="sp-checkpoint-commit-dialog-title">
              {t("statusPanel.checkpoint.commitDialog.title")}
            </div>
            <div className="sp-checkpoint-commit-dialog-meta">
              <span>{t("statusPanel.checkpoint.commitDialog.path")}</span>
              <code>{workspacePath || t("workspace.unknownBranch")}</code>
            </div>
          </div>
          <button
            type="button"
            className="git-history-diff-modal-close"
            aria-label={t("common.close")}
            title={t("common.close")}
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
        <div className="sp-checkpoint-commit-dialog-body">
          <div className="commit-message-section sp-checkpoint-commit-message-section">
            <div className="commit-message-input-wrapper">
              <textarea
                className="commit-message-input"
                placeholder={t("git.commitMessage")}
                value={commitMessage}
                onChange={(event) => onCommitMessageChange?.(event.target.value)}
                disabled={commitMessageLoading || commitLoading}
                rows={3}
              />
              <button
                type="button"
                className={`commit-message-generate-button${commitMessageLoading ? " commit-message-generate-button--loading" : ""}`}
                onClick={(event) => {
                  void showCommitMessageEngineMenu(event);
                }}
                disabled={!canGenerateCommitMessage}
                aria-haspopup="menu"
                aria-expanded={isCommitMessageMenuOpen}
                aria-label={t("git.generateCommitMessage")}
                title={t("git.generateCommitMessage")}
              >
                <CommitMessageEngineIcon
                  engine={commitMessageMenuEngine}
                  size={14}
                  className={`commit-message-engine-icon${commitMessageLoading ? " commit-message-engine-icon--spinning" : ""}`}
                />
              </button>
              {isCommitMessageMenuOpen ? (
                <div
                  ref={commitMessageMenuRef}
                  className="commit-message-generate-menu"
                  role="menu"
                  aria-label={t("git.generateCommitMessage")}
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {COMMIT_MESSAGE_ENGINES.map((engine) => (
                    <div className="commit-message-generate-menu-group" key={engine}>
                      <div className="commit-message-generate-menu-engine">
                        <CommitMessageEngineIcon
                          engine={engine}
                          size={13}
                          className="commit-message-generate-menu-engine-icon"
                        />
                        <span>{getCommitMessageEngineLabel(engine, t)}</span>
                      </div>
                      <div className="commit-message-generate-menu-languages">
                        {COMMIT_MESSAGE_LANGUAGES.map((language) => (
                          <button
                            key={`${engine}:${language}`}
                            type="button"
                            role="menuitem"
                            className="commit-message-generate-menu-item"
                            onClick={() => {
                              void handleGenerateCommitMessage(language, engine);
                            }}
                          >
                            {getCommitMessageLanguageLabel(language, t)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {commitMessageError ? <div className="commit-message-error">{commitMessageError}</div> : null}
            {commitError ? <div className="commit-message-error">{commitError}</div> : null}
            <CommitButton
              commitMessage={commitMessage}
              selectedCount={selectedCommitCount}
              hasAnyChanges={hasAnyChanges}
              commitLoading={commitLoading}
              selectedPaths={selectedCommitPaths}
              onCommit={onCommit}
            />
            <div className="commit-message-hint" aria-live="polite">
              {selectedCommitCount > 0
                ? t("git.selectedFilesForCommit", { count: selectedCommitCount })
                : t("git.selectFilesToCommit")}
            </div>
          </div>
          <div className="sp-checkpoint-commit-files">
            <div className="sp-checkpoint-commit-files-header">
              <div>
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  checked={areAllSelectableCommitPathsSelected}
                  disabled={!hasSelectableCommitPaths || commitLoading}
                  aria-label={t("statusPanel.checkpoint.commitDialog.toggleAllFiles")}
                  onChange={handleToggleAllCommitPaths}
                />
                <span>{t("statusPanel.checkpoint.commitDialog.files")}</span>
                <strong>{commitDialogFiles.length}</strong>
              </div>
              <div className="sp-checkpoint-commit-total-stats">
                <span className="is-add">+{totalAdditions}</span>
                <span className="is-del">-{totalDeletions}</span>
              </div>
            </div>
            <div className="sp-checkpoint-commit-file-list">
              {commitDialogFiles.map((file) => {
                const isSelected = includedCommitPathSet.has(normalizeGitPath(file.commitPath));
                const isLocked = isCommitPathLocked(file.commitPath);
                const isStaged = stagedPathSet.has(file.commitPath);
                return (
                  <label key={file.commitPath} className="sp-checkpoint-commit-file-row">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isLocked || commitLoading}
                      aria-label={t("git.commitSelectionToggleFile", { path: file.commitPath })}
                      onChange={(event) => {
                        setCommitSelection([file.commitPath], event.target.checked);
                      }}
                    />
                    <span className={`git-history-file-status git-status-${file.status.toLowerCase()}`}>
                      {file.status}
                    </span>
                    <span className="sp-checkpoint-commit-file-main">
                      <span className="sp-checkpoint-commit-file-name">{file.fileName}</span>
                      <span className="sp-checkpoint-commit-file-path">
                        {file.filePath}
                        {isStaged ? (
                          <span className="sp-checkpoint-commit-file-tag">
                            <Check size={10} />
                            {t("statusPanel.checkpoint.commitDialog.staged")}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="sp-checkpoint-commit-file-stats">
                      <span className="is-add">+{file.additions}</span>
                      <span className="is-del">-{file.deletions}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getCommitMessageEngineLabel(
  engine: CommitMessageEngine,
  t: (key: string) => string,
) {
  switch (engine) {
    case "codex":
      return t("git.generateCommitMessageEngineCodex");
    case "gemini":
      return t("git.generateCommitMessageEngineGemini");
    case "opencode":
      return t("git.generateCommitMessageEngineOpenCode");
    case "claude":
    default:
      return t("git.generateCommitMessageEngineClaude");
  }
}

function getCommitMessageLanguageLabel(
  language: CommitMessageLanguage,
  t: (key: string) => string,
) {
  return language === "zh"
    ? t("git.generateCommitMessageChinese")
    : t("git.generateCommitMessageEnglish");
}

function buildCommitDialogFiles(input: {
  fileChanges: FileChangeSummary[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
}): CommitDialogFile[] {
  const byPath = new Map<string, CommitDialogFile>();
  for (const entry of input.fileChanges) {
    byPath.set(entry.filePath, { ...entry, commitPath: entry.filePath });
  }
  for (const entry of [...input.stagedFiles, ...input.unstagedFiles]) {
    if (byPath.has(entry.path)) {
      continue;
    }
    byPath.set(entry.path, {
      commitPath: entry.path,
      filePath: entry.path,
      fileName: entry.path.split(/[\\/]/).pop() ?? entry.path,
      status: entry.status === "A" || entry.status === "D" || entry.status === "R" ? entry.status : "M",
      additions: entry.additions,
      deletions: entry.deletions,
    });
  }
  return [...byPath.values()];
}
