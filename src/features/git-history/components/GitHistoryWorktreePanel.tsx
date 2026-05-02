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
  CommitButton,
  useGitCommitSelection,
} from "../../git/components/GitDiffPanelCommitScope";
import {
  type InclusionState,
  InclusionToggle,
  getFileInclusionState,
} from "../../git/components/GitDiffPanelInclusion";
import { GitDiffPanelSectionActions } from "../../git/components/GitDiffPanelSectionActions";
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
import { runScopedCommitOperation } from "../../git/utils/commitScope";

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
  path: string;
  descendantPaths: string[];
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

function diffStatusClass(status: string) {
  switch (status) {
    case "A":
      return "diff-icon-added";
    case "M":
      return "diff-icon-modified";
    case "D":
      return "diff-icon-deleted";
    case "R":
      return "diff-icon-renamed";
    case "T":
      return "diff-icon-typechange";
    default:
      return "diff-icon-unknown";
  }
}

function hasToggleablePaths(
  paths: string[],
  isCommitPathLocked: (path: string) => boolean,
) {
  return paths.some((path) => !isCommitPathLocked(path));
}

function getToggleablePaths(
  paths: string[],
  isCommitPathLocked: (path: string) => boolean,
) {
  return paths.filter((path) => !isCommitPathLocked(path));
}

function getTreeLineOpacity(depth: number): string {
  return depth === 1 ? "1" : "0";
}

