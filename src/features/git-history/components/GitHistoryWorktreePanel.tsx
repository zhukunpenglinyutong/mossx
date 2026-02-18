import { ask } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import Folder from "lucide-react/dist/esm/icons/folder";
import Minus from "lucide-react/dist/esm/icons/minus";
import Plus from "lucide-react/dist/esm/icons/plus";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Sparkles from "lucide-react/dist/esm/icons/sparkles";
import FileIcon from "../../../components/FileIcon";
import {
  commitGit,
  generateCommitMessage,
  getGitStatus,
  revertGitAll,
  revertGitFile,
  stageGitAll,
  stageGitFile,
  unstageGitFile,
} from "../../../services/tauri";
import type { GitFileStatus } from "../../../types";

type GitHistoryWorktreePanelProps = {
  workspaceId: string;
  listView: "flat" | "tree";
  onMutated?: () => void | Promise<void>;
  onOpenDiffPath?: (path: string) => void;
  onSummaryChange?: (summary: {
    changedFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  }) => void;
};

type GitStatusState = {
  branchName: string;
  files: GitFileStatus[];
  stagedFiles: GitFileStatus[];
  unstagedFiles: GitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
};

type DiffSection = "staged" | "unstaged";

type DiffTreeNode = {
  key: string;
  name: string;
  folders: Map<string, DiffTreeNode>;
  files: GitFileStatus[];
};

const EMPTY_STATUS: GitStatusState = {
  branchName: "",
  files: [],
  stagedFiles: [],
  unstagedFiles: [],
  totalAdditions: 0,
  totalDeletions: 0,
};

function splitPath(path: string) {
  const parts = path.split("/");
  if (parts.length <= 1) {
    return { name: path, dir: "" };
  }
  return { name: parts[parts.length - 1], dir: parts.slice(0, -1).join("/") };
}

function statusSymbol(status: string) {
  switch (status) {
    case "A":
      return "(A)";
    case "M":
      return "(U)";
    case "D":
      return "(D)";
    case "R":
      return "(R)";
    case "T":
      return "(T)";
    default:
      return "(?)";
  }
}

function buildDiffTree(files: GitFileStatus[], section: DiffSection): DiffTreeNode {
  const root: DiffTreeNode = {
    key: `${section}:/`,
    name: "",
    folders: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index];
      const key = `${node.key}${segment}/`;
      let child = node.folders.get(segment);
      if (!child) {
        child = { key, name: segment, folders: new Map(), files: [] };
        node.folders.set(segment, child);
      }
      node = child;
    }
    node.files.push(file);
  }

  return root;
}

function normalizeErrorMessage(
  raw: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("working tree has uncommitted changes") ||
    normalized.includes("commit your changes or stash them before you switch branches") ||
    normalized.includes("would be overwritten by checkout")
  ) {
    return t("git.historyErrorWorkingTreeDirty");
  }
  if (normalized.includes("working tree clean")) {
    return t("git.workingTreeClean");
  }
  const isCodexRequired =
    raw.includes("requires the Codex CLI") || raw.includes("workspace not connected");
  if (isCodexRequired) {
    return t("git.commitMessageRequiresCodex");
  }
  return raw;
}

