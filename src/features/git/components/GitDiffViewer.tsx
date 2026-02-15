import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileDiff, WorkerPoolContextProvider } from "@pierre/diffs/react";
import type { FileDiffMetadata } from "@pierre/diffs";
import Columns2 from "lucide-react/dist/esm/icons/columns-2";
import Rows3 from "lucide-react/dist/esm/icons/rows-3";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { parsePatchFiles } from "@pierre/diffs";
import { workerFactory } from "../../../utils/diffsWorker";
import type { GitHubPullRequest, GitHubPullRequestComment } from "../../../types";
import { getGitFileFullDiff } from "../../../services/tauri";
import { formatRelativeTime } from "../../../utils/time";
import { Markdown } from "../../messages/components/Markdown";
import { ImageDiffCard } from "./ImageDiffCard";

type GitDiffViewerItem = {
  path: string;
  status: string;
  diff: string;
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
};

const DIFF_SCROLL_CSS = `
[data-column-number],
[data-buffer],
[data-separator-wrapper],
[data-annotation-content] {
  position: static !important;
}

[data-buffer] {
  background-image: none !important;
}

diffs-container,
[data-diffs],
[data-diffs-header],
[data-error-wrapper] {
  position: relative !important;
  contain: layout style !important;
  isolation: isolate !important;
}

[data-diffs-header],
[data-diffs],
[data-error-wrapper] {
  --diffs-light-bg: rgba(255, 255, 255, 0.35);
  --diffs-dark-bg: rgba(10, 12, 16, 0.35);
}

[data-diffs-header][data-theme-type='light'],
[data-diffs][data-theme-type='light'] {
  --diffs-bg: rgba(255, 255, 255, 0.35);
}

[data-diffs-header][data-theme-type='dark'],
[data-diffs][data-theme-type='dark'] {
  --diffs-bg: rgba(10, 12, 16, 0.35);
}

@media (prefers-color-scheme: dark) {
  [data-diffs-header]:not([data-theme-type]),
  [data-diffs]:not([data-theme-type]),
  [data-diffs-header][data-theme-type='system'],
  [data-diffs][data-theme-type='system'] {
    --diffs-bg: rgba(10, 12, 16, 0.35);
  }
}

@media (prefers-color-scheme: light) {
  [data-diffs-header]:not([data-theme-type]),
  [data-diffs]:not([data-theme-type]),
  [data-diffs-header][data-theme-type='system'],
  [data-diffs][data-theme-type='system'] {
    --diffs-bg: rgba(255, 255, 255, 0.35);
  }
}
`;

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
};

