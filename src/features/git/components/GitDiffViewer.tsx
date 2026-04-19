import {memo, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {useTranslation} from "react-i18next";
import {useVirtualizer} from "@tanstack/react-virtual";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import X from "lucide-react/dist/esm/icons/x";
import type {GitHubPullRequest, GitHubPullRequestComment} from "../../../types";
import {getGitFileFullDiff} from "../../../services/tauri";
import {formatRelativeTime} from "../../../utils/time";
import {Markdown} from "../../messages/components/Markdown";
import {ImageDiffCard} from "./ImageDiffCard";
import {DiffBlock} from "./DiffBlock";
import {parseDiff} from "../../../utils/diff";
import {languageFromPath} from "../../../utils/syntax";

type GitDiffViewerItem = {
  path: string;
  status: string;
  diff: string;
    section?: "staged" | "unstaged";
  isImage?: boolean;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
};

type GitDiffViewerProps = {
  workspaceId?: string | null;
  diffs: GitDiffViewerItem[];
  listView?: "flat" | "tree";
  stickyHeaderMode?: "full" | "controls-only";
  showContentModeControls?: boolean;
  headerControlsTarget?: HTMLElement | null;
  onRequestClose?: (() => void) | null;
  fullDiffLoader?: ((path: string) => Promise<string>) | null;
  fullDiffSourceKey?: string | null;
  selectedPath: string | null;
  scrollRequestId?: number;
  isLoading: boolean;
  error: string | null;
  diffStyle?: "split" | "unified";
  pullRequest?: GitHubPullRequest | null;
  pullRequestComments?: GitHubPullRequestComment[];
  pullRequestCommentsLoading?: boolean;
  pullRequestCommentsError?: string | null;
  onActivePathChange?: (path: string) => void;
  onDiffStyleChange?: (style: "split" | "unified") => void;
  onOpenFile?: (path: string) => void;
    onRevertFile?: (path: string) => void | Promise<void>;
    onRevertHunk?: (
        path: string,
        hunkPatch: string,
        options?: {
            reverseStaged?: boolean;
            reverseUnstaged?: boolean;
        },
    ) => void | Promise<void>;
};

function getEntryStateKey(entry: Pick<GitDiffViewerItem, "path" | "section">) {
    return `${entry.section ?? "default"}:${entry.path}`;
}

function normalizePatchName(name: string) {
  if (!name) {
    return name;
  }
  return name.replace(/^(?:a|b)\//, "");
}

type DiffCardProps = {
  entry: GitDiffViewerItem;
  diffText: string;
  isSelected: boolean;
  diffStyle: "split" | "unified";
  contentMode: "all" | "focused";
    onRevertFile?: (path: string) => void | Promise<void>;
    onRevertHunk?: (
        path: string,
        hunkPatch: string,
        options?: {
            reverseStaged?: boolean;
            reverseUnstaged?: boolean;
        },
    ) => void | Promise<void>;
};

const DiffCard = memo(function DiffCard({
  entry,
  diffText,
  isSelected,
  diffStyle,
  contentMode,
                                            onRevertFile,
                                            onRevertHunk,
}: DiffCardProps) {
  const { t } = useTranslation();
    const stateKey = getEntryStateKey(entry);
  const hasRenderableDiff = useMemo(
    () => parseDiff(diffText).length > 0,
    [diffText],
  );

  return (
      <div
          key={stateKey}
        data-diff-path={entry.path}
        className={`diff-viewer-item ${isSelected ? "active" : ""}`}
      >
      <div className="diff-viewer-header">
        <span className="diff-viewer-status" data-status={entry.status}>
          {entry.status}
        </span>
        <span className="diff-viewer-path">
          {normalizePatchName(entry.path)}
        </span>
          {onRevertFile ? (
              <button
                  type="button"
                  className="diff-viewer-file-revert-button"
                  onClick={() => {
                      void onRevertFile(entry.path);
                  }}
              >
                  回退
              </button>
          ) : null}
      </div>
      {diffText.trim().length > 0 && hasRenderableDiff ? (
          <div className="diff-viewer-output diff-viewer-output-flat">
              <div className="diffs-container" data-diffs data-diff-style={diffStyle} data-content-mode={contentMode}>
                  <DiffBlock
                      diff={diffText}
                      path={entry.path}
                      diffStyle={diffStyle}
                      language={languageFromPath(entry.path)}

              showHunkHeaders={false}
              showLineNumbers
                      onRevertHunk={
                          onRevertHunk
                              ? (hunkPatch) => onRevertHunk(entry.path, hunkPatch, {
                                  reverseStaged: false,
                                  reverseUnstaged: true,
                              })
                              : undefined
                      }
            />
          </div>
        </div>
      ) : (
        <div className="diff-viewer-placeholder">{t("git.diffUnavailable")}</div>
      )}
    </div>
  );
});

type PullRequestSummaryProps = {
  pullRequest: GitHubPullRequest;
  hasDiffs: boolean;
  diffStats: { additions: number; deletions: number };
  onJumpToFirstFile: () => void;
  pullRequestComments?: GitHubPullRequestComment[];
  pullRequestCommentsLoading: boolean;
  pullRequestCommentsError?: string | null;
};

const PullRequestSummary = memo(function PullRequestSummary({
  pullRequest,
  hasDiffs,
  diffStats,
  onJumpToFirstFile,
  pullRequestComments,
  pullRequestCommentsLoading,
  pullRequestCommentsError,
}: PullRequestSummaryProps) {
  const { t } = useTranslation();
  const prUpdatedLabel = pullRequest.updatedAt
    ? formatRelativeTime(new Date(pullRequest.updatedAt).getTime())
    : null;
  const prAuthor = pullRequest.author?.login ?? "unknown";
  const prBody = pullRequest.body?.trim() ?? "";
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const sortedComments = useMemo(() => {
    if (!pullRequestComments?.length) {
      return [];
    }
    return [...pullRequestComments].sort((a, b) => {
      return (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
  }, [pullRequestComments]);
  const visibleCommentCount = 3;
  const visibleComments = isTimelineExpanded
    ? sortedComments
    : sortedComments.slice(-visibleCommentCount);
  const hiddenCommentCount = Math.max(
    0,
    sortedComments.length - visibleComments.length,
  );

  useEffect(() => {
    setIsTimelineExpanded(false);
  }, [pullRequest.number]);

  return (
    <section className="diff-viewer-pr" aria-label="Pull request summary">
      <div className="diff-viewer-pr-header">
        <div className="diff-viewer-pr-header-row">
          <div className="diff-viewer-pr-title">
            <span className="diff-viewer-pr-number">#{pullRequest.number}</span>
            <span className="diff-viewer-pr-title-text">
              {pullRequest.title}
            </span>
          </div>
          {hasDiffs && (
            <button
              type="button"
              className="ghost diff-viewer-pr-jump"
              onClick={onJumpToFirstFile}
              aria-label={t("git.jumpToFirstFile")}
            >
              <span className="diff-viewer-pr-jump-add">
                +{diffStats.additions}
              </span>
              <span className="diff-viewer-pr-jump-sep">/</span>
              <span className="diff-viewer-pr-jump-del">
                -{diffStats.deletions}
              </span>
            </button>
          )}
        </div>
        <div className="diff-viewer-pr-meta">
          <span className="diff-viewer-pr-author">@{prAuthor}</span>
          {prUpdatedLabel && (
            <>
              <span className="diff-viewer-pr-sep">·</span>
              <span>{prUpdatedLabel}</span>
            </>
          )}
          <span className="diff-viewer-pr-sep">·</span>
          <span className="diff-viewer-pr-branch">
            {pullRequest.baseRefName} ← {pullRequest.headRefName}
          </span>
          {pullRequest.isDraft && (
            <span className="diff-viewer-pr-pill">{t("git.draft")}</span>
          )}
        </div>
      </div>
      <div className="diff-viewer-pr-body">
        {prBody ? (
          <Markdown
            value={prBody}
            className="diff-viewer-pr-markdown markdown"
          />
        ) : (
          <div className="diff-viewer-pr-empty">{t("git.noDescriptionProvided")}</div>
        )}
      </div>
      <div className="diff-viewer-pr-timeline">
        <div className="diff-viewer-pr-timeline-header">
          <span className="diff-viewer-pr-timeline-title">{t("git.activity")}</span>
          <span className="diff-viewer-pr-timeline-count">
            {sortedComments.length} {sortedComments.length === 1 ? t("git.comment") : t("git.comments")}
          </span>
          {hiddenCommentCount > 0 && (
            <button
              type="button"
              className="ghost diff-viewer-pr-timeline-button"
              onClick={() => setIsTimelineExpanded(true)}
            >
              {t("git.showAll")}
            </button>
          )}
          {isTimelineExpanded &&
            sortedComments.length > visibleCommentCount && (
              <button
                type="button"
                className="ghost diff-viewer-pr-timeline-button"
                onClick={() => setIsTimelineExpanded(false)}
              >
                {t("git.collapse")}
              </button>
            )}
        </div>
        <div className="diff-viewer-pr-timeline-list">
          {pullRequestCommentsLoading && (
            <div className="diff-viewer-pr-timeline-state">
              {t("git.loadingComments")}
            </div>
          )}
          {pullRequestCommentsError && (
            <div className="diff-viewer-pr-timeline-state diff-viewer-pr-timeline-error">
              {pullRequestCommentsError}
            </div>
          )}
          {!pullRequestCommentsLoading &&
            !pullRequestCommentsError &&
            !sortedComments.length && (
              <div className="diff-viewer-pr-timeline-state">
                {t("git.noCommentsYet")}
              </div>
            )}
          {hiddenCommentCount > 0 && !isTimelineExpanded && (
            <div className="diff-viewer-pr-timeline-divider">
              {hiddenCommentCount} {hiddenCommentCount === 1 ? t("git.earlierComment") : t("git.earlierComments")}
            </div>
          )}
          {visibleComments.map((comment) => {
            const commentAuthor = comment.author?.login ?? "unknown";
            const commentTime = formatRelativeTime(
              new Date(comment.createdAt).getTime(),
            );
            return (
              <div key={comment.id} className="diff-viewer-pr-timeline-item">
                <div className="diff-viewer-pr-timeline-marker" />
                <div className="diff-viewer-pr-timeline-content">
                  <div className="diff-viewer-pr-timeline-meta">
                    <span className="diff-viewer-pr-timeline-author">
                      @{commentAuthor}
                    </span>
                    <span className="diff-viewer-pr-sep">·</span>
                    <span>{commentTime}</span>
                  </div>
                  {comment.body.trim() ? (
                    <Markdown
                      value={comment.body}
                      className="diff-viewer-pr-comment markdown"
                    />
                  ) : (
                    <div className="diff-viewer-pr-timeline-text">
                      {t("git.noCommentBody")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
});

export function GitDiffViewer({
                                  workspaceId,
  diffs,
  listView = "flat",
  stickyHeaderMode = "full",
                                  showContentModeControls = false,
                                  headerControlsTarget,
                                  onRequestClose,
                                  fullDiffLoader,
                                  fullDiffSourceKey,
  selectedPath,
  scrollRequestId,
  isLoading,
  error,
  diffStyle = "split",
  pullRequest,
  pullRequestComments,
  pullRequestCommentsLoading = false,
  pullRequestCommentsError = null,
  onActivePathChange,
  onDiffStyleChange,
  onOpenFile: _onOpenFile,
                                  onRevertFile,
                                  onRevertHunk,
}: GitDiffViewerProps) {

  const { t } = useTranslation();
  const [resolvedHeaderControlsTarget, setResolvedHeaderControlsTarget] = useState<HTMLElement | null>(null);
  const [fileContentModes, setFileContentModes] = useState<Record<string, "all" | "focused">>({});
  const [fullDiffByPath, setFullDiffByPath] = useState<Record<string, string>>({});
  const [loadingFullDiffByPath, setLoadingFullDiffByPath] = useState<Record<string, boolean>>({});
  const [fullDiffErrorByPath, setFullDiffErrorByPath] = useState<Record<string, string>>({});
  const [anchorCountByPath, setAnchorCountByPath] = useState<Record<string, number>>({});
  const [anchorIndexByPath, setAnchorIndexByPath] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activePathRef = useRef<string | null>(null);
  const ignoreActivePathUntilRef = useRef<number>(0);
  const lastScrollRequestIdRef = useRef<number | null>(null);
  const onActivePathChangeRef = useRef(onActivePathChange);
  const rowResizeObserversRef = useRef(new Map<Element, ResizeObserver>());
  const rowNodesByPathRef = useRef(new Map<string, HTMLDivElement>());
  const hasActivePathHandler = Boolean(onActivePathChange);
  const effectiveDiffs = useMemo(() => {
    if (listView !== "tree") {
      return diffs;
    }
    if (!selectedPath) {
      return [];
    }
    return diffs.filter((entry) => entry.path === selectedPath);
  }, [diffs, listView, selectedPath]);
  const shouldShowContentModeControls = showContentModeControls ?? listView === "tree";
  const indexByPath = useMemo(() => {
    const map = new Map<string, number>();
    effectiveDiffs.forEach((entry, index) => {
        map.set(getEntryStateKey(entry), index);
    });
    return map;
  }, [effectiveDiffs]);
  const rowVirtualizer = useVirtualizer({
    count: effectiveDiffs.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 260,
    overscan: 6,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const setRowRef = useCallback(
      (pathKey: string) => (node: HTMLDivElement | null) => {
          const prevNode = rowNodesByPathRef.current.get(pathKey);
      if (prevNode && prevNode !== node) {
        const prevObserver = rowResizeObserversRef.current.get(prevNode);
        if (prevObserver) {
          prevObserver.disconnect();
          rowResizeObserversRef.current.delete(prevNode);
        }
      }
      if (!node) {
          rowNodesByPathRef.current.delete(pathKey);
        return;
      }
          rowNodesByPathRef.current.set(pathKey, node);
      rowVirtualizer.measureElement(node);
      if (rowResizeObserversRef.current.has(node)) {
        return;
      }
      const observer = new ResizeObserver(() => {
        rowVirtualizer.measureElement(node);
      });
      observer.observe(node);
      rowResizeObserversRef.current.set(node, observer);
    },
    [rowVirtualizer],
  );
  const stickyEntry = useMemo(() => {
    if (!effectiveDiffs.length) {
      return null;
    }
    if (selectedPath) {
        const preferred = effectiveDiffs.find((entry) => entry.path === selectedPath);
        if (preferred) {
            return preferred;
        }
        const selectedEntry = effectiveDiffs.find(
            (entry) => getEntryStateKey(entry) === selectedPath,
        );
        if (selectedEntry) {
            return selectedEntry;
        }
      const index = indexByPath.get(selectedPath);
      if (index !== undefined) {
        return effectiveDiffs[index];
      }
    }
    return effectiveDiffs[0];
  }, [effectiveDiffs, selectedPath, indexByPath]);
    const stickyEntryKey = stickyEntry ? getEntryStateKey(stickyEntry) : null;

  useEffect(() => {
    if (!selectedPath || !scrollRequestId) {
      return;
    }
    if (lastScrollRequestIdRef.current === scrollRequestId) {
      return;
    }
    const index = indexByPath.get(selectedPath);
    if (index === undefined) {
      return;
    }
    ignoreActivePathUntilRef.current = Date.now() + 250;
    rowVirtualizer.scrollToIndex(index, { align: "start" });
    lastScrollRequestIdRef.current = scrollRequestId;
  }, [selectedPath, scrollRequestId, indexByPath, rowVirtualizer]);

  useEffect(() => {
    const observers = rowResizeObserversRef.current;
    return () => {
      for (const observer of observers.values()) {
        observer.disconnect();
      }
      observers.clear();
    };
  }, []);

  useEffect(() => {
    activePathRef.current = selectedPath;
  }, [selectedPath]);

  useEffect(() => {
    onActivePathChangeRef.current = onActivePathChange;
  }, [onActivePathChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hasActivePathHandler) {
      return;
    }
    let frameId: number | null = null;

    const updateActivePath = () => {
      frameId = null;
      if (Date.now() < ignoreActivePathUntilRef.current) {
        return;
      }
      const items = rowVirtualizer.getVirtualItems();
      if (!items.length) {
        return;
      }
      const scrollTop = container.scrollTop;
      const canScroll = container.scrollHeight > container.clientHeight;
      const isAtBottom =
        canScroll &&
        scrollTop + container.clientHeight >= container.scrollHeight - 4;
      let nextPath: string | undefined;
      if (isAtBottom) {
        nextPath = effectiveDiffs[effectiveDiffs.length - 1]?.path;
      } else {
        const targetOffset = scrollTop + 8;
        let activeItem = items[0];
        for (const item of items) {
          if (item.start <= targetOffset) {
            activeItem = item;
          } else {
            break;
          }
        }
        if (activeItem) {
          nextPath = effectiveDiffs[activeItem.index]?.path;
        }
      }
      if (!nextPath || nextPath === activePathRef.current) {
        return;
      }
      activePathRef.current = nextPath;
      onActivePathChangeRef.current?.(nextPath);
    };

    const handleScroll = () => {
      if (frameId !== null) {
        return;
      }
      frameId = requestAnimationFrame(updateActivePath);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      container.removeEventListener("scroll", handleScroll);
    };
  }, [effectiveDiffs, rowVirtualizer, hasActivePathHandler]);

  const diffStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const entry of effectiveDiffs) {
      const lines = entry.diff.split("\n");
      for (const line of lines) {
        if (!line) {
          continue;
        }
        if (
          line.startsWith("+++")
          || line.startsWith("---")
          || line.startsWith("diff --git")
          || line.startsWith("@@")
          || line.startsWith("index ")
          || line.startsWith("\\ No newline")
        ) {
          continue;
        }
        if (line.startsWith("+")) {
          additions += 1;
        } else if (line.startsWith("-")) {
          deletions += 1;
        }
      }
    }
    return { additions, deletions };
  }, [effectiveDiffs]);
  const handleScrollToFirstFile = useCallback(() => {
    if (!effectiveDiffs.length) {
      return;
    }
    const container = containerRef.current;
    const list = listRef.current;
    if (container && list) {
      const top = list.offsetTop;
      container.scrollTo({ top, behavior: "smooth" });
      return;
    }
    rowVirtualizer.scrollToIndex(0, { align: "start" });
  }, [effectiveDiffs.length, rowVirtualizer]);
    const handleFileContentModeChange = useCallback((entryKey: string, mode: "all" | "focused") => {
    if (mode === "focused") {
      setLoadingFullDiffByPath((prev) => {
          if (!prev[entryKey]) {
          return prev;
        }
          return {...prev, [entryKey]: false};
      });
    }
    setFileContentModes((prev) => {
        const current = prev[entryKey] ?? "focused";
      if (current === mode) {
        return prev;
      }
        return {...prev, [entryKey]: mode};
    });
  }, []);

  useEffect(() => {
    setFullDiffByPath({});
    setLoadingFullDiffByPath({});
    setFullDiffErrorByPath({});
  }, [workspaceId, fullDiffSourceKey]);

  useEffect(() => {
    if (headerControlsTarget) {
      setResolvedHeaderControlsTarget(headerControlsTarget);
      return;
    }
    if (stickyHeaderMode !== "controls-only") {
      setResolvedHeaderControlsTarget(null);
      return;
    }
    let cancelled = false;
    let frameId: number | null = null;
    const resolveTarget = () => {
      if (cancelled) {
        return;
      }
      const modal = containerRef.current?.closest(".git-history-diff-modal");
      const target = modal?.querySelector<HTMLElement>(
        ".git-history-diff-modal-mode-controls, .git-history-diff-modal-actions",
      ) ?? null;
      if (target) {
        setResolvedHeaderControlsTarget(target);
        return;
      }
      frameId = requestAnimationFrame(resolveTarget);
    };
    resolveTarget();
    return () => {
      cancelled = true;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [headerControlsTarget, stickyHeaderMode]);

  const loadFullDiff = useCallback((path: string) => {
    if (fullDiffLoader) {
      return fullDiffLoader(path);
    }
    if (!workspaceId) {
      return Promise.resolve("");
    }
    return getGitFileFullDiff(workspaceId, path);
  }, [fullDiffLoader, workspaceId]);

  const fullDiffTargetPath = useMemo(() => {
      const shouldForceFullDiff = Boolean(onRevertHunk);
      if (!shouldShowContentModeControls && !shouldForceFullDiff) {
      return null;
    }
      const targetEntry = stickyEntry ?? effectiveDiffs.find((entry) => entry.path === selectedPath) ?? null;
      if (!targetEntry) {
      return null;
    }
      const targetEntryKey = getEntryStateKey(targetEntry);
      if (shouldForceFullDiff) {
          return targetEntryKey;
      }
      return (fileContentModes[targetEntryKey] ?? "focused") === "all" ? targetEntryKey : null;
  }, [effectiveDiffs, fileContentModes, onRevertHunk, selectedPath, shouldShowContentModeControls, stickyEntry]);

    const collectChangeAnchors = useCallback((entryKey: string) => {
        const row = rowNodesByPathRef.current.get(entryKey);
    if (!row) {
      return [] as HTMLElement[];
    }
    const diffContainers = row.querySelectorAll<HTMLElement>("diffs-container, .diffs-container");
    const roots: ParentNode[] = [row];
    for (const container of diffContainers) {
      if (container.shadowRoot) {
        roots.push(container.shadowRoot);
      }
    }
    const rawNodes: HTMLElement[] = [];
    for (const root of roots) {
      rawNodes.push(
        ...Array.from(
          root.querySelectorAll<HTMLElement>(
            "[data-line-type='change-addition'], [data-line-type='change-deletion']",
          ),
        ),
      );
    }
    const visible = rawNodes.filter((node) => node.offsetHeight > 0);
    if (visible.length === 0) {
      return [];
    }
    const normalized = visible
      .map((node) => {
        const lineRaw = node.getAttribute("data-line");
        const line = lineRaw ? Number.parseInt(lineRaw, 10) : Number.NaN;
        const top = node.getBoundingClientRect().top;
        return {
          node,
          line: Number.isFinite(line) ? line : null,
          top,
        };
      })
      .sort((a, b) => a.top - b.top);

    const anchors: HTMLElement[] = [];
    let lastLine: number | null = null;
    let lastTop: number | null = null;
    for (const item of normalized) {
      const topJump = lastTop == null ? true : Math.abs(item.top - lastTop) > 24;
      const lineJump = item.line == null || lastLine == null ? topJump : item.line > lastLine + 1;
      if (anchors.length === 0 || lineJump) {
        anchors.push(item.node);
      }
      if (item.line != null) {
        lastLine = item.line;
      }
      lastTop = item.top;
    }
    return anchors;
  }, []);

  const isStickyAllMode = useMemo(() => {
      if (!shouldShowContentModeControls || !stickyEntryKey) {
      return false;
    }
      return (fileContentModes[stickyEntryKey] ?? "focused") === "all";
  }, [fileContentModes, shouldShowContentModeControls, stickyEntryKey]);
  const showAnchorBar = !error && Boolean(stickyEntry) && isStickyAllMode;
  const showEmbeddedAnchorBar = showAnchorBar && stickyHeaderMode === "controls-only";
  const effectiveHeaderControlsTarget = headerControlsTarget ?? resolvedHeaderControlsTarget;
  const shouldRenderStickyHeader = Boolean(stickyEntry) && (!effectiveHeaderControlsTarget || stickyHeaderMode !== "controls-only");
    const anchorControls = stickyEntry && stickyEntryKey ? (
    <div className="diff-viewer-anchor-inner">
      <button
        type="button"
        className="diff-viewer-anchor-btn"
        onClick={() => handleJumpChangeAnchor("prev")}
        disabled={!anchorCountByPath[stickyEntryKey]}
        title="上一个改动"
      >
        <ChevronUp size={13} aria-hidden />
      </button>
      <span className="diff-viewer-anchor-meta">
        {anchorCountByPath[stickyEntryKey]
            ? `${(anchorIndexByPath[stickyEntryKey] ?? 0) + 1}/${anchorCountByPath[stickyEntryKey]}`
          : "0/0"}
      </span>
      <button
        type="button"
        className="diff-viewer-anchor-btn"
        onClick={() => handleJumpChangeAnchor("next")}
        disabled={!anchorCountByPath[stickyEntryKey]}
        title="下一个改动"
      >
        <ChevronDown size={13} aria-hidden />
      </button>
    </div>
  ) : null;

    const refreshAnchorStats = useCallback((entryKey: string) => {
        const anchors = collectChangeAnchors(entryKey);
        setAnchorCountByPath((prev) => ({...prev, [entryKey]: anchors.length}));
    setAnchorIndexByPath((prev) => {
        const current = prev[entryKey] ?? 0;
      const next = anchors.length > 0 ? Math.min(current, anchors.length - 1) : 0;
        if (current === next && entryKey in prev) {
        return prev;
      }
        return {...prev, [entryKey]: next};
    });
  }, [collectChangeAnchors]);

  useEffect(() => {
      if (!stickyEntry || !stickyEntryKey || !isStickyAllMode) {
      return;
    }
      const entryKey = stickyEntryKey;
    const frame = requestAnimationFrame(() => {
        refreshAnchorStats(entryKey);
    });
      const row = rowNodesByPathRef.current.get(entryKey);
    if (!row) {
      return () => {
        cancelAnimationFrame(frame);
      };
    }
    const observer = new MutationObserver(() => {
        refreshAnchorStats(entryKey);
    });
    observer.observe(row, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isStickyAllMode, stickyEntry, stickyEntryKey, fullDiffByPath, diffStyle, refreshAnchorStats]);

  const handleJumpChangeAnchor = useCallback((direction: "prev" | "next") => {
      if (!stickyEntryKey) {
      return;
    }
      const entryKey = stickyEntryKey;
      const anchors = collectChangeAnchors(entryKey);
      setAnchorCountByPath((prev) => ({...prev, [entryKey]: anchors.length}));
    if (anchors.length === 0) {
        setAnchorIndexByPath((prev) => ({...prev, [entryKey]: 0}));
      return;
    }
      const current = anchorIndexByPath[entryKey] ?? 0;
    const next = direction === "next"
      ? (current + 1) % anchors.length
      : (current - 1 + anchors.length) % anchors.length;
    anchors[next]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setAnchorCountByPath((prev) => ({...prev, [entryKey]: anchors.length}));
      setAnchorIndexByPath((prev) => ({...prev, [entryKey]: next}));
  }, [anchorIndexByPath, collectChangeAnchors, stickyEntryKey]);

  useEffect(() => {
    if (!fullDiffTargetPath) {
      return;
    }
    if (!fullDiffLoader && !workspaceId) {
      return;
    }
    let cancelled = false;
    setLoadingFullDiffByPath((prev) => ({ ...prev, [fullDiffTargetPath]: true }));
      const targetEntry = effectiveDiffs.find(
          (entry) => getEntryStateKey(entry) === fullDiffTargetPath,
      ) ?? null;
      const targetPath = targetEntry?.path ?? fullDiffTargetPath;
      void loadFullDiff(targetPath)
      .then((diffText) => {
        if (cancelled) {
          return;
        }
        setFullDiffErrorByPath((prev) => {
          if (!(fullDiffTargetPath in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[fullDiffTargetPath];
          return next;
        });
        setFullDiffByPath((prev) => ({ ...prev, [fullDiffTargetPath]: diffText }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setFullDiffErrorByPath((prev) => ({ ...prev, [fullDiffTargetPath]: message }));
        setFullDiffByPath((prev) => ({ ...prev, [fullDiffTargetPath]: "" }));
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoadingFullDiffByPath((prev) => ({ ...prev, [fullDiffTargetPath]: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveDiffs, fullDiffLoader, fullDiffTargetPath, loadFullDiff, workspaceId]);

  return (
      <div className={`diff-viewer-frame ${showEmbeddedAnchorBar ? "has-embedded-anchor" : ""}`}>
        <div className="diff-viewer" ref={containerRef}>
          {stickyEntry && effectiveHeaderControlsTarget
            ? createPortal(
                <div className="diff-viewer-header-controls is-external">
                  <div className="diff-viewer-header-mode" role="group" aria-label={t("git.diffView")}>
                    <button
                      type="button"
                      className={`diff-viewer-header-mode-icon-button ${diffStyle === "split" ? "active" : ""}`}
                      onClick={() => onDiffStyleChange?.("split")}
                      aria-label={t("git.dualPanelDiff")}
                    >
                      <span className="diff-viewer-mode-glyph diff-viewer-mode-glyph-split" aria-hidden />
                      <span className="diff-viewer-mode-label">{t("git.dualPanelDiff")}</span>
                    </button>
                    <button
                      type="button"
                      className={`diff-viewer-header-mode-icon-button ${diffStyle === "unified" ? "active" : ""}`}
                      onClick={() => onDiffStyleChange?.("unified")}
                      aria-label={t("git.singleColumnDiff")}
                    >
                      <span className="diff-viewer-mode-glyph diff-viewer-mode-glyph-unified" aria-hidden />
                      <span className="diff-viewer-mode-label">{t("git.singleColumnDiff")}</span>
                    </button>
                  </div>
                  {shouldShowContentModeControls && (
                    <div className="diff-viewer-header-mode" role="group" aria-label={t("git.diffContentMode")}>
                      {(() => {
                          const activeKey = stickyEntryKey;
                          const isAll = activeKey ? (fileContentModes[activeKey] ?? "focused") === "all" : false;
                          const isLoadingFull = activeKey ? Boolean(loadingFullDiffByPath[activeKey]) : false;
                          const hasFullDiff = activeKey ? Boolean(fullDiffByPath[activeKey]?.trim()) : false;
                          const hasError = activeKey ? Boolean(fullDiffErrorByPath[activeKey]) : false;
                        const statusLabel = hasError
                          ? t("git.fullDiffStatusError")
                          : isLoadingFull
                            ? t("git.fullDiffStatusLoading")
                            : hasFullDiff
                              ? t("git.fullDiffStatusReady")
                              : t("git.fullDiffStatusEmpty");
                        const allLabel = isAll
                          ? `${t("git.viewAllContent")} (${statusLabel})`
                          : t("git.viewAllContent");
                        return (
                          <button
                            type="button"
                            className={`diff-viewer-header-mode-button ${isAll ? "active" : ""}`}
                            onClick={() => {
                                if (activeKey) {
                                    handleFileContentModeChange(activeKey, "all");
                                }
                            }}
                            title={hasError && activeKey ? fullDiffErrorByPath[activeKey] : undefined}
                          >
                            <span className="diff-viewer-inline-mode-icon diff-viewer-inline-mode-icon-all" aria-hidden />
                            <span>{allLabel}</span>
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        className={`diff-viewer-header-mode-button ${stickyEntryKey && (fileContentModes[stickyEntryKey] ?? "focused") === "focused" ? "active" : ""}`}
                        onClick={() => {
                            if (stickyEntryKey) {
                                handleFileContentModeChange(stickyEntryKey, "focused");
                            }
                        }}
                      >
                        <span className="diff-viewer-inline-mode-icon diff-viewer-inline-mode-icon-focused" aria-hidden />
                        <span>{t("git.viewFocusedContent")}</span>
                      </button>
                    </div>
                  )}
                  {onRequestClose && (
                    <button
                      type="button"
                      className="diff-viewer-header-close-button"
                      onClick={onRequestClose}
                      aria-label={t("common.close")}
                      title={t("common.close")}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  )}
                </div>,
                effectiveHeaderControlsTarget,
              )
            : null}
          {pullRequest && (
            <PullRequestSummary
              pullRequest={pullRequest}
              hasDiffs={effectiveDiffs.length > 0}
              diffStats={diffStats}
              onJumpToFirstFile={handleScrollToFirstFile}
              pullRequestComments={pullRequestComments}
              pullRequestCommentsLoading={pullRequestCommentsLoading}
              pullRequestCommentsError={pullRequestCommentsError}
            />
          )}
        {!error && stickyEntry && shouldRenderStickyHeader && (
          <div className="diff-viewer-sticky">
            <div className="diff-viewer-header diff-viewer-header-sticky">
              {stickyHeaderMode !== "controls-only" ? (
                <>
                  <span
                    className="diff-viewer-status"
                    data-status={stickyEntry.status}
                  >
                    {stickyEntry.status}
                  </span>
                  <span className="diff-viewer-path">{stickyEntry.path}</span>
                </>
              ) : null}
              {!effectiveHeaderControlsTarget && (
                <div className="diff-viewer-header-controls">
                  <div className="diff-viewer-header-mode" role="group" aria-label={t("git.diffView")}>
                    <button
                      type="button"
                      className={`diff-viewer-header-mode-icon-button ${diffStyle === "split" ? "active" : ""}`}
                      onClick={() => onDiffStyleChange?.("split")}
                      aria-label={t("git.dualPanelDiff")}
                    >
                      <span className="diff-viewer-mode-glyph diff-viewer-mode-glyph-split" aria-hidden />
                      <span className="diff-viewer-mode-label">{t("git.dualPanelDiff")}</span>
                    </button>
                    <button
                      type="button"
                      className={`diff-viewer-header-mode-icon-button ${diffStyle === "unified" ? "active" : ""}`}
                      onClick={() => onDiffStyleChange?.("unified")}
                      aria-label={t("git.singleColumnDiff")}
                    >
                      <span className="diff-viewer-mode-glyph diff-viewer-mode-glyph-unified" aria-hidden />
                      <span className="diff-viewer-mode-label">{t("git.singleColumnDiff")}</span>
                    </button>
                  </div>
                  {shouldShowContentModeControls && (
                    <div className="diff-viewer-header-mode" role="group" aria-label={t("git.diffContentMode")}>
                      {(() => {
                          const activeKey = stickyEntryKey;
                          const isAll = activeKey ? (fileContentModes[activeKey] ?? "focused") === "all" : false;
                          const isLoadingFull = activeKey ? Boolean(loadingFullDiffByPath[activeKey]) : false;
                          const hasFullDiff = activeKey ? Boolean(fullDiffByPath[activeKey]?.trim()) : false;
                          const hasError = activeKey ? Boolean(fullDiffErrorByPath[activeKey]) : false;
                        const statusLabel = hasError
                          ? t("git.fullDiffStatusError")
                          : isLoadingFull
                            ? t("git.fullDiffStatusLoading")
                            : hasFullDiff
                              ? t("git.fullDiffStatusReady")
                              : t("git.fullDiffStatusEmpty");
                        const allLabel = isAll
                          ? `${t("git.viewAllContent")} (${statusLabel})`
                          : t("git.viewAllContent");
                        return (
                          <button
                            type="button"
                            className={`diff-viewer-header-mode-button ${isAll ? "active" : ""}`}
                            onClick={() => {
                                if (activeKey) {
                                    handleFileContentModeChange(activeKey, "all");
                                }
                            }}
                            title={hasError && activeKey ? fullDiffErrorByPath[activeKey] : undefined}
                          >
                            <span className="diff-viewer-inline-mode-icon diff-viewer-inline-mode-icon-all" aria-hidden />
                            <span>{allLabel}</span>
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        className={`diff-viewer-header-mode-button ${stickyEntryKey && (fileContentModes[stickyEntryKey] ?? "focused") === "focused" ? "active" : ""}`}
                        onClick={() => {
                            if (stickyEntryKey) {
                                handleFileContentModeChange(stickyEntryKey, "focused");
                            }
                        }}
                      >
                        <span className="diff-viewer-inline-mode-icon diff-viewer-inline-mode-icon-focused" aria-hidden />
                        <span>{t("git.viewFocusedContent")}</span>
                      </button>
                    </div>
                  )}
                  {onRequestClose && (
                    <button
                      type="button"
                      className="diff-viewer-header-close-button"
                      onClick={onRequestClose}
                      aria-label={t("common.close")}
                      title={t("common.close")}
                    >
                      <X size={13} aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {showAnchorBar && stickyEntry && !showEmbeddedAnchorBar && (
          <div
            className="diff-viewer-anchor-floating"
            role="group"
            aria-label="Change anchors"
          >
            {anchorControls}
          </div>
        )}
        {error && <div className="diff-viewer-empty">{error}</div>}
        {!error && isLoading && effectiveDiffs.length > 0 && (
          <div className="diff-viewer-loading diff-viewer-loading-overlay">
            {t("git.refreshingDiff")}
          </div>
        )}
        {!error && !isLoading && !effectiveDiffs.length && (
          <div className="diff-viewer-empty">
            {listView === "tree" ? t("git.selectFileToViewDiff") : t("git.noChangesDetected")}
          </div>
        )}
        {!error && effectiveDiffs.length > 0 && (
          <div
            className="diff-viewer-list"
            ref={listRef}
            style={{
              height: rowVirtualizer.getTotalSize(),
            }}
          >
            {virtualItems.map((virtualRow) => {
              const entry = effectiveDiffs[virtualRow.index];
              if (!entry) {
                return null;
              }
                const entryKey = getEntryStateKey(entry);
                const contentMode = fileContentModes[entryKey] ?? "focused";
                const fullDiff = fullDiffByPath[entryKey];
                const shouldPreferFullDiff = Boolean(onRevertHunk);
                const hasRenderableFullDiff = Boolean(fullDiff?.trim()) && parseDiff(fullDiff ?? "").length > 0;
                const diffText = ((shouldPreferFullDiff || contentMode === "all") && hasRenderableFullDiff)
                    ? fullDiff ?? entry.diff
                    : entry.diff;
              return (
                <div
                    key={entryKey}
                  className="diff-viewer-row"
                  data-index={virtualRow.index}
                    ref={setRowRef(entryKey)}
                  style={{
                    transform: `translate3d(0, ${virtualRow.start}px, 0)`,
                  }}
                >
                  {entry.isImage ? (
                    <ImageDiffCard
                      path={entry.path}
                      status={entry.status}
                      oldImageData={entry.oldImageData}
                      newImageData={entry.newImageData}
                      oldImageMime={entry.oldImageMime}
                      newImageMime={entry.newImageMime}
                      isSelected={entry.path === selectedPath}
                      onRevertFile={onRevertFile}
                    />
                  ) : (
                    <DiffCard
                      entry={entry}
                      diffText={diffText}
                      isSelected={entry.path === selectedPath}
                      diffStyle={diffStyle}
                      contentMode={contentMode}
                      onRevertFile={onRevertFile}
                      onRevertHunk={onRevertHunk}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
        {showEmbeddedAnchorBar && stickyEntry && (
          <div className="diff-viewer-anchor-dock" role="group" aria-label="Change anchors">
            {anchorControls}
          </div>
        )}
        </div>
  );
}
