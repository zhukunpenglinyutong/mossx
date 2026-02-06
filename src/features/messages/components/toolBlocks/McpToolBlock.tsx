/**
 * MCP 工具块组件 - 用于展示 MCP (Model Context Protocol) 工具调用
 * MCP Tool Block Component - for displaying MCP tool calls
 */
import { memo, useMemo } from 'react';
import Wrench from 'lucide-react/dist/esm/icons/wrench';
import Search from 'lucide-react/dist/esm/icons/search';
import Database from 'lucide-react/dist/esm/icons/database';
import Globe from 'lucide-react/dist/esm/icons/globe';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import type { LucideIcon } from 'lucide-react';
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
 * 根据 MCP 工具名称猜测图标
 */
function getMcpIcon(title: string): LucideIcon {
  const lower = title.toLowerCase();

  if (lower.includes('search') || lower.includes('context') || lower.includes('query')) {
    return Search;
  }
  if (lower.includes('database') || lower.includes('sql') || lower.includes('db')) {
    return Database;
  }
  if (lower.includes('web') || lower.includes('fetch') || lower.includes('http')) {
    return Globe;
  }
  if (lower.includes('read') || lower.includes('file') || lower.includes('doc')) {
    return FileText;
  }

  return Wrench;
}

/**
 * 获取状态
 */
function getStatus(item: Extract<ConversationItem, { kind: 'tool' }>): 'completed' | 'processing' | 'failed' {
  return resolveToolStatus(item.status, Boolean(item.output));
}

export const McpToolBlock = memo(function McpToolBlock({
  item,
  isExpanded,
  onToggle,
}: McpToolBlockProps) {
  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  const displayName = formatMcpToolName(item.title);
  const Icon = getMcpIcon(item.title);
  const status = getStatus(item);

  // 提取摘要信息
  const summary = getFirstStringField(args, ['query', 'pattern', 'path', 'file_path', 'text', 'prompt']);
  const displaySummary = truncateText(summary, 50);

  // 需要省略的字段
  const omitFields = useMemo(() => new Set(['query', 'pattern', 'path', 'file_path', 'text', 'prompt']), []);

  // 过滤后的参数
  const otherParams = useMemo(() => {
    if (!args) return [];
    return Object.entries(args).filter(
      ([key, value]) => !omitFields.has(key) && value !== undefined && value !== null && value !== ''
    );
  }, [args, omitFields]);

  const hasDetails = otherParams.length > 0 || item.output;

  return (
    <div className="tool-block tool-block-mcp">
      <button
        type="button"
        className={`tool-block-header${isExpanded && hasDetails ? ' expanded' : ''}`}
        onClick={() => onToggle(item.id)}
        aria-expanded={isExpanded}
      >
        <div className="tool-block-title">
          <Icon className={`tool-block-icon ${status}`} size={16} aria-hidden />
          <span className="tool-block-name">{displayName}</span>
          {displaySummary && (
            <span className="tool-block-summary" title={summary}>
              {displaySummary}
            </span>
          )}
        </div>
        <span className={`tool-block-dot ${status}`} aria-hidden />
      </button>

      {isExpanded && hasDetails && (
        <>
          {/* 显示其他参数 */}
          {otherParams.length > 0 && (
            <div className="tool-block-details">
              <div className="tool-block-content-wrapper">
                <div className="tool-block-params">
                  {otherParams.map(([key, value]) => (
                    <div key={key} className="tool-block-param">
                      <span className="tool-block-param-key">{key}</span>
                      <span className="tool-block-param-value">
                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 显示输出 */}
          {item.output && (
            <div className="tool-block-output">
              <pre>{item.output}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default McpToolBlock;