const DiffCard = memo(function DiffCard({
  entry,
  diffText,
  isSelected,
  diffStyle,
  contentMode,
}: DiffCardProps) {
  const { t } = useTranslation();
  const diffOptions = useMemo(
    () => ({
      diffStyle,
      hunkSeparators: "line-info" as const,
      expandUnchanged: contentMode === "all",
      expansionLineCount: contentMode === "all" ? 200000 : 20,
      overflow: "scroll" as const,
      unsafeCSS: DIFF_SCROLL_CSS,
      disableFileHeader: true,
    }),
    [contentMode, diffStyle],
  );

  const fileDiff = useMemo(() => {
    if (!diffText.trim()) {
      return null;
    }
    const patch = parsePatchFiles(diffText);
    const parsed = patch[0]?.files[0];
    if (!parsed) {
      return null;
    }
    const normalizedName = normalizePatchName(parsed.name || entry.path);
    const normalizedPrevName = parsed.prevName
      ? normalizePatchName(parsed.prevName)
      : undefined;
    return {
      ...parsed,
      name: normalizedName,
      prevName: normalizedPrevName,
    } satisfies FileDiffMetadata;
  }, [diffText, entry.path]);

  return (
      <div
        data-diff-path={entry.path}
        className={`diff-viewer-item ${isSelected ? "active" : ""}`}
      >
      <div className="diff-viewer-header">
        <span className="diff-viewer-status" data-status={entry.status}>
          {entry.status}
        </span>
        <span className="diff-viewer-path">{entry.path}</span>
      </div>
      {diffText.trim().length > 0 && fileDiff ? (
        <div className="diff-viewer-output diff-viewer-output-flat">
          <FileDiff
            fileDiff={fileDiff}
            options={diffOptions}
            style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
          />
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
  workspaceId = null,
  diffs,
  listView = "flat",
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
  onOpenFile,
}: GitDiffViewerProps) {
  const { t } = useTranslation();
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
  const poolOptions = useMemo(() => ({ workerFactory }), []);
  const highlighterOptions = useMemo(
    () => ({ theme: { dark: "pierre-dark", light: "pierre-light" } }),
    [],
  );
  const effectiveDiffs = useMemo(() => {
    if (listView !== "tree") {
      return diffs;
    }
    if (!selectedPath) {
      return [];
    }
    return diffs.filter((entry) => entry.path === selectedPath);
  }, [diffs, listView, selectedPath]);
  const indexByPath = useMemo(() => {
    const map = new Map<string, number>();
    effectiveDiffs.forEach((entry, index) => {
      map.set(entry.path, index);
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
    (path: string) => (node: HTMLDivElement | null) => {
      const prevNode = rowNodesByPathRef.current.get(path);
      if (prevNode && prevNode !== node) {
        const prevObserver = rowResizeObserversRef.current.get(prevNode);
        if (prevObserver) {
          prevObserver.disconnect();
          rowResizeObserversRef.current.delete(prevNode);
        }
      }
      if (!node) {
        rowNodesByPathRef.current.delete(path);
        return;
      }
      rowNodesByPathRef.current.set(path, node);
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
      const index = indexByPath.get(selectedPath);
      if (index !== undefined) {
        return effectiveDiffs[index];
      }
    }
    return effectiveDiffs[0];
  }, [effectiveDiffs, selectedPath, indexByPath]);

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
        nextPath = effectiveDiffs[activeItem.index]?.path;
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
  const handleFileContentModeChange = useCallback((path: string, mode: "all" | "focused") => {
    if (mode === "focused") {
      setLoadingFullDiffByPath((prev) => {
        if (!prev[path]) {
          return prev;
        }
        return { ...prev, [path]: false };
      });
    }
    setFileContentModes((prev) => {
      const current = prev[path] ?? "focused";
      if (current === mode) {
        return prev;
      }
      return { ...prev, [path]: mode };
    });
  }, []);

  useEffect(() => {
    setFullDiffByPath({});
    setLoadingFullDiffByPath({});
    setFullDiffErrorByPath({});
  }, [workspaceId]);

  const fullDiffTargetPath = useMemo(() => {
    if (listView !== "tree") {
      return null;
    }
    const path = stickyEntry?.path ?? selectedPath;
    if (!path) {
      return null;
    }
    return (fileContentModes[path] ?? "focused") === "all" ? path : null;
  }, [fileContentModes, listView, selectedPath, stickyEntry?.path]);

  const collectChangeAnchors = useCallback((path: string) => {
    const row = rowNodesByPathRef.current.get(path);
    if (!row) {
      return [] as HTMLElement[];
    }
    const diffContainers = row.querySelectorAll<HTMLElement>("diffs-container");
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
    if (listView !== "tree" || !stickyEntry) {
      return false;
    }
    return (fileContentModes[stickyEntry.path] ?? "focused") === "all";
  }, [fileContentModes, listView, stickyEntry]);

  const refreshAnchorStats = useCallback((path: string) => {
    const anchors = collectChangeAnchors(path);
    setAnchorCountByPath((prev) => ({ ...prev, [path]: anchors.length }));
    setAnchorIndexByPath((prev) => {
      const current = prev[path] ?? 0;
      const next = anchors.length > 0 ? Math.min(current, anchors.length - 1) : 0;
      if (current === next && path in prev) {
        return prev;
      }
      return { ...prev, [path]: next };
    });
  }, [collectChangeAnchors]);

  useEffect(() => {
    if (!stickyEntry || !isStickyAllMode) {
      return;
    }
    const path = stickyEntry.path;
    const frame = requestAnimationFrame(() => {
      refreshAnchorStats(path);
    });
    const row = rowNodesByPathRef.current.get(path);
    if (!row) {
      return () => {
        cancelAnimationFrame(frame);
      };
    }
    const observer = new MutationObserver(() => {
      refreshAnchorStats(path);
    });
    observer.observe(row, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isStickyAllMode, stickyEntry, fullDiffByPath, diffStyle, refreshAnchorStats]);

  const handleJumpChangeAnchor = useCallback((direction: "prev" | "next") => {
    if (!stickyEntry) {
      return;
    }
    const path = stickyEntry.path;
    const anchors = collectChangeAnchors(path);
    setAnchorCountByPath((prev) => ({ ...prev, [path]: anchors.length }));
    if (anchors.length === 0) {
      setAnchorIndexByPath((prev) => ({ ...prev, [path]: 0 }));
      return;
    }
    const current = anchorIndexByPath[path] ?? 0;
    const next = direction === "next"
      ? (current + 1) % anchors.length
      : (current - 1 + anchors.length) % anchors.length;
    anchors[next]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setAnchorCountByPath((prev) => ({ ...prev, [path]: anchors.length }));
    setAnchorIndexByPath((prev) => ({ ...prev, [path]: next }));
  }, [anchorIndexByPath, collectChangeAnchors, stickyEntry]);

  useEffect(() => {
    if (!workspaceId || !fullDiffTargetPath) {
      return;
    }
    let cancelled = false;
    setLoadingFullDiffByPath((prev) => ({ ...prev, [fullDiffTargetPath]: true }));
    void getGitFileFullDiff(workspaceId, fullDiffTargetPath)
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
  }, [workspaceId, fullDiffTargetPath]);

  return (
    <WorkerPoolContextProvider
      poolOptions={poolOptions}
      highlighterOptions={highlighterOptions}
    >
      <div className="diff-viewer" ref={containerRef}>
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
        {!error && stickyEntry && (
          <div className="diff-viewer-sticky">
            <div className="diff-viewer-header diff-viewer-header-sticky">
              <span
                className="diff-viewer-status"
                data-status={stickyEntry.status}
              >
                {stickyEntry.status}
              </span>
              <span className="diff-viewer-path">{stickyEntry.path}</span>
              <div className="diff-viewer-header-mode" role="group" aria-label={t("git.diffView")}>
                <button
                  type="button"
                  className={`diff-viewer-header-mode-icon-button ${diffStyle === "split" ? "active" : ""}`}
                  onClick={() => onDiffStyleChange?.("split")}
                  aria-label={t("git.dualPanelDiff")}
                >
                  <Columns2 size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`diff-viewer-header-mode-icon-button ${diffStyle === "unified" ? "active" : ""}`}
                  onClick={() => onDiffStyleChange?.("unified")}
                  aria-label={t("git.singleColumnDiff")}
                >
                  <Rows3 size={12} aria-hidden />
                </button>
              </div>
              {listView === "tree" && (
                <>
                  <div className="diff-viewer-header-mode" role="group" aria-label={t("git.diffContentMode")}>
                    {(() => {
                      const activePath = stickyEntry.path;
                      const isAll = (fileContentModes[activePath] ?? "focused") === "all";
                      const isLoadingFull = Boolean(loadingFullDiffByPath[activePath]);
                      const hasFullDiff = Boolean(fullDiffByPath[activePath]?.trim());
                      const hasError = Boolean(fullDiffErrorByPath[activePath]);
                      const allLabel = isAll
                        ? `${t("git.viewAllContent")} (${hasError ? "ERR" : isLoadingFull ? "..." : hasFullDiff ? "FULL" : "EMPTY"})`
                        : t("git.viewAllContent");
                      return (
                    <button
                      type="button"
                      className={`diff-viewer-header-mode-button ${(fileContentModes[stickyEntry.path] ?? "focused") === "all" ? "active" : ""}`}
                      onClick={() => handleFileContentModeChange(stickyEntry.path, "all")}
                      title={hasError ? fullDiffErrorByPath[activePath] : "Full diff status"}
                    >
                      {allLabel}
                    </button>
                      );
                    })()}
                    <button
                      type="button"
                      className={`diff-viewer-header-mode-button ${(fileContentModes[stickyEntry.path] ?? "focused") === "focused" ? "active" : ""}`}
                      onClick={() => handleFileContentModeChange(stickyEntry.path, "focused")}
                    >
                      {t("git.viewFocusedContent")}
                    </button>
                  </div>
                  <div className="diff-viewer-header-mode" role="group" aria-label={t("git.fileContentMode")}>
                    <button
                      type="button"
                      className="diff-viewer-header-mode-button"
                      onClick={() => onOpenFile?.(stickyEntry.path)}
                    >
                      {t("git.openFileFullText")}
                    </button>
                  </div>
                </>
              )}
            </div>
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
              return (
                <div
                  key={entry.path}
                  className="diff-viewer-row"
                  data-index={virtualRow.index}
                  ref={setRowRef(entry.path)}
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
                    />
                  ) : (
                    (() => {
                      const contentMode = fileContentModes[entry.path] ?? "focused";
                      const fullDiff = fullDiffByPath[entry.path];
                      const diffText = contentMode === "all" && fullDiff?.trim()
                        ? fullDiff
                        : entry.diff;
                      return (
                    <DiffCard
                      entry={entry}
                      diffText={diffText}
                      isSelected={entry.path === selectedPath}
                      diffStyle={diffStyle}
                      contentMode={contentMode}
                    />
                      );
                    })()
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!error && stickyEntry && isStickyAllMode && (
          <div className="diff-viewer-anchor-floating" role="group" aria-label="Change anchors">
            <button
              type="button"
              className="diff-viewer-anchor-btn"
              onClick={() => handleJumpChangeAnchor("prev")}
              disabled={!anchorCountByPath[stickyEntry.path]}
              title="上一个改动"
            >
              <ChevronUp size={13} aria-hidden />
            </button>
            <span className="diff-viewer-anchor-meta">
              {anchorCountByPath[stickyEntry.path]
                ? `${(anchorIndexByPath[stickyEntry.path] ?? 0) + 1}/${anchorCountByPath[stickyEntry.path]}`
                : "0/0"}
            </span>
            <button
              type="button"
              className="diff-viewer-anchor-btn"
              onClick={() => handleJumpChangeAnchor("next")}
              disabled={!anchorCountByPath[stickyEntry.path]}
              title="下一个改动"
            >
              <ChevronDown size={13} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </WorkerPoolContextProvider>
  );
}
