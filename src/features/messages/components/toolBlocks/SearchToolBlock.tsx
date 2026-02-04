/**
 * 搜索工具块组件 - 用于展示 Grep、Glob 等搜索操作
 * Search Tool Block Component - for displaying grep, glob and other search operations
 */
import { memo, useMemo } from 'react';
import Search from 'lucide-react/dist/esm/icons/search';
import FolderSearch from 'lucide-react/dist/esm/icons/folder-search';
import type { ConversationItem } from '../../../../types';
import { parseToolArgs, getFirstStringField, truncateText, extractToolName } from './toolConstants';

interface SearchToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

/**
 * 获取状态
 */
function getStatus(item: Extract<ConversationItem, { kind: 'tool' }>): 'completed' | 'processing' | 'failed' {
  const status = item.status?.toLowerCase() || '';
  if (/(fail|error)/.test(status)) return 'failed';
  if (/(pending|running|processing|started|in_progress)/.test(status)) return 'processing';
  if (item.output) return 'completed';
  return 'processing';
}

export const SearchToolBlock = memo(function SearchToolBlock({
  item,
  isExpanded,
  onToggle,
}: SearchToolBlockProps) {
  const toolName = extractToolName(item.title);
  const isGlob = toolName.toLowerCase().includes('glob') || toolName.toLowerCase().includes('find');

  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  // 提取搜索词/模式
  const pattern = getFirstStringField(args, ['pattern', 'query', 'search_term', 'text']);
  const displayPattern = truncateText(pattern, 60);

  // 提取路径
  const path = getFirstStringField(args, ['path', 'directory', 'dir']);

  const status = getStatus(item);
  const Icon = isGlob ? FolderSearch : Search;
  const displayName = isGlob ? '文件匹配' : '搜索';

  return (
    <div className="tool-block">
      <button
        type="button"
        className="tool-block-header"
        onClick={() => onToggle(item.id)}
        aria-expanded={isExpanded}
      >
        <div className="tool-block-title">
          <Icon className={`tool-block-icon ${status}`} size={14} aria-hidden />
          <span className="tool-block-name">{displayName}</span>
          {displayPattern && (
            <span className="tool-block-summary tool-block-pattern" title={pattern}>
              {displayPattern}
            </span>
          )}
        </div>
        <span className={`tool-block-dot ${status}`} aria-hidden />
      </button>

      {isExpanded && (
        <div className="tool-block-details">
          {path && (
            <div className="tool-block-params">
              <div className="tool-block-param">
                <span className="tool-block-param-key">路径:</span>
                <span className="tool-block-param-value">{path}</span>
              </div>
            </div>
          )}
          {item.output && (
            <div className="tool-block-output">
              <pre>{item.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default SearchToolBlock;
