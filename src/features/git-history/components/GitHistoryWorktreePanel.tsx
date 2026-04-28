import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Check from "lucide-react/dist/esm/icons/check";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import CircleCheckBig from "lucide-react/dist/esm/icons/circle-check-big";
import Minus from "lucide-react/dist/esm/icons/minus";
import Plus from "lucide-react/dist/esm/icons/plus";
import SquarePen from "lucide-react/dist/esm/icons/square-pen";
import Undo2 from "lucide-react/dist/esm/icons/undo-2";
import FileIcon from "../../../components/FileIcon";
import { CommitMessageEngineIcon } from "../../git/components/CommitMessageEngineIcon";
import {
  type CommitMessageEngine,
  type CommitMessageLanguage,
  commitGit,
  generateCommitMessageWithEngine,
  getGitStatus,
  revertGitAll,
  revertGitFile,
  stageGitAll,
  stageGitFile,
  unstageGitFile,
} from "../../../services/tauri";
import type { GitFileStatus } from "../../../types";
import { sanitizeGeneratedCommitMessage } from "../../../utils/commitMessage";
import { localizeGitErrorMessage } from "../gitErrorI18n";

type GitHistoryWorktreePanelProps = {
  workspaceId: string;
  listView: "flat" | "tree";
  commitSectionCollapsed?: boolean;
  rootFolderName?: string;
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

type CollapsedFolder = {
  key: string;
  name: string;
  iconName: string;
  node: DiffTreeNode;
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
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) {
    return { name: "", dir: "" };
  }
  if (parts.length <= 1) {
    return { name: parts[0] ?? "", dir: "" };
  }
  return { name: parts[parts.length - 1], dir: parts.slice(0, -1).join("/") };
}

function getPathLeafName(path: string | null | undefined): string {
  if (!path) {
    return "";
  }
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    return "";
  }
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
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

function getTreeLineOpacity(depth: number): string {
  return depth === 1 ? "1" : "0";
}