function buildDiffTree(files: GitFileStatus[], section: DiffSection): DiffTreeNode {
  const root: DiffTreeNode = {
    key: `${section}:/`,
    name: "",
    path: "",
    descendantPaths: [],
    folders: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    root.descendantPaths.push(file.path);
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const segment = parts[index] ?? "";
      const key = `${node.key}${segment}/`;
      let child = node.folders.get(segment);
      if (!child) {
        child = {
          key,
          name: segment,
          path: node.path ? `${node.path}/${segment}` : segment,
          descendantPaths: [],
          folders: new Map(),
          files: [],
        };
        node.folders.set(segment, child);
      }
      child.descendantPaths.push(file.path);
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

function getGroupInclusionState(
  paths: string[],
  includedPaths: Set<string>,
  excludedPaths: Set<string>,
  partialPaths: Set<string>,
): InclusionState {
  if (paths.length === 0) {
    return "none";
  }
  let hasIncluded = false;
  let hasExcluded = false;
  for (const path of paths) {
    const state = getFileInclusionState(
      path,
      includedPaths,
      excludedPaths,
      partialPaths,
    );
    if (state === "partial") {
      return "partial";
    }
    if (state === "all") {
      hasIncluded = true;
    } else {
      hasExcluded = true;
    }
    if (hasIncluded && hasExcluded) {
      return "partial";
    }
  }
  return hasIncluded ? "all" : "none";
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

  const hasWorktreeChanges = status.stagedFiles.length > 0 || status.unstagedFiles.length > 0;
  const stagedFiles = useMemo(
    () => status.stagedFiles.slice().sort((left, right) => left.path.localeCompare(right.path)),
    [status.stagedFiles],
  );
  const unstagedFiles = useMemo(
    () => status.unstagedFiles.slice().sort((left, right) => left.path.localeCompare(right.path)),
    [status.unstagedFiles],
  );
  const {
    selectedCommitPaths,
    selectedCommitCount,
    hasExplicitCommitSelection,
    includedCommitPaths,
    excludedCommitPaths,
    partialCommitPaths,
    isCommitPathLocked,
    setCommitSelection,
  } = useGitCommitSelection({
    stagedFiles,
    unstagedFiles,
  });
  const includedCommitPathSet = useMemo(
    () => new Set(includedCommitPaths),
    [includedCommitPaths],
  );
  const excludedCommitPathSet = useMemo(
    () => new Set(excludedCommitPaths),
    [excludedCommitPaths],
  );
  const partialCommitPathSet = useMemo(
    () => new Set(partialCommitPaths),
    [partialCommitPaths],
  );
  const stagedFilePaths = useMemo(
    () => stagedFiles.map((file) => file.path),
    [stagedFiles],
  );
  const unstagedFilePaths = useMemo(
    () => unstagedFiles.map((file) => file.path),
    [unstagedFiles],
  );
  const stagedToggleablePaths = useMemo(
    () => stagedFilePaths.filter((path) => !isCommitPathLocked(path)),
    [isCommitPathLocked, stagedFilePaths],
  );
  const unstagedToggleablePaths = useMemo(
    () => unstagedFilePaths.filter((path) => !isCommitPathLocked(path)),
    [isCommitPathLocked, unstagedFilePaths],
  );
  const stagedSectionInclusionState = useMemo(
    () =>
      getGroupInclusionState(
        stagedFilePaths,
        includedCommitPathSet,
        excludedCommitPathSet,
        partialCommitPathSet,
      ),
    [
      excludedCommitPathSet,
      includedCommitPathSet,
      partialCommitPathSet,
      stagedFilePaths,
    ],
  );
  const unstagedSectionInclusionState = useMemo(
    () =>
      getGroupInclusionState(
        unstagedFilePaths,
        includedCommitPathSet,
        excludedCommitPathSet,
        partialCommitPathSet,
      ),
    [
      excludedCommitPathSet,
      includedCommitPathSet,
      partialCommitPathSet,
      unstagedFilePaths,
    ],
  );
  const hasStagedFiles = stagedFiles.length > 0;
  const hasUnstagedFiles = unstagedFiles.length > 0;

  const handleGenerateCommitMessage = useCallback(
    async (
      language: CommitMessageLanguage = "zh",
      engine: CommitMessageEngine = "codex",
      selectedPaths?: string[],
    ) => {
      if (commitMessageLoading || commitLoading) {
        return;
      }
      setCommitMessageError(null);
      setCommitMessageLoading(true);
      try {
        const generated = await generateCommitMessageWithEngine(
          workspaceId,
          language,
          engine,
          selectedPaths,
        );
        setCommitMessage(sanitizeGeneratedCommitMessage(generated));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCommitMessageError(message);
      } finally {
        setCommitMessageLoading(false);
      }
    },
    [commitLoading, commitMessageLoading, workspaceId],
  );

  const showCommitMessageLanguageMenu = useCallback(
    async (engine: CommitMessageEngine, position: LogicalPosition) => {
      if (commitMessageLoading || commitLoading || operationLoading) {
        return;
      }
      const selectedPathsForGeneration =
        selectedCommitCount > 0
          ? selectedCommitPaths
          : hasExplicitCommitSelection
            ? []
            : undefined;
      const items = [
        await MenuItem.new({
          text: t("git.generateCommitMessageChinese"),
          action: async () => {
            setCommitMessageMenuEngine(engine);
            await handleGenerateCommitMessage("zh", engine, selectedPathsForGeneration);
          },
        }),
        await MenuItem.new({
          text: t("git.generateCommitMessageEnglish"),
          action: async () => {
            setCommitMessageMenuEngine(engine);
            await handleGenerateCommitMessage("en", engine, selectedPathsForGeneration);
          },
        }),
      ];
      const menu = await Menu.new({ items });
      const window = getCurrentWindow();
      await menu.popup(position, window);
    },
    [
      commitLoading,
      commitMessageLoading,
      handleGenerateCommitMessage,
      operationLoading,
      selectedCommitCount,
      selectedCommitPaths,
      hasExplicitCommitSelection,
      t,
    ],
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
  const handleCommit = useCallback(
    async (selectedPaths?: string[]) => {
      if (
        commitLoading ||
        operationLoading ||
        commitMessageLoading ||
        !commitMessage.trim()
      ) {
        return;
      }
      setCommitMessageError(null);
      setCommitLoading(true);
      try {
        const result = await runScopedCommitOperation({
          workspaceId,
          gitStatus: {
            stagedFiles: status.stagedFiles,
            unstagedFiles: status.unstagedFiles,
          },
          selectedPaths: selectedPaths ?? selectedCommitPaths,
          commitMessage,
          stageFile: stageGitFile,
          unstageFile: unstageGitFile,
          commit: commitGit,
          formatRestoreSelectionFailed: (error) =>
            t("git.commitRestoreSelectionFailed", { error }),
        });
        if (!result.committed) {
          return;
        }
        setCommitMessage("");
        await refreshStatus();
        await onMutated?.();
        if (result.postCommitError) {
          setCommitMessageError(result.postCommitError);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setCommitMessageError(message);
      } finally {
        setCommitLoading(false);
      }
    },
    [
      commitLoading,
      commitMessage,
      commitMessageLoading,
      onMutated,
      operationLoading,
      refreshStatus,
      selectedCommitPaths,
      status.stagedFiles,
      status.unstagedFiles,
      t,
      workspaceId,
    ],
  );
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
  const commitStatusHint = selectedCommitCount > 0
    ? t("git.selectedFilesForCommit", { count: selectedCommitCount })
    : hasWorktreeChanges
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
      const inclusionState = getFileInclusionState(
        file.path,
        includedCommitPathSet,
        excludedCommitPathSet,
        partialCommitPathSet,
      );
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
          className={`git-history-worktree-file-row diff-row git-filetree-row ${listView === "tree" ? "is-tree" : ""} ${
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
          <InclusionToggle
            state={inclusionState}
            label={t("git.commitSelectionToggleFile", { path: file.path })}
            className="diff-row-selection"
            disabled={isCommitPathLocked(file.path)}
            stopPropagation
            onToggle={() => {
              setCommitSelection([file.path], inclusionState !== "all");
            }}
          />
          <span
            className={`git-history-worktree-file-status diff-icon ${diffStatusClass(file.status)}`}
            aria-hidden
          >
            {statusSymbol(file.status)}
          </span>
          <span className="git-history-worktree-file-icon diff-file-icon" aria-hidden>
            <FileIcon filePath={file.path} />
          </span>
          <span className="git-history-worktree-file-path diff-file" title={file.path}>
            <span className="diff-path">
              <span className="diff-name">
                <span className="diff-name-base">{name}</span>
              </span>
            </span>
            {listView === "tree" || !dir ? null : <span className="diff-dir">{dir}</span>}
          </span>
          <span className="diff-row-meta">
            <span
              className="git-history-worktree-file-stats diff-counts-inline git-filetree-badge"
              aria-label={`+${file.additions} -${file.deletions}`}
            >
              <span className="is-add">+{file.additions}</span>
              <span className="is-sep">/</span>
              <span className="is-del">-{file.deletions}</span>
            </span>
            <span
              className="git-history-worktree-file-actions diff-row-actions"
              role="group"
              aria-label={t("git.fileActions")}
            >
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
          </span>
        </div>
      );
    },
    [
      discardFiles,
      excludedCommitPathSet,
      handleMutation,
      includedCommitPathSet,
      isCommitPathLocked,
      listView,
      onOpenDiffPath,
      operationLoading,
      partialCommitPathSet,
      setCommitSelection,
      t,
      workspaceId,
    ],
  );

  const renderTreeRows = useCallback(
    (files: GitFileStatus[], section: DiffSection) => {
      const tree = buildDiffTree(files, section);
      const rootFolderKey = `${section}:__repo_root__/`;
      const rootCollapsed = collapsedFolders.has(rootFolderKey);
      const rootFolderPaths = tree.descendantPaths;
      const rootFolderInclusionState = getGroupInclusionState(
        rootFolderPaths,
        includedCommitPathSet,
        excludedCommitPathSet,
        partialCommitPathSet,
      );
      const rootHasToggleablePaths = hasToggleablePaths(
        rootFolderPaths,
        isCommitPathLocked,
      );
      const walk = (node: DiffTreeNode, depth: number): ReactNode[] => {
        const rows: ReactNode[] = [];
        const folders = Array.from(node.folders.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const folder of folders) {
          const collapsedFolder = collapseFolderChain(folder);
          const collapsed = collapsedFolders.has(collapsedFolder.key);
          const descendantPaths = collapsedFolder.node.descendantPaths;
          const folderInclusionState = getGroupInclusionState(
            descendantPaths,
            includedCommitPathSet,
            excludedCommitPathSet,
            partialCommitPathSet,
          );
          const folderHasToggleablePaths = hasToggleablePaths(
            descendantPaths,
            isCommitPathLocked,
          );
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
              <div
                className="git-history-worktree-folder-row diff-tree-folder-row git-filetree-folder-row"
                style={folderStyle}
                role="button"
                tabIndex={0}
                onClick={() => toggleFolder(collapsedFolder.key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleFolder(collapsedFolder.key);
                  }
                }}
              >
                <InclusionToggle
                  state={folderInclusionState}
                  label={t("git.commitSelectionToggleScope", {
                    path: collapsedFolder.node.path || collapsedFolder.name,
                  })}
                  className="git-commit-scope-toggle--folder"
                  disabled={!folderHasToggleablePaths}
                  stopPropagation
                  onToggle={() => {
                    setCommitSelection(
                      getToggleablePaths(descendantPaths, isCommitPathLocked),
                      folderInclusionState !== "all",
                    );
                  }}
                />
                <span className="git-history-worktree-folder-caret diff-tree-folder-toggle" aria-hidden>
                  {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </span>
                <FileIcon
                  filePath={collapsedFolder.iconName}
                  isFolder
                  isOpen={!collapsed}
                  className="git-history-worktree-folder-icon diff-tree-folder-icon"
                />
                <span className="git-history-worktree-folder-name diff-tree-folder-name">{collapsedFolder.name}</span>
              </div>
              {!collapsed ? (
                <div
                  className="git-history-worktree-folder-children diff-tree-folder-children"
                  style={childTreeStyle}
                >
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
          <div
            className="git-history-worktree-folder-row diff-tree-folder-row git-filetree-folder-row"
            style={{ paddingLeft: "0px" }}
            role="button"
            tabIndex={0}
            onClick={() => toggleFolder(rootFolderKey)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleFolder(rootFolderKey);
              }
            }}
          >
            <InclusionToggle
              state={rootFolderInclusionState}
              label={t("git.commitSelectionToggleScope", {
                path: resolvedRootFolderName,
              })}
              className="git-commit-scope-toggle--folder"
              disabled={!rootHasToggleablePaths}
              stopPropagation
              onToggle={() => {
                setCommitSelection(
                  getToggleablePaths(rootFolderPaths, isCommitPathLocked),
                  rootFolderInclusionState !== "all",
                );
              }}
            />
            <span className="git-history-worktree-folder-caret diff-tree-folder-toggle" aria-hidden>
              {rootCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </span>
            <FileIcon
              filePath={resolvedRootFolderName}
              isFolder
              isOpen={!rootCollapsed}
              className="git-history-worktree-folder-icon diff-tree-folder-icon"
            />
            <span className="git-history-worktree-folder-name diff-tree-folder-name">{resolvedRootFolderName}</span>
          </div>
          {!rootCollapsed ? (
            <div
              className="git-history-worktree-folder-children diff-tree-folder-children"
              style={rootChildrenStyle}
            >
              {walk(tree, 1)}
            </div>
          ) : null}
        </div>,
      ];
    },
    [
      collapsedFolders,
      excludedCommitPathSet,
      includedCommitPathSet,
      isCommitPathLocked,
      partialCommitPathSet,
      renderFileRow,
      resolvedRootFolderName,
      setCommitSelection,
      t,
      toggleFolder,
    ],
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
        <div className="git-history-worktree-commit-box commit-message-section">
          <div className="git-history-worktree-commit-input-wrap commit-message-input-wrapper">
            <textarea
              className="git-history-worktree-commit-input commit-message-input"
              placeholder={t("git.commitMessage")}
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              disabled={commitMessageLoading || commitLoading || operationLoading}
              rows={2}
            />
            <button
              type="button"
              className={`git-history-worktree-generate commit-message-generate-button${
                commitMessageLoading ? " git-history-worktree-generate--loading commit-message-generate-button--loading" : ""
              }`}
              onClick={(event) => {
                void showCommitMessageEngineMenu(event);
              }}
              disabled={commitMessageLoading || commitLoading || operationLoading || !hasWorktreeChanges}
              aria-haspopup="menu"
              title={
                stagedFiles.length > 0
                  ? t("git.generateCommitMessageStaged")
                  : t("git.generateCommitMessageUnstaged")
              }
              aria-label={t("git.generateCommitMessage")}
            >
              <CommitMessageEngineIcon
                engine={commitMessageMenuEngine}
                size={14}
                className={`git-history-worktree-engine-icon commit-message-engine-icon${
                  commitMessageLoading ? " git-history-worktree-engine-icon--spinning commit-message-engine-icon--spinning" : ""
                }`}
              />
            </button>
          </div>
          {hasWorktreeChanges ? (
            <div className="git-history-worktree-commit-hint commit-message-hint" aria-live="polite">
              {commitStatusHint}
            </div>
          ) : null}
          <CommitButton
            commitMessage={commitMessage}
            selectedCount={selectedCommitCount}
            hasAnyChanges={hasWorktreeChanges}
            commitLoading={commitLoading}
            selectedPaths={selectedCommitPaths}
            onCommit={handleCommit}
          />
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
              <GitDiffPanelSectionActions
                title={compactSection === "staged" ? t("git.staged") : t("git.unstaged")}
                section={compactSection}
                sectionInclusionState={
                  compactSection === "staged"
                    ? stagedSectionInclusionState
                    : unstagedSectionInclusionState
                }
                toggleableFilePaths={
                  compactSection === "staged"
                    ? stagedToggleablePaths
                    : unstagedToggleablePaths
                }
                filePaths={compactSection === "staged" ? stagedFilePaths : unstagedFilePaths}
                onSetCommitSelection={setCommitSelection}
                onStageAllChanges={
                  compactSection === "unstaged"
                    ? () => handleMutation(() => stageGitAll(workspaceId))
                    : undefined
                }
                onUnstageFile={
                  compactSection === "staged"
                    ? (path) => handleMutation(() => unstageGitFile(workspaceId, path))
                    : undefined
                }
                onDiscardFiles={
                  compactSection === "unstaged"
                    ? () => {
                        handleDiscardAll();
                      }
                    : undefined
                }
              />
            </div>
          ) : null}
          {hasStagedFiles ? (
            <div className="git-history-worktree-section git-filetree-section">
              <div
                className="git-history-worktree-section-header git-filetree-section-header"
                hidden={compactSection === "staged"}
              >
                <span>{renderSectionIndicator("staged", stagedFiles.length, t)}</span>
                <GitDiffPanelSectionActions
                  title={t("git.staged")}
                  section="staged"
                  sectionInclusionState={stagedSectionInclusionState}
                  toggleableFilePaths={stagedToggleablePaths}
                  filePaths={stagedFilePaths}
                  onSetCommitSelection={setCommitSelection}
                  onUnstageFile={(path) => handleMutation(() => unstageGitFile(workspaceId, path))}
                />
              </div>
              <div
                className={`git-history-worktree-section-list git-filetree-list${
                  listView === "tree" ? " diff-section-tree-list git-filetree-list--tree" : ""
                }`}
              >
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
                <GitDiffPanelSectionActions
                  title={t("git.unstaged")}
                  section="unstaged"
                  sectionInclusionState={unstagedSectionInclusionState}
                  toggleableFilePaths={unstagedToggleablePaths}
                  filePaths={unstagedFilePaths}
                  onSetCommitSelection={setCommitSelection}
                  onStageAllChanges={() => handleMutation(() => stageGitAll(workspaceId))}
                  onDiscardFiles={() => {
                    handleDiscardAll();
                  }}
                />
              </div>
              <div
                className={`git-history-worktree-section-list git-filetree-list${
                  listView === "tree" ? " diff-section-tree-list git-filetree-list--tree" : ""
                }`}
              >
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
