/**
 * 批量读取文件分组组件
 * Groups multiple consecutive Read tool calls into a collapsible file list
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useRef, useEffect, useState } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  getFileName,
  resolveToolStatus,
} from './toolConstants';
import { FileIcon } from './FileIcon';

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

interface ReadToolGroupBlockProps {
  items: ToolItem[];
}

interface ParsedReadItem {
  id: string;
  fileName: string;
  filePath: string;
  isDirectory: boolean;
  lineInfo: string;
  isCompleted: boolean;
  isError: boolean;
}

const MAX_VISIBLE_ITEMS = 3;
const ITEM_HEIGHT = 28;

function parseReadItem(item: ToolItem): ParsedReadItem {
  const args = parseToolArgs(item.detail);
  const filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
  const fileName = getFileName(filePath);
  const isDirectory = filePath === '.' || filePath === '..' || (filePath?.endsWith('/') ?? false);

  const offset = args?.offset as number | undefined;
  const limit = args?.limit as number | undefined;
  let lineInfo = '';
  if (typeof offset === 'number' && typeof limit === 'number') {
    lineInfo = `L${offset + 1}-${offset + limit}`;
  }

  const status = resolveToolStatus(item.status, Boolean(item.output));
  const isCompleted = status === 'completed';
  const isError = status === 'failed';

  return { id: item.id, fileName, filePath, isDirectory, lineInfo, isCompleted, isError };
}

export const ReadToolGroupBlock = memo(function ReadToolGroupBlock({
  items,
}: ReadToolGroupBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(items.length);

  const parsed = useMemo(() => items.map(parseReadItem), [items]);

  useEffect(() => {
    if (items.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  if (parsed.length === 0) return null;

  const needsScroll = parsed.length > MAX_VISIBLE_ITEMS;
  const listHeight = needsScroll
    ? MAX_VISIBLE_ITEMS * ITEM_HEIGHT
    : parsed.length * ITEM_HEIGHT;

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          borderBottom: isExpanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section" style={{ overflow: 'hidden' }}>
          <span className="codicon codicon-file-code tool-title-icon" />
          <span className="tool-title-text" style={{ flexShrink: 0 }}>读取文件</span>
          <span className="tool-title-summary" style={{
            color: 'var(--text-secondary)',
            marginLeft: '4px',
            flexShrink: 0,
          }}>
            ({parsed.length})
          </span>
        </div>
      </div>

      {isExpanded && (
        <div
          ref={listRef}
          className="task-details file-list-container"
          style={{
            padding: '6px 8px',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0',
            maxHeight: `${listHeight + 12}px`,
            overflowY: needsScroll ? 'auto' : 'hidden',
            overflowX: 'hidden',
          }}
        >
          {parsed.map((entry) => (
            <div
              key={entry.id}
              className={`file-list-item ${!entry.isDirectory ? 'clickable-file' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: entry.isDirectory ? 'default' : 'pointer',
                transition: 'background-color 0.15s ease',
                minHeight: `${ITEM_HEIGHT}px`,
                flexShrink: 0,
              }}
              title={entry.filePath}
            >
              <span style={{
                marginRight: '8px',
                display: 'flex',
                alignItems: 'center',
                width: '16px',
                height: '16px',
                flexShrink: 0,
              }}>
                <FileIcon fileName={entry.isDirectory ? entry.fileName + '/' : entry.fileName || 'file'} size={16} />
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
              {entry.lineInfo && (
                <span style={{
                  marginLeft: '8px',
                  fontSize: '11px',
                  color: 'var(--text-tertiary, var(--text-secondary))',
                  flexShrink: 0,
                  opacity: 0.8,
                }}>
                  {entry.lineInfo}
                </span>
              )}
              <div
                className={`tool-status-indicator ${entry.isError ? 'error' : entry.isCompleted ? 'completed' : 'pending'}`}
                style={{ marginLeft: '8px' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default ReadToolGroupBlock;
