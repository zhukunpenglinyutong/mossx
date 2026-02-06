/**
 * 批量编辑文件分组组件
 * Groups multiple consecutive Edit/Write/FileChange tool calls into a collapsible file list with diff stats
 */
import { memo, useMemo, useRef, useEffect, useState } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  getFileName,
  resolveToolStatus,
  type ToolStatusTone,
} from './toolConstants';
import { FileIcon } from './FileIcon';

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

interface EditToolGroupBlockProps {
  items: ToolItem[];
}

interface DiffStats {
  additions: number;
  deletions: number;
}

interface ParsedEditItem {
  id: string;
  fileName: string;
  filePath: string;
  diff: DiffStats;
  status: ToolStatusTone;
}

const MAX_VISIBLE_ITEMS = 3;
const ITEM_HEIGHT = 32;

/**
 * 从 old_string / new_string 计算简单 diff 统计
 */
function computeDiffStats(oldStr: string, newStr: string): DiffStats {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const oldCount = oldLines.length;
  const newCount = newLines.length;

  if (oldCount === 0 && newCount === 0) return { additions: 0, deletions: 0 };
  if (oldCount === 0) return { additions: newCount, deletions: 0 };
  if (newCount === 0) return { additions: 0, deletions: oldCount };

  // 简化计算：行数差异
  const diff = newCount - oldCount;
  if (diff >= 0) {
    return { additions: diff || 1, deletions: 0 };
  }
  return { additions: 0, deletions: -diff };
}

function parseEditItem(item: ToolItem): ParsedEditItem {
  const args = parseToolArgs(item.detail);
  let fileName = '';
  let filePath = '';
  let diff: DiffStats = { additions: 0, deletions: 0 };

  if (item.toolType === 'fileChange' && item.changes?.length) {
    // fileChange 类型
    filePath = item.changes[0].path;
    fileName = getFileName(filePath);
    // 从 changes diff 统计
    for (const change of item.changes) {
      if (change.diff) {
        const lines = change.diff.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) diff.additions++;
          if (line.startsWith('-') && !line.startsWith('---')) diff.deletions++;
        }
      }
    }
  } else {
    // edit/write 工具
    filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
    fileName = getFileName(filePath);
    const oldString = (args?.old_string as string) ?? '';
    const newString = (args?.new_string as string) ?? '';
    if (oldString || newString) {
      diff = computeDiffStats(oldString, newString);
    } else {
      // write 工具 - 全部是新增
      const content = (args?.content as string) ?? '';
      if (content) {
        diff = { additions: content.split('\n').length, deletions: 0 };
      }
    }
  }

  const hasOutput = Boolean(item.output) || Boolean(item.changes?.length);
  const status = resolveToolStatus(item.status, hasOutput);

  return { id: item.id, fileName, filePath, diff, status };
}

function groupStatus(items: ToolItem[]): ToolStatusTone {
  const hasProcessing = items.some((item) => {
    const hasOutput = Boolean(item.output) || Boolean(item.changes?.length);
    return resolveToolStatus(item.status, hasOutput) === 'processing';
  });
  if (hasProcessing) return 'processing';
  const hasFailed = items.some((item) => {
    const hasOutput = Boolean(item.output) || Boolean(item.changes?.length);
    return resolveToolStatus(item.status, hasOutput) === 'failed';
  });
  if (hasFailed) return 'failed';
  return 'completed';
}

export const EditToolGroupBlock = memo(function EditToolGroupBlock({
  items,
}: EditToolGroupBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(items.length);

  const parsed = useMemo(() => items.map(parseEditItem), [items]);
  const status = groupStatus(items);

  const totalDiff = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const p of parsed) {
      additions += p.diff.additions;
      deletions += p.diff.deletions;
    }
    return { additions, deletions };
  }, [parsed]);

  useEffect(() => {
    if (items.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  const listHeight = Math.min(parsed.length, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;
  const needsScroll = parsed.length > MAX_VISIBLE_ITEMS;

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          borderBottom: isExpanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className="codicon codicon-edit tool-title-icon" />
          <span className="tool-title-text">编辑文件</span>
          <span className="tool-title-summary" style={{
            color: 'var(--text-secondary)',
            marginLeft: '4px',
            flexShrink: 0,
          }}>
            ({items.length})
          </span>
          {(totalDiff.additions > 0 || totalDiff.deletions > 0) && (
            <span className="edit-group-diff-total">
              {totalDiff.additions > 0 && (
                <span className="diff-stat-add">+{totalDiff.additions}</span>
              )}
              {totalDiff.deletions > 0 && (
                <span className="diff-stat-del">-{totalDiff.deletions}</span>
              )}
            </span>
          )}
        </div>
        <div className={`tool-status-indicator ${status === 'failed' ? 'error' : status}`} />
      </div>

      {isExpanded && (
        <div
          className="task-details file-list-container"
          ref={listRef}
          style={{
            padding: '6px 8px',
            border: 'none',
            maxHeight: needsScroll ? `${listHeight + 12}px` : undefined,
            overflowY: needsScroll ? 'auto' : 'hidden',
            overflowX: 'hidden',
          }}
        >
          {parsed.map((entry) => (
            <div key={entry.id} className="file-list-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: '4px',
              minHeight: `${ITEM_HEIGHT}px`,
            }}>
              <span style={{ marginRight: '8px', display: 'flex', alignItems: 'center', width: '16px', height: '16px', flexShrink: 0 }}>
                <FileIcon fileName={entry.fileName || 'file'} size={16} />
              </span>
              <span style={{
                fontSize: '12px',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}>
                {entry.fileName || entry.filePath || '...'}
              </span>
              <span className="edit-item-diff-stats">
                {entry.diff.additions > 0 && (
                  <span className="diff-stat-add">+{entry.diff.additions}</span>
                )}
                {entry.diff.deletions > 0 && (
                  <span className="diff-stat-del">-{entry.diff.deletions}</span>
                )}
              </span>
              <div
                className={`tool-status-indicator ${entry.status === 'failed' ? 'error' : entry.status}`}
                style={{ marginLeft: '8px' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default EditToolGroupBlock;