export function GitHistoryWorktreePanel({
  workspaceId,
  listView,
  onMutated,
  onOpenDiffPath,
  onSummaryChange,
}: GitHistoryWorktreePanelProps) {
  const { t } = useTranslation();
  const requestIdRef = useRef(0);

  const [status, setStatus] = useState<GitStatusState>(EMPTY_STATUS);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [operationLoading, setOperationLoading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  const [commitMessage, setCommitMessage] = useState("");
  const [commitMessageLoading, setCommitMessageLoading] = useState(false);
  const [commitMessageError, setCommitMessageError] = useState<string | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const refreshStatus = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    try {
      const next = await getGitStatus(workspaceId);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setStatus({
        branchName: next.branchName,
        files: next.files,
        stagedFiles: next.stagedFiles,
        unstagedFiles: next.unstagedFiles,
        totalAdditions: next.totalAdditions,
        totalDeletions: next.totalDeletions,
      });
      onSummaryChange?.({
        changedFiles: next.files.length,
        totalAdditions: next.totalAdditions,
        totalDeletions: next.totalDeletions,
      });
      setStatusError(null);
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setStatusError(message);
    }
  }, [onSummaryChange, workspaceId]);

  useEffect(() => {
    requestIdRef.current += 1;
    setStatus(EMPTY_STATUS);
    setStatusError(null);
    setOperationError(null);
    setCommitMessageError(null);
    setCollapsedFolders(new Set());
    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshStatus, workspaceId]);

  const handleMutation = useCallback(
    async (operation: () => Promise<unknown> | void) => {
      setOperationError(null);
      setOperationLoading(true);
      try {
        await operation();
        await refreshStatus();
        await onMutated?.();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setOperationError(message);
      } finally {
        setOperationLoading(false);
      }
    },
    [onMutated, refreshStatus],
  );

  const discardFiles = useCallback(
    async (paths: string[]) => {
      if (!paths.length) {
        return;
      }
      const single = paths.length === 1;
      const previewLimit = 6;
      const preview = paths.slice(0, previewLimit).join("\n");
      const remaining = paths.length - previewLimit;
      const more =
        paths.length > previewLimit ? `\n… ${t("git.andMore", { count: remaining })}` : "";
      const message = single
        ? t("git.discardConfirmSingle", { path: paths[0] })
        : t("git.discardConfirmMultiple", { preview, more });
      const confirmed = await ask(message, {
        title: t("git.discardConfirmTitle"),
        kind: "warning",
      });
      if (!confirmed) {
        return;
      }
      await handleMutation(async () => {
        for (const path of paths) {
          await revertGitFile(workspaceId, path);
        }
      });
    },
    [handleMutation, t, workspaceId],
  );

  const handleDiscardAll = useCallback(async () => {
    const confirmed = await ask(`${t("git.revertAllConfirm")}\n\n${t("git.revertAllMessage")}`, {
      title: t("git.revertAllTitle"),
      kind: "warning",
    });
    if (!confirmed) {
      return;
    }
    await handleMutation(() => revertGitAll(workspaceId));
  }, [handleMutation, t, workspaceId]);

  const handleGenerateCommitMessage = useCallback(async () => {
    if (commitMessageLoading || commitLoading) {
      return;
    }
    setCommitMessageError(null);
    setCommitMessageLoading(true);
    try {
      const generated = await generateCommitMessage(workspaceId);
      setCommitMessage(generated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCommitMessageError(message);
    } finally {
      setCommitMessageLoading(false);
    }
  }, [commitLoading, commitMessageLoading, workspaceId]);

  const hasWorktreeChanges = status.stagedFiles.length > 0 || status.unstagedFiles.length > 0;
  const canCommit = commitMessage.trim().length > 0 && hasWorktreeChanges && !commitLoading;

  const handleCommit = useCallback(async () => {
    if (!canCommit) {
      return;
    }
    setCommitMessageError(null);
    setCommitLoading(true);
    try {
      if (status.stagedFiles.length === 0 && status.unstagedFiles.length > 0) {
        await stageGitAll(workspaceId);
      }
      await commitGit(workspaceId, commitMessage.trim());
      setCommitMessage("");
      await refreshStatus();
      await onMutated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCommitMessageError(message);
    } finally {
      setCommitLoading(false);
    }
  }, [
    canCommit,
    commitMessage,
    onMutated,
    refreshStatus,
    status.stagedFiles.length,
    status.unstagedFiles.length,
    workspaceId,
  ]);

  const stagedFiles = useMemo(
    () => status.stagedFiles.slice().sort((left, right) => left.path.localeCompare(right.path)),
    [status.stagedFiles],
  );
  const unstagedFiles = useMemo(
    () => status.unstagedFiles.slice().sort((left, right) => left.path.localeCompare(right.path)),
    [status.unstagedFiles],
  );

  const statusErrorText = normalizeErrorMessage(statusError, t);
  const operationErrorText = normalizeErrorMessage(operationError, t);
  const commitMessageErrorText = normalizeErrorMessage(commitMessageError, t);

  const toggleFolder = useCallback((key: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const renderFileRow = useCallback(
    (file: GitFileStatus, section: DiffSection, depth = 0) => {
      const { name, dir } = splitPath(file.path);
      const showStage = section === "unstaged";
      const showUnstage = section === "staged";
      const showDiscard = section === "unstaged";
      const clickable = Boolean(onOpenDiffPath);
      return (
        <div
          key={`${section}:${file.path}`}
          className={`git-history-worktree-file-row ${listView === "tree" ? "is-tree" : ""} ${
            clickable ? "is-clickable" : ""
          }`}
          style={depth > 0 ? { paddingLeft: `${10 + depth * 16}px` } : undefined}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={() => {
            onOpenDiffPath?.(file.path);
          }}
          onKeyDown={(event) => {
            if (!clickable) {
              return;
            }
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenDiffPath?.(file.path);
            }
          }}
        >
          <span className="git-history-worktree-file-status" aria-hidden>
            {statusSymbol(file.status)}
          </span>
          <span className="git-history-worktree-file-icon" aria-hidden>
            <FileIcon filePath={file.path} />
          </span>
          <span className="git-history-worktree-file-path" title={file.path}>
            {listView === "tree" ? <strong>{name}</strong> : <><strong>{name}</strong>{dir ? <em>{dir}</em> : null}</>}
          </span>
          <span className="git-history-worktree-file-stats" aria-label={`+${file.additions} -${file.deletions}`}>
            <span className="is-add">+{file.additions}</span>
            <span className="is-sep">/</span>
            <span className="is-del">-{file.deletions}</span>
          </span>
          <span className="git-history-worktree-file-actions" role="group" aria-label={t("git.fileActions")}>
            {showStage ? (
              <button
                type="button"
                className="git-history-worktree-action git-history-worktree-action-stage diff-row-action diff-row-action--stage"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleMutation(() => stageGitFile(workspaceId, file.path));
                }}
                disabled={operationLoading}
                title={t("git.stageFile")}
                aria-label={t("git.stageFile")}
              >
                <Plus size={12} aria-hidden />
              </button>
            ) : null}
            {showUnstage ? (
              <button
                type="button"
                className="git-history-worktree-action git-history-worktree-action-unstage diff-row-action diff-row-action--unstage"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleMutation(() => unstageGitFile(workspaceId, file.path));
                }}
                disabled={operationLoading}
                title={t("git.unstageFile")}
                aria-label={t("git.unstageFile")}
              >
                <Minus size={12} aria-hidden />
              </button>
            ) : null}
            {showDiscard ? (
              <button
                type="button"
                className="git-history-worktree-action git-history-worktree-action-discard diff-row-action diff-row-action--discard"
                onClick={(event) => {
                  event.stopPropagation();
                  void discardFiles([file.path]);
                }}
                disabled={operationLoading}
                title={t("git.discardFile")}
                aria-label={t("git.discardFile")}
              >
                <RotateCcw size={12} aria-hidden />
              </button>
            ) : null}
          </span>
        </div>
      );
    },
    [
      discardFiles,
      handleMutation,
      listView,
      onOpenDiffPath,
      operationLoading,
      t,
      workspaceId,
    ],
  );

  const renderTreeRows = useCallback(
    (files: GitFileStatus[], section: DiffSection) => {
      const tree = buildDiffTree(files, section);
      const walk = (node: DiffTreeNode, depth: number): ReactNode[] => {
        const rows: ReactNode[] = [];
        const folders = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const folder of folders) {
          const collapsed = collapsedFolders.has(folder.key);
          rows.push(
            <button
              key={folder.key}
              type="button"
              className="git-history-worktree-folder-row"
              style={{ paddingLeft: `${10 + depth * 16}px` }}
              onClick={() => toggleFolder(folder.key)}
            >
              <span className="git-history-worktree-folder-caret" aria-hidden>
                {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </span>
              <Folder size={13} />
              <span className="git-history-worktree-folder-name">{folder.name}</span>
            </button>,
          );
          if (!collapsed) {
            rows.push(...walk(folder, depth + 1));
          }
        }

        const leafFiles = node.files.slice().sort((a, b) => a.path.localeCompare(b.path));
        for (const file of leafFiles) {
          rows.push(renderFileRow(file, section, depth));
        }

        return rows;
      };

      return walk(tree, 0);
    },
    [collapsedFolders, renderFileRow, toggleFolder],
  );

  const renderSectionRows = useCallback(
    (files: GitFileStatus[], section: DiffSection) => {
      if (!files.length) {
        return <div className="git-history-empty">{t("git.noChangesDetected")}</div>;
      }
      if (listView === "tree") {
        return renderTreeRows(files, section);
      }
      return files.map((file) => renderFileRow(file, section));
    },
    [listView, renderFileRow, renderTreeRows, t],
  );

  return (
    <div className="git-history-worktree-panel">
      <div className="git-history-worktree-commit-box">
        <div className="git-history-worktree-commit-input-wrap">
          <textarea
            className="git-history-worktree-commit-input"
            placeholder={t("git.commitMessage")}
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            disabled={commitMessageLoading || commitLoading || operationLoading}
            rows={3}
          />
          <button
            type="button"
            className="git-history-worktree-generate diff-row-action"
            onClick={() => {
              void handleGenerateCommitMessage();
            }}
            disabled={commitMessageLoading || commitLoading || operationLoading}
            title={t("git.generateCommitMessage")}
            aria-label={t("git.generateCommitMessage")}
          >
            <Sparkles size={14} aria-hidden />
          </button>
        </div>

        <button
          type="button"
          className="git-history-worktree-commit-btn"
          onClick={() => {
            void handleCommit();
          }}
          disabled={!canCommit || commitMessageLoading || operationLoading}
        >
          <Check size={14} />
          <span>{commitLoading ? t("git.committing") : t("git.commit")}</span>
        </button>

        {statusErrorText ? <div className="git-history-error">{statusErrorText}</div> : null}
        {operationErrorText ? <div className="git-history-error">{operationErrorText}</div> : null}
        {commitMessageErrorText ? <div className="git-history-error">{commitMessageErrorText}</div> : null}
      </div>

      <div className="git-history-worktree-sections">
        <div className="git-history-worktree-section">
          <div className="git-history-worktree-section-header">
            <span>
              {t("git.staged")} ({stagedFiles.length})
            </span>
            <div className="git-history-worktree-section-actions">
              {stagedFiles.length > 0 ? (
                <button
                  type="button"
                  className="git-history-worktree-action git-history-worktree-action-unstage diff-row-action diff-row-action--unstage"
                  onClick={() => {
                    void handleMutation(async () => {
                      for (const file of stagedFiles) {
                        await unstageGitFile(workspaceId, file.path);
                      }
                    });
                  }}
                  disabled={operationLoading}
                  title={t("git.unstageAllChangesAction")}
                  aria-label={t("git.unstageAllChangesAction")}
                >
                  <Minus size={12} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
          <div className="git-history-worktree-section-list">{renderSectionRows(stagedFiles, "staged")}</div>
        </div>

        <div className="git-history-worktree-section">
          <div className="git-history-worktree-section-header">
            <span>
              {t("git.unstaged")} ({unstagedFiles.length})
            </span>
            <div className="git-history-worktree-section-actions">
              {unstagedFiles.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="git-history-worktree-action git-history-worktree-action-stage diff-row-action diff-row-action--stage"
                    onClick={() => {
                      void handleMutation(() => stageGitAll(workspaceId));
                    }}
                    disabled={operationLoading}
                    title={t("git.stageAllChangesAction")}
                    aria-label={t("git.stageAllChangesAction")}
                  >
                    <Plus size={12} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="git-history-worktree-action git-history-worktree-action-discard diff-row-action diff-row-action--discard"
                    onClick={() => {
                      void handleDiscardAll();
                    }}
                    disabled={operationLoading}
                    title={t("git.discardAllChangesAction")}
                    aria-label={t("git.discardAllChangesAction")}
                  >
                    <RotateCcw size={12} aria-hidden />
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="git-history-worktree-section-list">{renderSectionRows(unstagedFiles, "unstaged")}</div>
        </div>
      </div>
    </div>
  );
}
