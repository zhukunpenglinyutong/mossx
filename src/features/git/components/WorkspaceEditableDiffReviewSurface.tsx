import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import FileIcon from "../../../components/FileIcon";
import type { GitFileStatus, OpenAppTarget } from "../../../types";
import { getGitFileFullDiff } from "../../../services/tauri";
import { computeDiffFromUnifiedPatch } from "../../messages/utils/diffUtils";
import { FileViewPanel } from "../../files/components/FileViewPanel";
import { resolveFileRenderProfile } from "../../files/utils/fileRenderProfile";
import {
  resolveFileReadTarget,
  resolveWorkspaceRelativePath,
} from "../../../utils/workspacePaths";
import { GitDiffViewer } from "./GitDiffViewer";

export type EditableDiffReviewFile = {
  filePath: string;
  status: string;
  additions: number;
  deletions: number;
  diff: string;
  fileName?: string;
  isImage?: boolean;
  oldImageData?: string | null;
  newImageData?: string | null;
  oldImageMime?: string | null;
  newImageMime?: string | null;
};

type NormalizedEditableDiffReviewFile = EditableDiffReviewFile & {
  reviewPath: string;
  reviewFileName: string;
};

type WorkspaceEditableDiffReviewSurfaceProps = {
  workspaceId: string | null;
  workspacePath?: string | null;
  gitStatusFiles?: GitFileStatus[];
  files: EditableDiffReviewFile[];
  selectedPath?: string | null;
  onSelectedPathChange?: (path: string) => void;
  diffStyle?: "split" | "unified";
  onDiffStyleChange?: (style: "split" | "unified") => void;
  onRequestClose?: (() => void) | null;
  headerControlsTarget?: HTMLElement | null;
  fullDiffSourceKey?: string | null;
  embeddedAnchorVariant?: "default" | "modal-pager";
  stickyHeaderMode?: "full" | "controls-only";
  showSidebar?: boolean;
  focusSelectedFileOnly?: boolean;
  allowEditing?: boolean;
  onRequestRefreshReview?: (() => void | Promise<void>) | null;
  onRequestGitStatusRefresh?: (() => void) | null;
  openTargets?: OpenAppTarget[];
  openAppIconById?: Record<string, string>;
  selectedOpenAppId?: string;
  onSelectOpenAppId?: (id: string) => void;
};

const EMPTY_OPEN_TARGETS: OpenAppTarget[] = [];

function resolveReviewFileName(file: EditableDiffReviewFile, reviewPath: string) {
  const explicit = file.fileName?.trim();
  if (explicit) {
    return explicit;
  }
  const normalized = reviewPath.replace(/\\/g, "/");
  const leaf = normalized.split("/").filter(Boolean).pop();
  return leaf ?? normalized;
}

function canEditReviewFile(
  file: NormalizedEditableDiffReviewFile | null,
  workspacePath: string | null,
  allowEditing: boolean,
) {
  if (!allowEditing || !file || file.status.toUpperCase() === "D") {
    return false;
  }
  const fileReadTarget = resolveFileReadTarget(workspacePath, file.reviewPath);
  if (fileReadTarget.domain !== "workspace") {
    return false;
  }
  const renderProfile = resolveFileRenderProfile(file.reviewPath);
  return renderProfile.editCapability !== "read-only";
}

function resolveReadOnlyHint(
  t: ReturnType<typeof useTranslation>["t"],
  file: NormalizedEditableDiffReviewFile | null,
  editable: boolean,
) {
  if (editable) {
    return null;
  }
  if (!file) {
    return null;
  }
  if (file.status.toUpperCase() === "D") {
    return t("files.readOnly");
  }
  const renderProfile = resolveFileRenderProfile(file.reviewPath);
  if (renderProfile.editCapability === "read-only") {
    return t("files.readOnly");
  }
  return t("files.readOnly");
}

