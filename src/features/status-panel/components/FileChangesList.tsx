import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { FileChangeSummary } from "../types";
import { FileIcon } from "../../messages/components/toolBlocks/FileIcon";

interface FileChangesListProps {
  fileChanges: FileChangeSummary[];
  totalAdditions: number;
  totalDeletions: number;
  onOpenDiffPath?: (path: string) => void;
  onAfterSelect?: () => void;
}

export const FileChangesList = memo(function FileChangesList({
  fileChanges,
  totalAdditions,
  totalDeletions,
  onOpenDiffPath,
  onAfterSelect,
}: FileChangesListProps) {
  const { t } = useTranslation();
  if (fileChanges.length === 0) {
    return <div className="sp-empty">{t("statusPanel.emptyFileChanges")}</div>;
  }
  return (
    <div className="sp-file-list">
      <div className="sp-file-summary">
        <span className="sp-file-summary-label">TOTAL</span>
        <span className="sp-file-stats">
          <span className="sp-file-add">+{totalAdditions}</span>
          <span className="sp-file-del">-{totalDeletions}</span>
        </span>
      </div>
      {fileChanges.map((file) => (
        <div key={file.filePath} className="sp-file-item">
          <span className={`sp-file-badge ${file.status === "A" ? "sp-file-added" : "sp-file-modified"}`}>
            {file.status}
          </span>
          <FileIcon fileName={file.fileName} size={14} />
          <button
            type="button"
            className={`sp-file-name${onOpenDiffPath ? " is-clickable" : ""}`}
            title={file.filePath}
            onClick={(event) => {
              event.stopPropagation();
              if (!onOpenDiffPath) {
                return;
              }
              onOpenDiffPath(file.filePath);
              onAfterSelect?.();
            }}
          >
            {file.fileName}
          </button>
          <span className="sp-file-stats">
            <span className="sp-file-add">+{file.additions}</span>
            <span className="sp-file-del">-{file.deletions}</span>
          </span>
        </div>
      ))}
    </div>
  );
});
