/**
 * 单个编辑文件工具块组件
 * Edit Tool Block Component - for displaying a single file edit operation with diff stats
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useState } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  getFileName,
  resolveToolStatus,
} from './toolConstants';
import { FileIcon } from './FileIcon';

interface EditToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

interface DiffStats {
  additions: number;
  deletions: number;
}

function computeDiffStats(oldStr: string, newStr: string): DiffStats {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  if (oldLines.length === 0 && newLines.length === 0) return { additions: 0, deletions: 0 };
  if (oldLines.length === 0) return { additions: newLines.length, deletions: 0 };
  if (newLines.length === 0) return { additions: 0, deletions: oldLines.length };
  const diff = newLines.length - oldLines.length;
  if (diff >= 0) return { additions: diff || 1, deletions: 0 };
  return { additions: 0, deletions: -diff };
}

export const EditToolBlock = memo(function EditToolBlock({
  item,
  isExpanded: _isExpanded,
  onToggle: _onToggle,
}: EditToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  const filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
  const fileName = getFileName(filePath);

  const diff = useMemo(() => {
    if (!args) return { additions: 0, deletions: 0 };
    const oldString = (args.old_string as string) ?? '';
    const newString = (args.new_string as string) ?? '';
    if (oldString || newString) {
      return computeDiffStats(oldString, newString);
    }
    const content = (args.content as string) ?? '';
    if (content) {
      return { additions: content.split('\n').length, deletions: 0 };
    }
    return { additions: 0, deletions: 0 };
  }, [args]);

  const status = resolveToolStatus(item.status, Boolean(item.output));
  const isCompleted = status === 'completed';
  const isError = status === 'failed';

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          borderBottom: expanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className="codicon codicon-edit tool-title-icon" />
          <span className="tool-title-text">编辑文件</span>
          {fileName && (
            <span className="tool-title-summary" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center', width: '16px', height: '16px' }}>
                <FileIcon fileName={fileName} size={16} />
              </span>
              {fileName}
            </span>
          )}
          {(diff.additions > 0 || diff.deletions > 0) && (
            <span className="edit-item-diff-stats">
              {diff.additions > 0 && (
                <span className="diff-stat-add">+{diff.additions}</span>
              )}
              {diff.deletions > 0 && (
                <span className="diff-stat-del">-{diff.deletions}</span>
              )}
            </span>
          )}
        </div>
        <div className={`tool-status-indicator ${isError ? 'error' : isCompleted ? 'completed' : 'pending'}`} />
      </div>

      {expanded && item.output && (
        <div className="task-details" style={{ padding: '12px', border: 'none' }}>
          <div className="task-field-content" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {item.output}
          </div>
        </div>
      )}
    </div>
  );
});

export default EditToolBlock;
