/**
 * MCP 工具块组件 - 用于展示 MCP (Model Context Protocol) 工具调用
 * MCP Tool Block Component - for displaying MCP tool calls
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useState } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  truncateText,
  resolveToolStatus,
} from './toolConstants';

interface McpToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

/**
 * 格式化 MCP 工具名称
 * mcp__ace-tool__search_context -> Mcp Ace-tool Search Context
 */
function formatMcpToolName(title: string): string {
  const cleanTitle = title.replace(/^Tool:\s*/i, '').trim();
  const parts = cleanTitle.split('__');

  return parts
    .map(part =>
      part.split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('-')
    )
    .join(' ');
}

/**
 * 根据 MCP 工具名称获取 codicon 类名
 */
function getMcpCodicon(title: string): string {
  const lower = title.toLowerCase();

  if (lower.includes('search') || lower.includes('context') || lower.includes('query')) {
    return 'codicon-search';
  }
  if (lower.includes('database') || lower.includes('sql') || lower.includes('db')) {
    return 'codicon-database';
  }
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('http')) {
    return 'codicon-globe';
  }
  if (lower.includes('read') || lower.includes('file') || lower.includes('doc')) {
    return 'codicon-eye';
  }

  return 'codicon-tools';
}

/**
 * 获取状态
 */
function getStatus(item: Extract<ConversationItem, { kind: 'tool' }>): 'completed' | 'processing' | 'failed' {
  return resolveToolStatus(item.status, Boolean(item.output));
}

export const McpToolBlock = memo(function McpToolBlock({
  item,
  isExpanded: _isExpanded,
  onToggle: _onToggle,
}: McpToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  const displayName = formatMcpToolName(item.title);
  const codiconClass = getMcpCodicon(item.title);
  const status = getStatus(item);
  const isError = status === 'failed';
  const isCompleted = status === 'completed';

  const summary = getFirstStringField(args, ['query', 'pattern', 'path', 'file_path', 'text', 'prompt']);
  const displaySummary = truncateText(summary, 50);

  const omitFields = useMemo(() => new Set(['query', 'pattern', 'path', 'file_path', 'text', 'prompt']), []);

  const otherParams = useMemo(() => {
    if (!args) return [];
    return Object.entries(args).filter(
      ([key, value]) => !omitFields.has(key) && value !== undefined && value !== null && value !== ''
    );
  }, [args, omitFields]);

  const hasDetails = otherParams.length > 0 || item.output;

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setExpanded(prev => !prev)}
        style={{
          cursor: 'pointer',
          borderBottom: expanded && hasDetails ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className={`codicon ${codiconClass} tool-title-icon`} />
          <span className="tool-title-text">{displayName}</span>
          {displaySummary && (
            <span className="tool-title-summary" title={summary}>
              {displaySummary}
            </span>
          )}
        </div>
        <div className={`tool-status-indicator ${isError ? 'error' : isCompleted ? 'completed' : 'pending'}`} />
      </div>

      {expanded && hasDetails && (
        <div className="task-details" style={{ border: 'none' }}>
          {otherParams.length > 0 && (
            <div className="task-content-wrapper">
              {otherParams.map(([key, value]) => (
                <div key={key} className="task-field">
                  <div className="task-field-label">{key}</div>
                  <div className="task-field-content">
                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  </div>
                </div>
              ))}
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

export default McpToolBlock;
