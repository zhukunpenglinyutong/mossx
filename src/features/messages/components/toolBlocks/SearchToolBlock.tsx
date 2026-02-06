/**
 * 搜索工具块组件 - 用于展示 Grep、Glob 等搜索操作
 * Search Tool Block Component - for displaying grep, glob and other search operations
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useState } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  truncateText,
  extractToolName,
  resolveToolStatus,
} from './toolConstants';

interface SearchToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

/**
 * 获取状态
 */
function getStatus(item: Extract<ConversationItem, { kind: 'tool' }>): 'completed' | 'processing' | 'failed' {
  return resolveToolStatus(item.status, Boolean(item.output));
}

export const SearchToolBlock = memo(function SearchToolBlock({
  item,
  isExpanded: _isExpanded,
  onToggle: _onToggle,
}: SearchToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const toolName = extractToolName(item.title);
  const isGlob = toolName.toLowerCase().includes('glob') || toolName.toLowerCase().includes('find');

  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  const pattern = getFirstStringField(args, ['pattern', 'query', 'search_term', 'text']);
  const displayPattern = truncateText(pattern, 60);
  const path = getFirstStringField(args, ['path', 'directory', 'dir']);

  const status = getStatus(item);
  const codiconClass = isGlob ? 'codicon-folder' : 'codicon-search';
  const displayName = isGlob ? '文件匹配' : '搜索';
  const isError = status === 'failed';
  const isCompleted = status === 'completed';

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setExpanded(prev => !prev)}
        style={{
          borderBottom: expanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className={`codicon ${codiconClass} tool-title-icon`} />
          <span className="tool-title-text">{displayName}</span>
          {displayPattern && (
            <span className="tool-title-summary" title={pattern}>
              {displayPattern}
            </span>
          )}
        </div>
        <div className={`tool-status-indicator ${isError ? 'error' : isCompleted ? 'completed' : 'pending'}`} />
      </div>

      {expanded && (
        <div className="task-details" style={{ border: 'none' }}>
          {path && (
            <div className="task-content-wrapper">
              <div className="task-field">
                <div className="task-field-label">路径</div>
                <div className="task-field-content">{path}</div>
              </div>
            </div>
          )}
          {item.output && (
            <div style={{ padding: '12px' }}>
              <div className="task-field-content" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{item.output}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default SearchToolBlock;
