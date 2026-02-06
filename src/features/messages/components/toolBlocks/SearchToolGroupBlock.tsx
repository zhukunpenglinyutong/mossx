/**
 * 批量搜索分组组件
 * Groups multiple consecutive Search/Grep/Glob tool calls
 */
import { memo, useMemo, useRef, useEffect, useState } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  truncateText,
  resolveToolStatus,
  extractToolName,
  type ToolStatusTone,
} from './toolConstants';

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

interface SearchToolGroupBlockProps {
  items: ToolItem[];
}

interface ParsedSearchItem {
  id: string;
  pattern: string;
  path: string;
  status: ToolStatusTone;
}

const MAX_VISIBLE_ITEMS = 3;
const ITEM_HEIGHT = 28;

function parseSearchItem(item: ToolItem): ParsedSearchItem {
  const args = parseToolArgs(item.detail);
  const pattern = getFirstStringField(args, ['pattern', 'query', 'search_term', 'text']);
  const path = getFirstStringField(args, ['path', 'directory', 'dir']);
  const status = resolveToolStatus(item.status, Boolean(item.output));

  return {
    id: item.id,
    pattern: truncateText(pattern, 50),
    path,
    status,
  };
}

function groupStatus(items: ToolItem[]): ToolStatusTone {
  const hasProcessing = items.some(
    (item) => resolveToolStatus(item.status, Boolean(item.output)) === 'processing',
  );
  if (hasProcessing) return 'processing';
  const hasFailed = items.some(
    (item) => resolveToolStatus(item.status, Boolean(item.output)) === 'failed',
  );
  if (hasFailed) return 'failed';
  return 'completed';
}

export const SearchToolGroupBlock = memo(function SearchToolGroupBlock({
  items,
}: SearchToolGroupBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(items.length);

  const parsed = useMemo(() => items.map(parseSearchItem), [items]);
  const status = groupStatus(items);

  useEffect(() => {
    if (items.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  const listHeight = Math.min(parsed.length, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;
  const needsScroll = parsed.length > MAX_VISIBLE_ITEMS;

  // 检查是否有 glob 类型
  const hasGlob = items.some((item) => {
    const name = extractToolName(item.title).toLowerCase();
    return name.includes('glob') || name.includes('find');
  });

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
          <span className="codicon codicon-search tool-title-icon" />
          <span className="tool-title-text">{hasGlob ? '搜索/匹配' : '搜索'}</span>
          <span className="tool-title-summary" style={{
            color: 'var(--text-secondary)',
            marginLeft: '4px',
            flexShrink: 0,
          }}>
            ({items.length})
          </span>
        </div>
        <div className={`tool-status-indicator ${status === 'failed' ? 'error' : status === 'completed' ? 'completed' : 'pending'}`} />
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
            <div key={entry.id} className="file-list-item search-list-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: '4px',
              minHeight: `${ITEM_HEIGHT}px`,
            }}>
              <span className="search-item-pattern">{entry.pattern || '...'}</span>
              {entry.path && (
                <span className="search-item-path">{entry.path}</span>
              )}
              <div
                className={`tool-status-indicator ${entry.status === 'failed' ? 'error' : entry.status === 'completed' ? 'completed' : 'pending'}`}
                style={{ marginLeft: '8px' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default SearchToolGroupBlock;
