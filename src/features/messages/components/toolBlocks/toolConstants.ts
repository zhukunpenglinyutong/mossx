import i18n from "../../../../i18n";

/**
 * 工具类型常量和判断函数
 * Tool type constants and helper functions
 */

// 读取文件的工具名称集合
export const READ_TOOL_NAMES = new Set([
  'read', 'read_file', 'readfile', 'file_read',
]);

// 编辑文件的工具名称集合
export const EDIT_TOOL_NAMES = new Set([
  'edit', 'edit_file', 'editfile', 'write', 'write_file', 'writefile',
  'write_to_file', 'replace_string', 'file_edit', 'file_write', 'notebookedit',
  'create_file',
]);

// 终端命令的工具名称集合
export const BASH_TOOL_NAMES = new Set([
  'bash', 'shell', 'terminal', 'run_terminal_cmd', 'execute_command',
  'shell_command', 'run_command', 'exec', 'exec_command', 'write_stdin',
]);

// 搜索类工具名称集合
export const SEARCH_TOOL_NAMES = new Set([
  'grep', 'glob', 'search', 'find', 'ripgrep', 'rg',
]);

// 网络类工具名称集合
export const WEB_TOOL_NAMES = new Set([
  'webfetch', 'websearch', 'web_fetch', 'web_search', 'fetch', 'http',
]);

// 工具图标映射 (使用 Lucide 图标名称)
export const TOOL_ICON_MAP: Record<string, string> = {
  // 读取
  read: 'FileText',
  read_file: 'FileText',
  // 编辑
  edit: 'FileEdit',
  write: 'FilePlus',
  notebookedit: 'FileCode',
  // 终端
  bash: 'Terminal',
  shell: 'Terminal',
  terminal: 'Terminal',
  // 搜索
  grep: 'Search',
  glob: 'FolderSearch',
  search: 'Search',
  find: 'FolderSearch',
  // 网络
  webfetch: 'Globe',
  websearch: 'Globe',
  // 其他
  task: 'ListTodo',
  todowrite: 'ListChecks',
  diff: 'Diff',
};

// 工具显示名称映射 - 工厂函数，接受 t 翻译函数
export function getToolDisplayNames(t: (key: string) => string): Record<string, string> {
  return {
    // 读取
    read: t("tools.readFile"),
    read_file: t("tools.readFile"),
    // 编辑
    edit: t("tools.editFile"),
    write: t("tools.writeFile"),
    notebookedit: t("tools.editNotebook"),
    // 终端
    bash: t("tools.runCommand"),
    shell: t("tools.runCommand"),
    terminal: t("tools.runCommand"),
    shell_command: t("tools.runCommand"),
    run_terminal_cmd: t("tools.runCommand"),
    execute_command: t("tools.executeCommand"),
    // 搜索
    grep: t("tools.search"),
    glob: t("tools.fileMatch"),
    search: t("tools.search"),
    find: t("tools.findFile"),
    // 网络
    webfetch: t("tools.webFetch"),
    websearch: t("tools.webSearch"),
    // 其他
    task: t("tools.subtask"),
    todowrite: t("tools.todoList"),
    askuserquestion: t("tools.userInputRequest"),
    diff: t("tools.diffCompare"),
    result: t("tools.result"),
    claudecontrolevent: t("tools.claudeControlLocalOutput"),
  };
}

// 静态 key 回退映射，当没有组件级 t 函数时走全局 i18n
const TOOL_DISPLAY_NAMES_FALLBACK: Record<string, string> = {
  read: 'tools.readFile',
  read_file: 'tools.readFile',
  edit: 'tools.editFile',
  write: 'tools.writeFile',
  notebookedit: 'tools.editNotebook',
  bash: 'tools.runCommand',
  shell: 'tools.runCommand',
  terminal: 'tools.runCommand',
  shell_command: 'tools.runCommand',
  run_terminal_cmd: 'tools.runCommand',
  execute_command: 'tools.executeCommand',
  grep: 'tools.search',
  glob: 'tools.fileMatch',
  search: 'tools.search',
  find: 'tools.findFile',
  webfetch: 'tools.webFetch',
  websearch: 'tools.webSearch',
  task: 'tools.subtask',
  todowrite: 'tools.todoList',
  askuserquestion: 'tools.userInputRequest',
  diff: 'tools.diffCompare',
  result: 'tools.result',
  claudecontrolevent: 'tools.claudeControlLocalOutput',
};

const FAILED_TOOL_STATUS_REGEX = /(fail|error|cancel(?:led)?|abort|timeout|timed[_ -]?out)/;
const COMPLETED_TOOL_STATUS_REGEX =
  /(complete|completed|success|succeed(?:ed)?|done|finish(?:ed)?)/;
const PROCESSING_TOOL_STATUS_REGEX =
  /(pending|running|processing|started|in[_ -]?progress|inprogress|queued)/;

export type ToolStatusTone = 'completed' | 'processing' | 'failed';

