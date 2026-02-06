import { memo } from "react";
import type { FileChangeSummary } from "../types";
import { FileIcon } from "../../messages/components/toolBlocks/FileIcon";

interface FileChangesListProps {
  fileChanges: FileChangeSummary[];
}

export const FileChangesList = memo(function FileChangesList({
  fileChanges,
}: FileChangesListProps) {
  if (fileChanges.length === 0) {
    return <div className="sp-empty">暂无文件变更</div>;
  }
  return (
    <div className="sp-file-list">
      {fileChanges.map((file) => (
        <div key={file.filePath} className="sp-file-item">
          <span className={`sp-file-badge ${file.status === "A" ? "sp-file-added" : "sp-file-modified"}`}>
            {file.status}
          </span>
          <FileIcon fileName={file.fileName} size={14} />
          <span className="sp-file-name" title={file.filePath}>
            {file.fileName}
          </span>
        </div>
      ))}
    </div>
  );
});
