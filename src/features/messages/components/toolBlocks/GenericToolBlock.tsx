/**
 * 通用工具块组件 - 用于展示各种工具调用
 * Generic Tool Block Component - for displaying various tool calls
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useState } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  extractToolName,
  getToolDisplayName,
  getFileName,
  truncateText,
  parseToolArgs,
  getFirstStringField,
  isMcpTool,
  isReadTool,
  isEditTool,
  isBashTool,
  isSearchTool,
  isWebTool,
  resolveToolStatus,
} from './toolConstants';
import { FileIcon } from './FileIcon';

type StatusTone = 'completed' | 'processing' | 'failed' | 'pending';

interface GenericToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

// codicon 图标映射（匹配参考项目）
const CODICON_MAP: Record<string, string> = {
  read: 'codicon-eye',
  read_file: 'codicon-eye',
  edit: 'codicon-edit',
  edit_file: 'codicon-edit',
  write: 'codicon-pencil',
  write_to_file: 'codicon-pencil',
  save: 'codicon-pencil',
  'save-file': 'codicon-pencil',
  bash: 'codicon-terminal',
  run_terminal_cmd: 'codicon-terminal',
  execute_command: 'codicon-terminal',
  executecommand: 'codicon-terminal',
  shell_command: 'codicon-terminal',
  grep: 'codicon-search',
  glob: 'codicon-folder',
  search: 'codicon-search',
  find: 'codicon-folder',
  task: 'codicon-tools',
  todowrite: 'codicon-checklist',
  todo_write: 'codicon-checklist',
  webfetch: 'codicon-globe',
  websearch: 'codicon-search',
  delete: 'codicon-trash',
  skill: 'codicon-zap',
  useskill: 'codicon-zap',
  runskill: 'codicon-zap',
  run_skill: 'codicon-zap',
  execute_skill: 'codicon-zap',
  diff: 'codicon-diff',
  update_plan: 'codicon-checklist',
  exitplanmode: 'codicon-check-all',
  askuserquestion: 'codicon-comment-discussion',
  notebookedit: 'codicon-notebook',
};

// 可折叠的工具列表（参考 idea-claude-code-gui）
const COLLAPSIBLE_TOOLS = new Set([
  'grep', 'glob', 'write', 'save-file', 'askuserquestion',
  'update_plan', 'shell_command', 'exitplanmode',
  'webfetch', 'websearch', 'skill', 'useskill', 'runskill',
  'run_skill', 'execute_skill', 'task', 'todowrite',
]);

// 特殊文件名（没有扩展名但确实是文件）
const SPECIAL_FILES = new Set([
  'makefile', 'dockerfile', 'jenkinsfile', 'vagrantfile',
  'gemfile', 'rakefile', 'procfile', 'guardfile',
  'license', 'licence', 'readme', 'changelog',
  'gradlew', 'cname', 'authors', 'contributors',
]);

/**
 * 检查是否为目录路径
 */
function isDirectoryPath(filePath: string, fileName: string): boolean {
  const cleanFileName = fileName.replace(/:\d+(-\d+)?$/, '');
  return (
    filePath.endsWith('/') ||
    filePath === '.' ||
    filePath === '..' ||
    (!cleanFileName.includes('.') && !SPECIAL_FILES.has(cleanFileName.toLowerCase()))
  );
}

/**
 * 根据工具名称获取 codicon 图标类名
 */
function getCodiconClass(toolName: string, title: string): string {
  const lower = toolName.toLowerCase();

  // 直接映射
  if (CODICON_MAP[lower]) return CODICON_MAP[lower];

  // 分类匹配
  if (isReadTool(lower)) return 'codicon-eye';
  if (isEditTool(lower)) return 'codicon-edit';
  if (isBashTool(lower)) return 'codicon-terminal';
  if (lower.includes('grep')) return 'codicon-search';
  if (lower.includes('glob') || lower.includes('find')) return 'codicon-folder';
  if (isSearchTool(lower)) return 'codicon-search';
  if (isWebTool(lower)) return 'codicon-globe';
  if (lower.includes('skill')) return 'codicon-zap';
  if (lower.includes('diff')) return 'codicon-diff';

  // MCP 工具根据名称猜测
  if (isMcpTool(title)) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('search') || lowerTitle.includes('context')) return 'codicon-search';
    if (lowerTitle.includes('read') || lowerTitle.includes('file')) return 'codicon-eye';
    if (lowerTitle.includes('database') || lowerTitle.includes('sql')) return 'codicon-database';
    if (lowerTitle.includes('web') || lowerTitle.includes('fetch')) return 'codicon-globe';
  }

  return 'codicon-tools';
}

/**
 * 获取工具状态
 */
function getToolStatus(
  item: Extract<ConversationItem, { kind: 'tool' }>,
  hasChanges: boolean,
): StatusTone {
  const resolved = resolveToolStatus(item.status, Boolean(item.output) || hasChanges);
  return resolved === 'processing' ? 'pending' : resolved;
}

/**
 * 检查工具是否应该可折叠
 */
function isCollapsibleTool(toolName: string, title: string): boolean {
  const lower = toolName.toLowerCase();
  return COLLAPSIBLE_TOOLS.has(lower) || isMcpTool(title);
}