/**
 * 统一工具状态映射。
 * - 先识别失败
 * - 再识别完成（即使没有 output）
 * - 最后识别进行中
 * - 没有状态时，按是否有输出兜底
 */
export function resolveToolStatus(
  status: string | undefined,
  hasOutput: boolean,
): ToolStatusTone {
  const normalized = (status ?? '').toLowerCase();

  if (FAILED_TOOL_STATUS_REGEX.test(normalized)) {
    return 'failed';
  }
  if (COMPLETED_TOOL_STATUS_REGEX.test(normalized)) {
    return 'completed';
  }
  if (PROCESSING_TOOL_STATUS_REGEX.test(normalized)) {
    return 'processing';
  }
  return hasOutput ? 'completed' : 'processing';
}

/**
 * 从工具标题中提取工具名称
 * Extract tool name from title like "Tool: read" or "Tool: mcp__xxx__yyy"
 */
function normalizeRuntimeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function extractToolName(title: unknown): string {
  const normalizedTitle = normalizeRuntimeString(title);
  if (!normalizedTitle) return '';

  // 移除 "Tool:" 或 "Command:" 前缀
  const prefixMatch = normalizedTitle.match(/^(?:Tool|Command):\s*(.+)$/i);
  const cleanTitle = prefixMatch
    ? (prefixMatch[1] ?? normalizedTitle).trim()
    : normalizedTitle.trim();

  // 如果是 MCP 工具名称，提取最后一部分
  // 例如: mcp__ace-tool__search_context -> search_context
  if (cleanTitle.includes('__')) {
    const parts = cleanTitle.split('__');
    return (parts[parts.length - 1] ?? cleanTitle).trim();
  }

  // 如果包含斜杠，取最后一部分
  // 例如: "claude / TodoWrite" -> "TodoWrite"
  if (cleanTitle.includes('/')) {
    const parts = cleanTitle.split('/');
    return (parts[parts.length - 1] ?? cleanTitle).trim();
  }

  return cleanTitle.toLowerCase();
}

/**
 * 检查是否为 MCP 工具
 */
export function isMcpTool(title: unknown): boolean {
  const name = normalizeRuntimeString(title).toLowerCase();
  return name.includes('mcp__') || name.includes('mcp_');
}

/**
 * 检查是否为读取文件工具
 */
export function isReadTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return READ_TOOL_NAMES.has(lower) || lower.includes('read');
}

/**
 * 检查是否为编辑文件工具
 */
export function isEditTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  if (EDIT_TOOL_NAMES.has(lower)) return true;
  // Exclude known false positives like TodoWrite
  if (lower === 'todowrite' || lower === 'todo_write') return false;
  return lower.includes('edit') || lower.includes('write');
}

/**
 * 检查是否为终端命令工具
 */
export function isBashTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return BASH_TOOL_NAMES.has(lower) || lower.includes('bash') || lower.includes('shell') || lower.includes('terminal');
}

/**
 * 检查是否为搜索工具
 */
export function isSearchTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return SEARCH_TOOL_NAMES.has(lower) || lower.includes('grep') || lower.includes('glob') || lower.includes('search');
}

/**
 * 检查是否为网络工具
 */
export function isWebTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return WEB_TOOL_NAMES.has(lower) || lower.includes('web') || lower.includes('fetch');
}

/**
 * 获取工具的显示名称
 */