function buildDiffTree(files: GitFileStatus[], section: DiffSection): DiffTreeNode {
  const root: DiffTreeNode = {
    key: `${section}:/`,
    name: "",
    folders: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index] ?? "";
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

function collapseFolderChain(node: DiffTreeNode): CollapsedFolder {
  return {
    key: node.key,
    name: node.name,
    iconName: node.name,
    node,
  };
}

function normalizeErrorMessage(
  raw: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const localized = localizeGitErrorMessage(raw, t);
  if (!raw) {
    return localized;
  }
  const isCodexRequired =
    raw.includes("requires the Codex CLI") || raw.includes("workspace not connected");
  if (isCodexRequired) {
    return t("git.commitMessageRequiresCodex");
  }
  return localized;
}

function renderSectionIndicator(
  section: DiffSection,
  count: number,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const label = section === "staged" ? t("git.staged") : t("git.unstaged");
  const Icon = section === "staged" ? CircleCheckBig : SquarePen;
  return (
    <span
      className={`git-history-worktree-section-indicator is-${section}`}
      aria-label={`${label} (${count})`}
      title={label}
    >
      <Icon size={12} aria-hidden />
      <strong>{count}</strong>
    </span>
  );
}

export function GitHistoryWorktreePanel({
  workspaceId,
  listView,
  commitSectionCollapsed = false,
  rootFolderName,
  onMutated,
  onOpenDiffPath,
  onSummaryChange,
}: GitHistoryWorktreePanelProps) {
  const { t } = useTranslation();
  const requestIdRef = useRef(0);
  const resolvedRootFolderName = useMemo(
    () => rootFolderName?.trim() || getPathLeafName(workspaceId) || workspaceId,
    [rootFolderName, workspaceId],
  );

  const [status, setStatus] = useState<GitStatusState>(EMPTY_STATUS);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [operationLoading, setOperationLoading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [discardDialogPaths, setDiscardDialogPaths] = useState<string[] | null>(null);
  const [discardAllDialogOpen, setDiscardAllDialogOpen] = useState(false);

  const [commitMessage, setCommitMessage] = useState("");
  const [commitMessageLoading, setCommitMessageLoading] = useState(false);
  const [commitMessageError, setCommitMessageError] = useState<string | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitMessageMenuEngine, setCommitMessageMenuEngine] = useState<CommitMessageEngine>("claude");

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
    setDiscardDialogPaths(null);
    setCollapsedFolders(new Set());
    setDiscardAllDialogOpen(false);
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
      if (operationLoading) {
        return;
      }
      setDiscardDialogPaths(paths);
    },
    [operationLoading],
  );

  const handleConfirmDiscardFiles = useCallback(async () => {
    if (operationLoading || !discardDialogPaths || discardDialogPaths.length === 0) {
      return;
    }
    const targetPaths = [...discardDialogPaths];
    setDiscardDialogPaths(null);
    await handleMutation(async () => {
      for (const path of targetPaths) {
        await revertGitFile(workspaceId, path);
      }
    });
  }, [discardDialogPaths, handleMutation, operationLoading, workspaceId]);

  const handleDiscardAll = useCallback(() => {
    if (operationLoading || status.unstagedFiles.length === 0) {
      return;
    }
    setDiscardAllDialogOpen(true);
  }, [operationLoading, status.unstagedFiles.length]);

  const handleConfirmDiscardAll = useCallback(async () => {
    if (operationLoading) {
      return;
    }
    setDiscardAllDialogOpen(false);
    await handleMutation(() => revertGitAll(workspaceId));
  }, [handleMutation, operationLoading, workspaceId]);

  const handleGenerateCommitMessage = useCallback(async (
    language: CommitMessageLanguage = "zh",
    engine: CommitMessageEngine = "codex",
  ) => {
    if (commitMessageLoading || commitLoading) {
      return;
    }
    setCommitMessageError(null);
    setCommitMessageLoading(true);
    try {
      const generated = await generateCommitMessageWithEngine(workspaceId, language, engine);
      setCommitMessage(sanitizeGeneratedCommitMessage(generated));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCommitMessageError(message);
    } finally {
      setCommitMessageLoading(false);
    }
  }, [commitLoading, commitMessageLoading, workspaceId]);

  const showCommitMessageLanguageMenu = useCallback(
    async (engine: CommitMessageEngine, position: LogicalPosition) => {
      if (commitMessageLoading || commitLoading || operationLoading) {
        return;
      }
      const items = [
        await MenuItem.new({
          text: t("git.generateCommitMessageChinese"),
          action: async () => {
            setCommitMessageMenuEngine(engine);
            await handleGenerateCommitMessage("zh", engine);
          },
        }),
        await MenuItem.new({
          text: t("git.generateCommitMessageEnglish"),
          action: async () => {
            setCommitMessageMenuEngine(engine);
            await handleGenerateCommitMessage("en", engine);
          },
        }),
      ];
      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      await menu.popup(position, window);
    },
    [commitLoading, commitMessageLoading, handleGenerateCommitMessage, operationLoading, t],
  );
  const showCommitMessageEngineMenu = useCallback(
    async (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (commitMessageLoading || commitLoading || operationLoading) {
        return;
      }
      const position = new LogicalPosition(event.clientX, event.clientY);
      const engineItems: Array<{ engine: CommitMessageEngine; label: string }> = [
        { engine: "codex", label: t("git.generateCommitMessageEngineCodex") },
        { engine: "claude", label: t("git.generateCommitMessageEngineClaude") },
        { engine: "gemini", label: t("git.generateCommitMessageEngineGemini") },
        { engine: "opencode", label: t("git.generateCommitMessageEngineOpenCode") },
      ];
      const items = await Promise.all(
        engineItems.map(async ({ engine, label }) =>
          MenuItem.new({
            text: label,
            action: async () => {
              await showCommitMessageLanguageMenu(engine, position);
            },
          }),
        ),
      );
      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      await menu.popup(position, window);
    },
    [commitLoading, commitMessageLoading, operationLoading, showCommitMessageLanguageMenu, t],
  );

  const hasWorktreeChanges = status.stagedFiles.length > 0 || status.unstagedFiles.length > 0;
  const stagedFiles = useMemo(
    () => status.stagedFiles.slice().sort((left, right) => left.path.localeCompare(right.path)),
    [status.stagedFiles],
  );
  const unstagedFiles = useMemo(
    () => status.unstagedFiles.slice().sort((left, right) => left.path.localeCompare(right.path)),
    [status.unstagedFiles],
  );
  const hasStagedFiles = stagedFiles.length > 0;
  const hasUnstagedFiles = unstagedFiles.length > 0;
  const canCommit = commitMessage.trim().length > 0 && hasStagedFiles && !commitLoading;

  const handleCommit = useCallback(async () => {
    if (!canCommit) {
      return;
    }
    setCommitMessageError(null);
    setCommitLoading(true);
    try {
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
    workspaceId,
  ]);
  const revertAllPreviewPaths = useMemo(
    () => status.files.map((file) => file.path).slice().sort((left, right) => left.localeCompare(right)),
    [status.files],
  );

  const statusErrorText = normalizeErrorMessage(statusError, t);
  const operationErrorText = normalizeErrorMessage(operationError, t);
  const commitMessageErrorText = normalizeErrorMessage(commitMessageError, t);
  const shouldShowFileSections = hasStagedFiles || hasUnstagedFiles;
  const worktreeSectionsClassName = `git-history-worktree-sections${
    hasStagedFiles !== hasUnstagedFiles ? " is-single" : ""
  }`;
  const visibleSectionCount = Number(hasStagedFiles) + Number(hasUnstagedFiles);
  const compactSection =
    visibleSectionCount === 1
      ? hasStagedFiles
        ? "staged"
        : "unstaged"
      : null;
  const compactSummaryLabel =
    compactSection === "staged"
      ? renderSectionIndicator("staged", stagedFiles.length, t)
      : compactSection === "unstaged"
        ? renderSectionIndicator("unstaged", unstagedFiles.length, t)
        : null;
  const compactSummaryBranch = status.branchName || resolvedRootFolderName;
  const commitStatusHint = hasStagedFiles
    ? t("git.selectedFilesForCommit", { count: stagedFiles.length })
    : hasUnstagedFiles
      ? t("git.selectFilesToCommit")
      : t("git.noChangesToCommit");
  const commitButtonTitle = !commitMessage.trim()
    ? t("git.enterCommitMessage")
    : hasStagedFiles
      ? t("git.commitStagedChanges")
      : hasUnstagedFiles
        ? t("git.selectFilesToCommit")
        : t("git.noChangesToCommit");

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
      const treeIndentPx = depth * 16;
      const treeRowStyle =
        listView === "tree"
          ? ({
              paddingLeft: `${treeIndentPx}px`,
              ["--git-tree-indent-x" as string]: `${Math.max(treeIndentPx - 7, 0)}px`,
              ["--git-tree-line-opacity" as string]: getTreeLineOpacity(depth),
            } as CSSProperties)
          : undefined;
      return (
        <div
          key={`${section}:${file.path}`}
          className={`git-history-worktree-file-row git-filetree-row ${listView === "tree" ? "is-tree" : ""} ${
            clickable ? "is-clickable" : ""
          }`}
          data-status={file.status}
          data-section={section}
          style={treeRowStyle}
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
          <span
            className="git-history-worktree-file-stats git-filetree-badge"
            aria-label={`+${file.additions} -${file.deletions}`}
          >
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
                <Undo2 size={12} aria-hidden />
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
      const rootFolderKey = `${section}:__repo_root__/`;
      const rootCollapsed = collapsedFolders.has(rootFolderKey);
      const walk = (node: DiffTreeNode, depth: number): ReactNode[] => {
        const rows: ReactNode[] = [];
        const folders = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const folder of folders) {
          const collapsedFolder = collapseFolderChain(folder);
          const collapsed = collapsedFolders.has(collapsedFolder.key);
          const treeIndentPx = depth * 16;
          const folderStyle = {
            paddingLeft: `${treeIndentPx}px`,
            ["--git-tree-indent-x" as string]: `${Math.max(treeIndentPx - 7, 0)}px`,
            ["--git-tree-line-opacity" as string]: getTreeLineOpacity(depth),
          } as CSSProperties;
          const childTreeStyle = {
            ["--git-tree-branch-x" as string]: `${Math.max((depth + 1) * 16 - 7, 0)}px`,
            ["--git-tree-branch-opacity" as string]: getTreeLineOpacity(depth + 1),
          } as CSSProperties;
          rows.push(
            <div key={collapsedFolder.key} className="git-history-worktree-folder-group">
              <button
                type="button"
                className="git-history-worktree-folder-row git-filetree-folder-row"
                style={folderStyle}
                onClick={() => toggleFolder(collapsedFolder.key)}
              >
                <span className="git-history-worktree-folder-caret" aria-hidden>
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </span>
                <FileIcon
                  filePath={collapsedFolder.iconName}
                  isFolder
                  isOpen={!collapsed}
                  className="git-history-worktree-folder-icon"
                />
                <span className="git-history-worktree-folder-name">{collapsedFolder.name}</span>
              </button>
              {!collapsed ? (
                <div className="git-history-worktree-folder-children" style={childTreeStyle}>
                  {walk(collapsedFolder.node, depth + 1)}
                </div>
              ) : null}
            </div>,
          );
        }

        const leafFiles = node.files.slice().sort((a, b) => a.path.localeCompare(b.path));
        for (const file of leafFiles) {
          rows.push(renderFileRow(file, section, depth));
        }

        return rows;
      };

      const rootChildrenStyle = {
        ["--git-tree-branch-x" as string]: `${Math.max(1 * 16 - 7, 0)}px`,
        ["--git-tree-branch-opacity" as string]: getTreeLineOpacity(1),
      } as CSSProperties;

      return [
        <div key={rootFolderKey} className="git-history-worktree-folder-group">
          <button
            type="button"
            className="git-history-worktree-folder-row git-filetree-folder-row"
            style={{ paddingLeft: "0px" }}
            onClick={() => toggleFolder(rootFolderKey)}
          >
            <span className="git-history-worktree-folder-caret" aria-hidden>
              {rootCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
            <FileIcon
              filePath={resolvedRootFolderName}
              isFolder
              isOpen={!rootCollapsed}
              className="git-history-worktree-folder-icon"
            />
            <span className="git-history-worktree-folder-name">{resolvedRootFolderName}</span>
          </button>
          {!rootCollapsed ? (
            <div className="git-history-worktree-folder-children" style={rootChildrenStyle}>
              {walk(tree, 1)}
            </div>
          ) : null}
        </div>,
      ];
    },
    [collapsedFolders, renderFileRow, resolvedRootFolderName, toggleFolder],
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
      {!commitSectionCollapsed ? (
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
              className={`git-history-worktree-generate diff-row-action${commitMessageLoading ? " git-history-worktree-generate--loading" : ""}`}
              onClick={(event) => {
                void showCommitMessageEngineMenu(event);
              }}
              disabled={commitMessageLoading || commitLoading || operationLoading}
              aria-haspopup="menu"
              title={t("git.generateCommitMessage")}
              aria-label={t("git.generateCommitMessage")}
            >
              <CommitMessageEngineIcon
                engine={commitMessageMenuEngine}
                size={13}
                className={`git-history-worktree-engine-icon${commitMessageLoading ? " git-history-worktree-engine-icon--spinning" : ""}`}
              />
            </button>
          </div>
          {hasWorktreeChanges ? (
            <div className="git-history-worktree-commit-hint" aria-live="polite">
              {commitStatusHint}
            </div>
          ) : null}

          <button
            type="button"
            className="git-history-worktree-commit-btn"
            onClick={() => {
              void handleCommit();
            }}
            disabled={!canCommit || commitMessageLoading || operationLoading}
            title={commitButtonTitle}
          >
            <Check size={14} />
            <span>{commitLoading ? t("git.committing") : t("git.commit")}</span>
          </button>

        </div>
      ) : null}
      {statusErrorText ? <div className="git-history-error">{statusErrorText}</div> : null}
      {operationErrorText ? <div className="git-history-error">{operationErrorText}</div> : null}
      {commitMessageErrorText ? <div className="git-history-error">{commitMessageErrorText}</div> : null}

      {shouldShowFileSections ? (
        <div className={worktreeSectionsClassName}>
          {compactSection && compactSummaryLabel ? (
            <div className="git-history-worktree-summary-bar">
              <span
                className="git-history-worktree-summary-lines"
                aria-label={`+${status.totalAdditions} -${status.totalDeletions}`}
              >
                <span className="git-history-diff-add">+{status.totalAdditions}</span>
                <span className="git-history-diff-sep" aria-hidden>
                  /
                </span>
                <span className="git-history-diff-del">-{status.totalDeletions}</span>
              </span>
              <span className="git-history-worktree-summary-branch" title={compactSummaryBranch}>
                <strong>{compactSummaryBranch}</strong>
              </span>
              <span className="git-history-worktree-summary-label">{compactSummaryLabel}</span>
              <div className="git-history-worktree-summary-actions" role="group" aria-label={t("git.fileActions")}>
                {compactSection === "staged" ? (
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
                {compactSection === "unstaged" ? (
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
                        handleDiscardAll();
                      }}
                      disabled={operationLoading}
                      title={t("git.discardAllChangesAction")}
                      aria-label={t("git.discardAllChangesAction")}
                    >
                      <Undo2 size={12} aria-hidden />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          {hasStagedFiles ? (
            <div className="git-history-worktree-section git-filetree-section">
              <div
                className="git-history-worktree-section-header git-filetree-section-header"
                hidden={compactSection === "staged"}
              >
                <span>{renderSectionIndicator("staged", stagedFiles.length, t)}</span>
                <div className="git-history-worktree-section-actions git-filetree-section-actions">
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
                </div>
              </div>
              <div className="git-history-worktree-section-list git-filetree-list">
                {renderSectionRows(stagedFiles, "staged")}
              </div>
            </div>
          ) : null}

          {hasUnstagedFiles ? (
            <div className="git-history-worktree-section git-filetree-section">
              <div
                className="git-history-worktree-section-header git-filetree-section-header"
                hidden={compactSection === "unstaged"}
              >
                <span>{renderSectionIndicator("unstaged", unstagedFiles.length, t)}</span>
                <div className="git-history-worktree-section-actions git-filetree-section-actions">
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
                      handleDiscardAll();
                    }}
                    disabled={operationLoading}
                    title={t("git.discardAllChangesAction")}
                    aria-label={t("git.discardAllChangesAction")}
                  >
                    <Undo2 size={12} aria-hidden />
                  </button>
                </div>
              </div>
              <div className="git-history-worktree-section-list git-filetree-list">
                {renderSectionRows(unstagedFiles, "unstaged")}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="git-history-empty">{t("git.noChangesDetected")}</div>
      )}
      {discardAllDialogOpen ? (
        <div
          className="git-history-create-branch-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !operationLoading) {
              setDiscardAllDialogOpen(false);
            }
          }}
        >
          <div
            className="git-history-worktree-danger-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("git.revertAllTitle")}
          >
            <div className="git-history-create-branch-title">{t("git.revertAllTitle")}</div>
            <div className="git-history-worktree-danger-copy">
              <p>{t("git.revertAllBeginnerLead")}</p>
              <div className="git-history-worktree-danger-list">
                <div className="git-history-worktree-danger-list-title">{t("git.revertAllAffectsLabel")}</div>
                <ul>
                  <li>
                    <span className="git-history-danger-keyword">{t("git.revertAllKeywordStaged")}</span>
                  </li>
                  <li>
                    <span className="git-history-danger-keyword">{t("git.revertAllKeywordUnstaged")}</span>
                  </li>
                  <li>
                    <span className="git-history-danger-keyword">{t("git.revertAllKeywordUntracked")}</span>
                  </li>
                </ul>
              </div>
              <div className="git-history-worktree-danger-list">
                <div className="git-history-worktree-danger-list-title">
                  {t("git.revertAllFilesPreviewLabel", { count: revertAllPreviewPaths.length })}
                </div>
                <ul>
                  {revertAllPreviewPaths.map((path) => (
                    <li key={path}>
                      <code className="git-history-worktree-danger-file">{path}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="git-history-worktree-danger-note">
                <span className="git-history-danger-keyword">{t("git.revertAllKeywordIrreversible")}</span>
                <span>{t("git.revertAllBeginnerHint")}</span>
              </div>
            </div>
            <div className="git-history-create-branch-actions">
              <button
                type="button"
                className="git-history-create-branch-btn is-cancel"
                disabled={operationLoading}
                onClick={() => setDiscardAllDialogOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="git-history-create-branch-btn is-danger"
                disabled={operationLoading}
                onClick={() => void handleConfirmDiscardAll()}
              >
                {operationLoading ? t("common.loading") : t("git.revertAllConfirmAction")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {discardDialogPaths ? (
        <div
          className="git-history-create-branch-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !operationLoading) {
              setDiscardDialogPaths(null);
            }
          }}
        >
          <div
            className="git-history-worktree-danger-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("git.discardConfirmTitle")}
          >
            <div className="git-history-create-branch-title">{t("git.discardConfirmTitle")}</div>
            <div className="git-history-worktree-danger-copy">
              <p>{t("git.discardDialogBeginnerLead")}</p>
              <div className="git-history-worktree-danger-list">
                <div className="git-history-worktree-danger-list-title">{t("git.discardDialogAffectsLabel")}</div>
                <ul>
                  {discardDialogPaths.map((path) => (
                    <li key={path}>
                      <code className="git-history-worktree-danger-file">{path}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="git-history-worktree-danger-note">
                <span className="git-history-danger-keyword">{t("git.revertAllKeywordIrreversible")}</span>
                <span>{t("git.discardDialogBeginnerHint")}</span>
              </div>
            </div>
            <div className="git-history-create-branch-actions">
              <button
                type="button"
                className="git-history-create-branch-btn is-cancel"
                disabled={operationLoading}
                onClick={() => setDiscardDialogPaths(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="git-history-create-branch-btn is-danger"
                disabled={operationLoading}
                onClick={() => void handleConfirmDiscardFiles()}
              >
                {operationLoading ? t("common.loading") : t("git.discardDialogConfirmAction")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