/**
 * 提取工具摘要信息
 */
function extractSummary(
  item: Extract<ConversationItem, { kind: 'tool' }>,
  toolName: string,
): string {
  const args = parseToolArgs(item.detail);
  const lower = toolName.toLowerCase();

  if (isReadTool(lower)) {
    const filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
    return filePath ? getFileName(filePath) : '';
  }

  if (isEditTool(lower)) {
    const filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
    return filePath ? getFileName(filePath) : '';
  }

  if (isSearchTool(lower)) {
    const query = getFirstStringField(args, ['pattern', 'query', 'search_term', 'text']);
    return query ? truncateText(query, 50) : '';
  }

  if (isBashTool(lower)) {
    const command = getFirstStringField(args, ['command', 'cmd']);
    return command ? truncateText(command, 60) : '';
  }

  if (isWebTool(lower)) {
    const url = getFirstStringField(args, ['url', 'query']);
    return url ? truncateText(url, 50) : '';
  }

  if (isMcpTool(item.title)) {
    const query = getFirstStringField(args, ['query', 'pattern', 'path', 'file_path']);
    return query ? truncateText(query, 50) : '';
  }

  if (args) {
    for (const key of ['query', 'pattern', 'path', 'file_path', 'command', 'text']) {
      const value = args[key];
      if (typeof value === 'string' && value.trim()) {
        return truncateText(value.trim(), 50);
      }
    }
  }

  return '';
}

export const GenericToolBlock = memo(function GenericToolBlock({
  item,
  isExpanded: externalExpanded,
  onToggle,
}: GenericToolBlockProps) {
  const toolName = extractToolName(item.title);
  const displayName = getToolDisplayName(toolName, item.title);
  const codiconClass = getCodiconClass(toolName, item.title);
  const hasChanges = (item.changes ?? []).length > 0;
  const status = getToolStatus(item, hasChanges);
  const summary = extractSummary(item, toolName);

  const isCollapsible = isCollapsibleTool(toolName, item.title);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isCollapsible ? internalExpanded : externalExpanded;

  const parsedArgs = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  const filePath = useMemo(() => {
    if (!parsedArgs) return null;
    const path = getFirstStringField(parsedArgs, ['file_path', 'path', 'target_file', 'filename', 'notebook_path']);
    return path || null;
  }, [parsedArgs]);

  const fileName = filePath ? getFileName(filePath) : '';
  const isDirectory = filePath ? isDirectoryPath(filePath, fileName) : false;
  const isFile = filePath && !isDirectory;

  const omitFields = useMemo(() => new Set([
    'file_path', 'path', 'target_file', 'filename', 'notebook_path',
    'pattern', 'query', 'search_term',
    'command', 'cmd',
    'url',
    'description', 'workdir',
  ]), []);

  const otherParams = useMemo(() => {
    if (!parsedArgs) return [];
    return Object.entries(parsedArgs).filter(
      ([key, value]) => !omitFields.has(key) && value !== undefined && value !== null && value !== ''
    );
  }, [parsedArgs, omitFields]);

  const shouldShowDetails = otherParams.length > 0 && isExpanded;

  const handleClick = () => {
    if (isCollapsible) {
      setInternalExpanded(prev => !prev);
    } else {
      onToggle(item.id);
    }
  };

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={handleClick}
        style={{
          cursor: isCollapsible || otherParams.length > 0 || item.output || hasChanges ? 'pointer' : 'default',
          borderBottom: isExpanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className={`codicon ${codiconClass} tool-title-icon`} />
          <span className="tool-title-text">{displayName}</span>
          {summary && (
            <span
              className="tool-title-summary"
              title={summary}
              style={(isFile || isDirectory) ? { display: 'inline-flex', alignItems: 'center', gap: '4px' } : undefined}
            >
              {(isFile || isDirectory) && (
                <FileIcon fileName={isDirectory ? fileName + '/' : fileName} size={14} />
              )}
              {summary}
            </span>
          )}
        </div>
        <div className={`tool-status-indicator ${status === 'failed' ? 'error' : status === 'completed' ? 'completed' : 'pending'}`} />
      </div>

      {shouldShowDetails && (
        <div className="task-details" style={{ border: 'none' }}>
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
        </div>
      )}

      {isExpanded && item.output && (
        <div className="task-details" style={{ padding: '12px', border: 'none' }}>
          <div className="task-field-content" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{item.output}</pre>
          </div>
        </div>
      )}

      {isExpanded && hasChanges && item.changes && (
        <div className="task-details" style={{ border: 'none' }}>
          <div className="task-content-wrapper">
            {item.changes.map((change, index) => (
              <div key={`${change.path}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
                {change.kind && (
                  <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{change.kind}</span>
                )}
                <FileIcon fileName={getFileName(change.path)} size={14} />
                <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{getFileName(change.path)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isExpanded && !shouldShowDetails && !item.output && !hasChanges && item.detail && (
        <div className="task-details" style={{ padding: '12px', border: 'none' }}>
          <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{item.detail}</pre>
        </div>
      )}
    </div>
  );
});

export default GenericToolBlock;