export function getToolDisplayName(toolName: string, title?: string, t?: (key: string) => string): string {
  const lower = toolName.toLowerCase();

  // 当 t 函数存在时使用翻译
  if (t) {
    const translatedNames = getToolDisplayNames(t);
    if (translatedNames[lower]) {
      return translatedNames[lower];
    }
  } else {
    const fallbackKey = TOOL_DISPLAY_NAMES_FALLBACK[lower];
    if (fallbackKey) {
      return i18n.t(fallbackKey);
    }
  }

  // 基于类型返回通用名称
  if (t) {
    if (isReadTool(lower)) return t("tools.readFile");
    if (isEditTool(lower)) return t("tools.editFile");
    if (isBashTool(lower)) return t("tools.runCommand");
    if (isSearchTool(lower)) return t("tools.search");
    if (isWebTool(lower)) return t("tools.webRequest");
  } else {
    if (isReadTool(lower)) return i18n.t("tools.readFile");
    if (isEditTool(lower)) return i18n.t("tools.editFile");
    if (isBashTool(lower)) return i18n.t("tools.runCommand");
    if (isSearchTool(lower)) return i18n.t("tools.search");
    if (isWebTool(lower)) return i18n.t("tools.webRequest");
  }

  // MCP 工具特殊处理
  if (title && isMcpTool(title)) {
    // 格式化 MCP 工具名称
    // mcp__ace-tool__search_context -> Mcp Ace-tool Search Context
    const parts = title.replace(/^Tool:\s*/i, '').split('__');
    return parts
      .map(part =>
        part.split(/[-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
      )
      .join(' ');
  }

  // snake_case 转 Title Case
  if (toolName.includes('_')) {
    return toolName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // CamelCase 转 Title Case
  if (/^[A-Z]/.test(toolName)) {
    return toolName.replace(/([A-Z])/g, ' $1').trim();
  }

  return toolName.charAt(0).toUpperCase() + toolName.slice(1);
}

/**
 * 从文件路径中提取文件名
 */
export function getFileName(path?: string): string {
  if (!path) return '';
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length ? (parts[parts.length - 1] ?? path) : path;
}

/**
 * 截断长文本
 */
export function truncateText(text: string, maxLength: number = 60): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * 解析工具参数 JSON
 */
export function parseToolArgs(detail: unknown): Record<string, unknown> | null {
  const normalizedDetail = normalizeRuntimeString(detail);
  if (!normalizedDetail) return null;
  try {
    return JSON.parse(normalizedDetail) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * 从参数中获取第一个匹配的字符串字段
 */
export function getFirstStringField(
  source: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function normalizeCommandValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return '';
  }
  const parts = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.join(' ').trim();
}

export function getFirstCommandField(
  source: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    const normalized = normalizeCommandValue(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

export const EDIT_PATH_KEYS = [
  'file_path',
  'filePath',
  'filepath',
  'path',
  'target_file',
  'targetFile',
  'filename',
  'file',
];
export const EDIT_OLD_KEYS = ['old_string', 'oldString'];
export const EDIT_NEW_KEYS = ['new_string', 'newString'];
export const EDIT_CONTENT_KEYS = ['content', 'new_content', 'newContent'];

export function pickStringField(
  source: Record<string, unknown> | null,
  nestedInput: Record<string, unknown> | null,
  nestedArgs: Record<string, unknown> | null,
  keys: string[],
): string {
  return (
    getFirstStringField(source, keys) ||
    getFirstStringField(nestedInput, keys) ||
    getFirstStringField(nestedArgs, keys)
  );
}

export function extractCommandFromTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    return '';
  }
  const match = trimmed.match(/^Command:\s*(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

export function looksLikePathOnlyValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    /^[A-Za-z]:[\\/]/.test(trimmed)
  );
}

type BuildCommandSummaryOptions = {
  includeDetail?: boolean;
  ignorePathOnlyDetail?: boolean;
};

export function buildCommandSummary(
  item: {
    title?: unknown;
    detail?: unknown;
    toolType?: unknown;
  },
  options: BuildCommandSummaryOptions = {},
): string {
  const { includeDetail = true, ignorePathOnlyDetail = true } = options;
  const toolType = normalizeRuntimeString(item.toolType);
  if (toolType && toolType !== 'commandExecution') {
    return '';
  }

  const detail = normalizeRuntimeString(item.detail);
  const detailArgs = parseToolArgs(detail);
  const nestedInput = asRecord(detailArgs?.input);
  const nestedArgs = asRecord(detailArgs?.arguments);
  const titleCommand = extractCommandFromTitle(normalizeRuntimeString(item.title));
  const commandKeys = [
    'command',
    'cmd',
    'script',
    'shell_command',
    'bash',
    'argv',
  ];
  const argsCommand =
    getFirstCommandField(detailArgs, commandKeys) ||
    getFirstCommandField(nestedInput, commandKeys) ||
    getFirstCommandField(nestedArgs, commandKeys);
  const detailCommand = includeDetail
    ? (ignorePathOnlyDetail && looksLikePathOnlyValue(detail) ? '' : detail.trim())
    : '';

  const parts = [titleCommand, argsCommand, detailCommand]
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part, index, array) => array.indexOf(part) === index);

  return parts.join(' · ');
}

/**
 * 工具分类类型
 */
export type ToolCategory = 'read' | 'edit' | 'bash' | 'search' | 'web' | 'fileChange' | 'mcp' | 'other';

/**
 * 对 tool item 进行分类，返回其所属类别。
 * 用于连续同类工具的分组逻辑。
 */
export function classifyToolCategory(item: {
  toolType: unknown;
  title: unknown;
}): ToolCategory {
  const toolType = normalizeRuntimeString(item.toolType);
  // 优先级1：toolType 分类
  if (toolType === 'commandExecution') return 'bash';
  if (toolType === 'fileChange') return 'fileChange';
  if (toolType === 'webSearch') return 'web';

  // 优先级2：工具名称分类
  const toolName = extractToolName(item.title);
  const lower = toolName.toLowerCase();

  if (isBashTool(lower)) return 'bash';
  if (isReadTool(lower)) return 'read';
  if (isEditTool(lower)) return 'edit';
  if (isSearchTool(lower)) return 'search';
  if (isWebTool(lower)) return 'web';

  // 优先级3：MCP 和兜底
  if (toolType === 'mcpToolCall' || isMcpTool(item.title)) return 'mcp';

  return 'other';
}
