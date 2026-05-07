import { memo } from "react";
import { useTranslation } from "react-i18next";
import FileStack from "lucide-react/dist/esm/icons/file-stack";
import GitCompareArrows from "lucide-react/dist/esm/icons/git-compare-arrows";
import type { FileChangeSummary } from "../types";
import { FileIcon } from "../../messages/components/toolBlocks/FileIcon";

interface FileChangesListProps {
  fileChanges: FileChangeSummary[];
  totalAdditions: number;
  totalDeletions: number;
  onOpenFilePath?: (path: string) => void;
  onOpenDiffPath?: (path: string) => void;
  onOpenTotalDiff?: () => void;
  onAfterSelect?: () => void;
}

const FILE_BADGE_CLASS_BY_STATUS: Record<FileChangeSummary["status"], string> = {
  A: "sp-file-added",
  D: "sp-file-deleted",
  R: "sp-file-renamed",
  M: "sp-file-modified",
};

export const FileChangesList = memo(function FileChangesList({
  fileChanges,
  totalAdditions,
  totalDeletions,
  onOpenFilePath,
  onOpenDiffPath,
  onOpenTotalDiff,
  onAfterSelect,
}: FileChangesListProps) {
  const { t } = useTranslation();
  if (fileChanges.length === 0) {
    return <div className="sp-empty">{t("statusPanel.emptyFileChanges")}</div>;
  }
  return (
    <div className="sp-file-list">
      <div className="sp-file-summary">
        <span className="sp-file-summary-label">
          <span>{t("statusPanel.checkpoint.keyChanges.files")}</span>
          <span className="sp-file-summary-count">
            {t("statusPanel.checkpoint.evidence.filesChangedValue", { count: fileChanges.length })}
          </span>
        </span>
        <span className="sp-file-summary-actions">
          <span className="sp-file-stats">
            <span className="sp-file-add">+{totalAdditions}</span>
            <span className="sp-file-del">-{totalDeletions}</span>
          </span>
          <button
            type="button"
            className="sp-file-diff-action sp-file-summary-diff-action"
            aria-label={t("statusPanel.checkpoint.actions.reviewDiff")}
            title={t("statusPanel.checkpoint.actions.reviewDiff")}
            disabled={!onOpenTotalDiff}
            onClick={(event) => {
              event.stopPropagation();
              onOpenTotalDiff?.();
            }}
          >
            <FileStack
              size={16}
              strokeWidth={2.25}
              aria-hidden
              className="sp-file-diff-action-icon"
            />
          </button>
        </span>
      </div>
      {fileChanges.map((file) => (
        <div key={file.filePath} className="sp-file-item">
          <button
            type="button"
            className={`sp-file-main${onOpenFilePath ? " is-clickable" : ""}`}
            title={file.filePath}
            onClick={(event) => {
              event.stopPropagation();
              if (!onOpenFilePath) {
                return;
              }
              onOpenFilePath(file.filePath);
              onAfterSelect?.();
            }}
          >
            <span className={`sp-file-badge ${FILE_BADGE_CLASS_BY_STATUS[file.status]}`}>
              {file.status}
            </span>
            <FileIcon fileName={file.fileName} size={14} />
            <span className="sp-file-name">{file.fileName}</span>
          </button>
          <span className="sp-file-stats">
            <span className="sp-file-add">+{file.additions}</span>
            <span className="sp-file-del">-{file.deletions}</span>
          </span>
          <button
            type="button"
            className="sp-file-diff-action"
            aria-label={t("git.previewModalAction")}
            title={t("git.previewModalAction")}
            disabled={!onOpenDiffPath}
            onClick={(event) => {
              event.stopPropagation();
              if (!onOpenDiffPath) {
                return;
              }
              onOpenDiffPath(file.filePath);
              onAfterSelect?.();
            }}
          >
            <GitCompareArrows
              size={16}
              strokeWidth={2.25}
              aria-hidden
              className="sp-file-diff-action-icon"
            />
          </button>
        </div>
      ))}
    </div>
  );
});
