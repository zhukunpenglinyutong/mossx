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
  'replace_string', 'file_edit', 'file_write', 'notebookedit',
]);

// 终端命令的工具名称集合
export const BASH_TOOL_NAMES = new Set([
  'bash', 'shell', 'terminal', 'run_terminal_cmd', 'execute_command',
  'shell_command', 'run_command', 'exec',
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

// 工具显示名称映射 (中文)
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // 读取
  read: '读取文件',
  read_file: '读取文件',
  // 编辑
  edit: '编辑文件',
  write: '写入文件',
  notebookedit: '编辑笔记本',
  // 终端
  bash: '运行命令',
  shell: '运行命令',
  terminal: '运行命令',
  shell_command: '运行命令',
  run_terminal_cmd: '运行命令',
  execute_command: '执行命令',
  // 搜索
  grep: '搜索',
  glob: '文件匹配',
  search: '搜索',
  find: '查找文件',
  // 网络
  webfetch: '网页获取',
  websearch: '网络搜索',
  // 其他
  task: '子任务',
  todowrite: '待办列表',
  diff: 'Diff对比',
  result: '结果',
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
export function extractToolName(title: string): string {
  if (!title) return '';

  // 移除 "Tool:" 或 "Command:" 前缀
  const prefixMatch = title.match(/^(?:Tool|Command):\s*(.+)$/i);
  const cleanTitle = prefixMatch ? prefixMatch[1].trim() : title.trim();

  // 如果是 MCP 工具名称，提取最后一部分
  // 例如: mcp__ace-tool__search_context -> search_context
  if (cleanTitle.includes('__')) {
    const parts = cleanTitle.split('__');
    return parts[parts.length - 1].trim();
  }

  // 如果包含斜杠，取最后一部分
  // 例如: "claude / TodoWrite" -> "TodoWrite"
  if (cleanTitle.includes('/')) {
    const parts = cleanTitle.split('/');
    return parts[parts.length - 1].trim();
  }

  return cleanTitle.toLowerCase();
}

/**
 * 检查是否为 MCP 工具
 */
export function isMcpTool(title: string): boolean {
  const name = title.toLowerCase();
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
  return EDIT_TOOL_NAMES.has(lower) || lower.includes('edit') || lower.includes('write');
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
export function getToolDisplayName(toolName: string, title?: string): string {
  const lower = toolName.toLowerCase();

  // 先查找精确匹配
  if (TOOL_DISPLAY_NAMES[lower]) {
    return TOOL_DISPLAY_NAMES[lower];
  }

  // 基于类型返回通用名称
  if (isReadTool(lower)) return '读取文件';
  if (isEditTool(lower)) return '编辑文件';
  if (isBashTool(lower)) return '运行命令';
  if (isSearchTool(lower)) return '搜索';
  if (isWebTool(lower)) return '网络请求';

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
  return parts.length ? parts[parts.length - 1] : path;
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
export function parseToolArgs(detail: string): Record<string, unknown> | null {
  if (!detail) return null;
  try {
    return JSON.parse(detail) as Record<string, unknown>;
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

/**
 * 工具分类类型
 */
export type ToolCategory = 'read' | 'edit' | 'bash' | 'search' | 'web' | 'fileChange' | 'mcp' | 'other';

/**
 * 对 tool item 进行分类，返回其所属类别。
 * 用于连续同类工具的分组逻辑。
 */
export function classifyToolCategory(item: {
  toolType: string;
  title: string;
}): ToolCategory {
  // 优先级1：toolType 分类
  if (item.toolType === 'commandExecution') return 'bash';
  if (item.toolType === 'fileChange') return 'fileChange';
  if (item.toolType === 'webSearch') return 'web';

  // 优先级2：工具名称分类
  const toolName = extractToolName(item.title);
  const lower = toolName.toLowerCase();

  if (isBashTool(lower)) return 'bash';
  if (isReadTool(lower)) return 'read';
  if (isEditTool(lower)) return 'edit';
  if (isSearchTool(lower)) return 'search';
  if (isWebTool(lower)) return 'web';

  // 优先级3：MCP 和兜底
  if (item.toolType === 'mcpToolCall' || isMcpTool(item.title)) return 'mcp';

  return 'other';
}
