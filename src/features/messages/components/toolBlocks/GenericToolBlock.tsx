/**
 * 通用工具块组件 - 用于展示各种工具调用
 * Generic Tool Block Component - for displaying various tool calls
 * 参考: idea-claude-code-gui 项目风格
 */
import { memo, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import Wrench from 'lucide-react/dist/esm/icons/wrench';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import FileEdit from 'lucide-react/dist/esm/icons/file-edit';
import Terminal from 'lucide-react/dist/esm/icons/terminal';
import Search from 'lucide-react/dist/esm/icons/search';
import FolderSearch from 'lucide-react/dist/esm/icons/folder-search';
import Globe from 'lucide-react/dist/esm/icons/globe';
import ListTodo from 'lucide-react/dist/esm/icons/list-todo';
import Diff from 'lucide-react/dist/esm/icons/diff';
import ListChecks from 'lucide-react/dist/esm/icons/list-checks';
import Zap from 'lucide-react/dist/esm/icons/zap';
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
 * 根据工具名称获取对应的图标
 */
function getToolIcon(toolName: string, title: string): LucideIcon {
  const lower = toolName.toLowerCase();

  if (isReadTool(lower)) return FileText;
  if (isEditTool(lower)) return FileEdit;
  if (isBashTool(lower)) return Terminal;
  if (lower.includes('grep')) return Search;
  if (lower.includes('glob') || lower.includes('find')) return FolderSearch;
  if (isSearchTool(lower)) return Search;
  if (isWebTool(lower)) return Globe;
  if (lower === 'todowrite' || lower === 'todo_write') return ListChecks;
  if (lower === 'task') return ListTodo;
  if (lower.includes('skill')) return Zap;
  if (lower.includes('diff')) return Diff;

  // MCP 工具根据名称猜测
  if (isMcpTool(title)) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('search') || lowerTitle.includes('context')) {
      return Search;
    }
    if (lowerTitle.includes('read') || lowerTitle.includes('file')) {
      return FileText;
    }
  }

  return Wrench;
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

  // 读取文件：显示文件名
  if (isReadTool(lower)) {
    const filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
    return filePath ? getFileName(filePath) : '';
  }

  // 编辑文件：显示文件名
  if (isEditTool(lower)) {
    const filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
    return filePath ? getFileName(filePath) : '';
  }

  // 搜索：显示搜索词
  if (isSearchTool(lower)) {
    const query = getFirstStringField(args, ['pattern', 'query', 'search_term', 'text']);
    return query ? truncateText(query, 50) : '';
  }

  // 终端命令：显示命令
  if (isBashTool(lower)) {
    const command = getFirstStringField(args, ['command', 'cmd']);
    return command ? truncateText(command, 60) : '';
  }

  // 网络请求：显示 URL 或查询
  if (isWebTool(lower)) {
    const url = getFirstStringField(args, ['url', 'query']);
    return url ? truncateText(url, 50) : '';
  }

  // MCP 工具：尝试提取查询或路径
  if (isMcpTool(item.title)) {
    const query = getFirstStringField(args, ['query', 'pattern', 'path', 'file_path']);
    return query ? truncateText(query, 50) : '';
  }

  // 默认：尝试提取第一个有意义的字段
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
  const Icon = getToolIcon(toolName, item.title);
  const hasChanges = (item.changes ?? []).length > 0;
  const status = getToolStatus(item, hasChanges);
  const summary = extractSummary(item, toolName);

  // 判断是否为可折叠工具
  const isCollapsible = isCollapsibleTool(toolName, item.title);

  // 内部展开状态（用于可折叠工具）
  const [internalExpanded, setInternalExpanded] = useState(false);

  // 实际的展开状态
  const isExpanded = isCollapsible ? internalExpanded : externalExpanded;

  // 解析详情用于展开显示
  const parsedArgs = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  // 提取文件路径用于显示文件图标
  const filePath = useMemo(() => {
    if (!parsedArgs) return null;
    const path = getFirstStringField(parsedArgs, ['file_path', 'path', 'target_file', 'filename', 'notebook_path']);
    return path || null;
  }, [parsedArgs]);

  // 检查是否为文件或目录
  const fileName = filePath ? getFileName(filePath) : '';
  const isDirectory = filePath ? isDirectoryPath(filePath, fileName) : false;
  const isFile = filePath && !isDirectory;

  // 需要省略的字段（已在摘要中显示或不需要展示）
  const omitFields = useMemo(() => new Set([
    'file_path', 'path', 'target_file', 'filename', 'notebook_path',
    'pattern', 'query', 'search_term',
    'command', 'cmd',
    'url',
    'description', 'workdir', // Codex 相关字段
  ]), []);

  // 过滤后的参数
  const otherParams = useMemo(() => {
    if (!parsedArgs) return [];
    return Object.entries(parsedArgs).filter(
      ([key, value]) => !omitFields.has(key) && value !== undefined && value !== null && value !== ''
    );
  }, [parsedArgs, omitFields]);

  // 是否应该显示详情
  const shouldShowDetails = otherParams.length > 0 && isExpanded;

  // 点击处理
  const handleClick = () => {
    if (isCollapsible) {
      setInternalExpanded(prev => !prev);
    } else {
      onToggle(item.id);
    }
  };

  return (
    <div className="tool-block">
      <button
        type="button"
        className={`tool-block-header${isExpanded ? ' expanded' : ''}`}
        onClick={handleClick}
        aria-expanded={isExpanded}
        style={{ cursor: isCollapsible || otherParams.length > 0 || item.output || hasChanges ? 'pointer' : 'default' }}
      >
        <div className="tool-block-title">
          <Icon className={`tool-block-icon ${status}`} size={16} aria-hidden />
          <span className="tool-block-name">{displayName}</span>
          {summary && (
            <span
              className="tool-block-summary"
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
        <span className={`tool-block-dot ${status}`} aria-hidden />
      </button>

      {shouldShowDetails && (
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
      {isExpanded && item.output && (
        <div className="tool-block-output">
          <pre>{item.output}</pre>
        </div>
      )}

      {/* 显示文件变更 */}
      {isExpanded && hasChanges && item.changes && (
        <div className="tool-block-details">
          <div className="tool-block-content-wrapper">
            <div className="tool-block-changes">
              {item.changes.map((change, index) => (
                <div key={`${change.path}-${index}`} className="tool-block-change">
                  <div className="tool-block-change-header">
                    {change.kind && (
                      <span className="tool-block-change-kind">{change.kind.toUpperCase()}</span>
                    )}
                    <FileIcon fileName={getFileName(change.path)} size={14} />
                    <span className="tool-block-change-path">{getFileName(change.path)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 显示原始详情（当没有其他可显示内容时） */}
      {isExpanded && !shouldShowDetails && !item.output && !hasChanges && item.detail && (
        <div className="tool-block-details">
          <div className="tool-block-content-wrapper">
            <pre className="tool-block-raw-detail">{item.detail}</pre>
          </div>
        </div>
      )}
    </div>
  );
});

export default GenericToolBlock;