export function WorkspaceEditableDiffReviewSurface({
  workspaceId,
  workspacePath = null,
  gitStatusFiles,
  files,
  selectedPath = null,
  onSelectedPathChange,
  diffStyle = "split",
  onDiffStyleChange,
  onRequestClose = null,
  headerControlsTarget = null,
  fullDiffSourceKey = null,
  embeddedAnchorVariant = "default",
  stickyHeaderMode = "full",
  showSidebar = false,
  focusSelectedFileOnly = false,
  allowEditing = false,
  onRequestRefreshReview = null,
  onRequestGitStatusRefresh = null,
  openTargets = EMPTY_OPEN_TARGETS,
  openAppIconById = {},
  selectedOpenAppId = "",
  onSelectOpenAppId,
}: WorkspaceEditableDiffReviewSurfaceProps) {
  const { t } = useTranslation();
  const normalizedFiles = useMemo<NormalizedEditableDiffReviewFile[]>(
    () =>
      files.map((file) => {
        const reviewPath = resolveWorkspaceRelativePath(workspacePath, file.filePath);
        return {
          ...file,
          reviewPath,
          reviewFileName: resolveReviewFileName(file, reviewPath),
        };
      }),
    [files, workspacePath],
  );
  const [reviewFiles, setReviewFiles] = useState<NormalizedEditableDiffReviewFile[]>(normalizedFiles);
  const [mode, setMode] = useState<"diff" | "edit">("diff");
  const [localSelectedPath, setLocalSelectedPath] = useState<string | null>(
    selectedPath ?? normalizedFiles[0]?.reviewPath ?? null,
  );
  const [, setIsDirty] = useState(false);

  useEffect(() => {
    setReviewFiles(normalizedFiles);
  }, [normalizedFiles]);

  useEffect(() => {
    if (selectedPath != null) {
      setLocalSelectedPath(selectedPath);
      return;
    }
    setLocalSelectedPath((current) => {
      if (current && normalizedFiles.some((file) => file.reviewPath === current)) {
        return current;
      }
      return normalizedFiles[0]?.reviewPath ?? null;
    });
  }, [normalizedFiles, selectedPath]);

  const activeReviewPath = selectedPath ?? localSelectedPath;
  const activeFile =
    reviewFiles.find((file) => file.reviewPath === activeReviewPath)
    ?? reviewFiles[0]
    ?? null;
  const canEdit = canEditReviewFile(activeFile, workspacePath, allowEditing);
  const readOnlyHint = resolveReadOnlyHint(t, activeFile, canEdit);
  const visibleDiffs = useMemo(() => {
    if (!focusSelectedFileOnly || !activeFile) {
      return reviewFiles.map((file) => ({
        path: file.reviewPath,
        status: file.status,
        diff: file.diff,
        isImage: file.isImage,
        oldImageData: file.oldImageData,
        newImageData: file.newImageData,
        oldImageMime: file.oldImageMime,
        newImageMime: file.newImageMime,
      }));
    }
    return [
      {
        path: activeFile.reviewPath,
        status: activeFile.status,
        diff: activeFile.diff,
        isImage: activeFile.isImage,
        oldImageData: activeFile.oldImageData,
        newImageData: activeFile.newImageData,
        oldImageMime: activeFile.oldImageMime,
        newImageMime: activeFile.newImageMime,
      },
    ];
  }, [activeFile, focusSelectedFileOnly, reviewFiles]);

  const handleSelectPath = useCallback(
    (nextPath: string) => {
      if (nextPath === activeReviewPath) {
        return;
      }
      setMode("diff");
      setIsDirty(false);
      setLocalSelectedPath(nextPath);
      onSelectedPathChange?.(nextPath);
    },
    [activeReviewPath, onSelectedPathChange],
  );

  const handleRefreshActiveFile = useCallback(async () => {
    if (!workspaceId || !activeFile) {
      return;
    }
    try {
      const diff = await getGitFileFullDiff(workspaceId, activeFile.reviewPath);
      const stats = computeDiffFromUnifiedPatch(diff);
      setReviewFiles((current) =>
        current.map((file) =>
          file.reviewPath === activeFile.reviewPath
            ? {
                ...file,
                diff,
                additions: stats.additions,
                deletions: stats.deletions,
              }
            : file,
        ),
      );
    } catch {
      setReviewFiles((current) =>
        current.map((file) =>
          file.reviewPath === activeFile.reviewPath
            ? {
                ...file,
                diff: "",
                additions: 0,
                deletions: 0,
              }
            : file,
        ),
      );
    }
  }, [activeFile, workspaceId]);

  const handleSaveSuccess = useCallback(() => {
    setIsDirty(false);
    void handleRefreshActiveFile();
    void onRequestRefreshReview?.();
    onRequestGitStatusRefresh?.();
  }, [handleRefreshActiveFile, onRequestGitStatusRefresh, onRequestRefreshReview]);

  const handleExitEditMode = useCallback(() => {
    setMode("diff");
  }, []);

  const shouldShowSidebar = showSidebar && reviewFiles.length > 1;

  return (
    <div className={`editable-diff-review-surface${shouldShowSidebar ? " has-sidebar" : ""}`}>
      <div className="editable-diff-review-toolbar">
        <div className="editable-diff-review-toolbar-copy">
          <span className="editable-diff-review-toolbar-kicker">
            {mode === "edit" ? t("files.edit") : t("git.previewModalAction")}
          </span>
          <span className="editable-diff-review-toolbar-title">
            {activeFile?.reviewPath ?? t("git.diffUnavailable")}
          </span>
        </div>
        <div className="editable-diff-review-toolbar-actions">
          {mode === "diff" ? (
            <button
              type="button"
              className="editable-diff-review-action"
              onClick={() => setMode("edit")}
              disabled={!canEdit}
              title={canEdit ? t("files.edit") : readOnlyHint ?? t("files.readOnly")}
            >
              <Pencil size={14} aria-hidden />
              <span>{t("files.edit")}</span>
            </button>
          ) : null}
          {mode === "diff" && readOnlyHint ? (
            <span className="editable-diff-review-readonly-hint">{readOnlyHint}</span>
          ) : null}
        </div>
      </div>
      <div className="editable-diff-review-layout">
        <div className="editable-diff-review-main">
          {mode === "edit" && activeFile ? (
            <FileViewPanel
              workspaceId={workspaceId ?? ""}
              workspacePath={workspacePath ?? ""}
              filePath={activeFile.reviewPath}
              gitStatusFiles={gitStatusFiles}
              openTabs={[activeFile.reviewPath]}
              activeTabPath={activeFile.reviewPath}
              openTargets={openTargets}
              openAppIconById={openAppIconById}
              selectedOpenAppId={selectedOpenAppId}
              onSelectOpenAppId={onSelectOpenAppId ?? (() => undefined)}
              onClose={handleExitEditMode}
              headerLayout="single-row"
              singleRowLeadingLabel={t("files.preview")}
              onSingleRowLeadingAction={handleExitEditMode}
              onSaveSuccess={handleSaveSuccess}
              onDirtyChange={setIsDirty}
            />
          ) : (
            <GitDiffViewer
              workspaceId={workspaceId}
              diffs={visibleDiffs}
              selectedPath={activeFile?.reviewPath ?? null}
              isLoading={false}
              error={null}
              listView="flat"
              stickyHeaderMode={stickyHeaderMode}
              embeddedAnchorVariant={embeddedAnchorVariant}
              showContentModeControls
              headerControlsTarget={headerControlsTarget}
              onRequestClose={onRequestClose}
              fullDiffSourceKey={fullDiffSourceKey}
              diffStyle={diffStyle}
              onDiffStyleChange={onDiffStyleChange}
              onActivePathChange={focusSelectedFileOnly ? undefined : handleSelectPath}
            />
          )}
        </div>
        {shouldShowSidebar ? (
          <aside className="editable-diff-review-sidebar">
            <div className="editable-diff-review-sidebar-title-row">
              <div className="editable-diff-review-sidebar-title">
                {t("statusPanel.checkpoint.fileDetailsTitle")}
              </div>
              <div className="editable-diff-review-sidebar-count">{reviewFiles.length}</div>
            </div>
            <div className="editable-diff-review-sidebar-list">
              {reviewFiles.map((file) => {
                const selected = file.reviewPath === activeFile?.reviewPath;
                return (
                  <button
                    key={file.reviewPath}
                    type="button"
                    className={`editable-diff-review-sidebar-item${selected ? " is-active" : ""}`}
                    onClick={() => handleSelectPath(file.reviewPath)}
                  >
                    <span className={`git-history-file-status git-status-${file.status.toLowerCase()}`}>
                      {file.status}
                    </span>
                    <span className="editable-diff-review-sidebar-icon" aria-hidden>
                      <FileIcon filePath={file.reviewPath} />
                    </span>
                    <span className="editable-diff-review-sidebar-name">{file.reviewFileName}</span>
                    <span className="editable-diff-review-sidebar-stats">
                      <span className="is-add">+{file.additions}</span>
                      <span className="is-del">-{file.deletions}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
