/**
 * 通用工具块组件 - 用于展示各种工具调用
 * Generic Tool Block Component - for displaying various tool calls
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
type NormalizedChangeKind = 'added' | 'modified' | 'deleted' | 'renamed';

type DiffStats = {
  additions: number;
  deletions: number;
};

type DisplayChange = {
  path: string;
  normalizedKind: NormalizedChangeKind;
  kindCode: 'A' | 'M' | 'D' | 'R';
  diffStats: DiffStats;
};

interface GenericToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  activeCollaborationModeId?: string | null;
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

function normalizeChangeKind(kind?: string): NormalizedChangeKind {
  const value = (kind ?? '').toLowerCase();
  if (value.includes('add')) return 'added';
  if (value.includes('create')) return 'added';
  if (value.includes('new')) return 'added';
  if (value.includes('del')) return 'deleted';
  if (value.includes('remove')) return 'deleted';
  if (value.includes('rename')) return 'renamed';
  if (value.includes('move')) return 'renamed';
  if (value.includes('mod')) return 'modified';
  if (value.includes('update')) return 'modified';
  if (value.includes('edit')) return 'modified';
  return 'modified';
}

function changeKindCode(kind: NormalizedChangeKind): 'A' | 'M' | 'D' | 'R' {
  if (kind === 'added') return 'A';
  if (kind === 'deleted') return 'D';
  if (kind === 'renamed') return 'R';
  return 'M';
}

function collectDiffStats(diff?: string): DiffStats {
  if (!diff) {
    return { additions: 0, deletions: 0 };
  }
  let additions = 0;
  let deletions = 0;
  const lines = diff.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

function toDisplayChanges(changes: Array<{ path: string; kind?: string; diff?: string }>): DisplayChange[] {
  return changes.map((change) => {
    const normalizedKind = normalizeChangeKind(change.kind);
    return {
      path: change.path,
      normalizedKind,
      kindCode: changeKindCode(normalizedKind),
      diffStats: collectDiffStats(change.diff),
    };
  });
}

function collectChangeStats(changes: DisplayChange[]) {
  let additions = 0;
  let deletions = 0;
  let added = 0;
  let modified = 0;
  let deleted = 0;
  let renamed = 0;

  for (const change of changes) {
    const kind = change.normalizedKind;
    if (kind === 'added') added += 1;
    if (kind === 'modified') modified += 1;
    if (kind === 'deleted') deleted += 1;
    if (kind === 'renamed') renamed += 1;
    additions += change.diffStats.additions;
    deletions += change.diffStats.deletions;
  }
  return { additions, deletions, added, modified, deleted, renamed };
}

export const GenericToolBlock = memo(function GenericToolBlock({
  item,
  isExpanded: externalExpanded,
  onToggle,
  activeCollaborationModeId = null,
}: GenericToolBlockProps) {
  const { t } = useTranslation();
  const toolName = extractToolName(item.title);
  const displayName = getToolDisplayName(toolName, item.title);
  const codiconClass = getCodiconClass(toolName, item.title);
  const hasChanges = (item.changes ?? []).length > 0;
  const status = getToolStatus(item, hasChanges);
  const summary = extractSummary(item, toolName);

  const isCollapsible = isCollapsibleTool(toolName, item.title);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const isExpanded = isCollapsible ? internalExpanded : externalExpanded;

  const parsedArgs = useMemo(() => parseToolArgs(item.detail), [item.detail]);
  const displayChanges = useMemo(
    () => toDisplayChanges(item.changes ?? []),
    [item.changes],
  );
  const changeStats = useMemo(
    () => collectChangeStats(displayChanges),
    [displayChanges],
  );

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
  const showPlanModeHint =
    toolName.toLowerCase() === "askuserquestion" &&
    activeCollaborationModeId === "code";

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
          {hasChanges && (
            <span className="tool-change-summary">
              <span>{item.changes?.length ?? 0} files</span>
              <span className="diff-stat-add">+{changeStats.additions}</span>
              <span className="diff-stat-del">-{changeStats.deletions}</span>
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

      {isExpanded && item.output && !hasChanges && (
        <div className="task-details" style={{ padding: '12px', border: 'none' }}>
          <div className="task-field-content tool-output-raw-shell" style={{ maxHeight: '300px', overflowY: 'auto', overflowX: 'auto' }}>
            <div className="tool-output-toolbar">
              <button
                type="button"
                className="bash-command-copy-btn"
                onClick={async (event) => {
                  event.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(item.output ?? "");
                    setCopiedOutput(true);
                    window.setTimeout(() => setCopiedOutput(false), 1200);
                  } catch {
                    setCopiedOutput(false);
                  }
                }}
              >
                {copiedOutput ? t("messages.copied") : t("messages.copy")}
              </button>
            </div>
            <pre className="tool-output-raw-pre">{item.output}</pre>
          </div>
        </div>
      )}

      {isExpanded && hasChanges && item.changes && (
        <div className="task-details tool-change-details" style={{ border: 'none' }}>
          <div className="tool-change-metrics">
            <span>{item.changes.length} files</span>
            <span className="diff-stat-add">+{changeStats.additions}</span>
            <span className="diff-stat-del">-{changeStats.deletions}</span>
            {changeStats.added > 0 && <span className="tool-change-kind-badge added">A {changeStats.added}</span>}
            {changeStats.modified > 0 && <span className="tool-change-kind-badge modified">M {changeStats.modified}</span>}
            {changeStats.deleted > 0 && <span className="tool-change-kind-badge deleted">D {changeStats.deleted}</span>}
            {changeStats.renamed > 0 && <span className="tool-change-kind-badge renamed">R {changeStats.renamed}</span>}
          </div>
          <div className="task-content-wrapper">
            {displayChanges.map((change, index) => (
              <div key={`${change.path}-${index}`} className="tool-change-row">
                <span className={`tool-change-kind-badge ${change.normalizedKind}`}>
                  {change.kindCode}
                </span>
                <FileIcon fileName={getFileName(change.path)} size={14} />
                <span className="tool-change-file-name" title={change.path}>
                  {getFileName(change.path)}
                </span>
                <span className="tool-change-file-diff-stats">
                  <span className="diff-stat-add">+{change.diffStats.additions}</span>
                  <span className="diff-stat-del">-{change.diffStats.deletions}</span>
                </span>
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

      {showPlanModeHint && (
        <div className="task-details" style={{ border: 'none' }}>
          <div className="task-content-wrapper">
            <div className="task-field-content">This feature requires Plan mode</div>
          </div>
        </div>
      )}
    </div>
  );
});

export default GenericToolBlock;
