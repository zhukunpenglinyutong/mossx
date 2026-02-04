/**
 * 工具块分发器 - 根据工具类型选择合适的组件展示
 * Tool Block Renderer - selects appropriate component based on tool type
 */
import { memo } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  extractToolName,
  isMcpTool,
  isReadTool,
  isBashTool,
  isSearchTool,
} from './toolConstants';
import { GenericToolBlock } from './GenericToolBlock';
import { ReadToolBlock } from './ReadToolBlock';
import { BashToolBlock } from './BashToolBlock';
import { SearchToolBlock } from './SearchToolBlock';
import { McpToolBlock } from './McpToolBlock';

interface ToolBlockRendererProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onRequestAutoScroll?: () => void;
}

/**
 * 工具块分发器组件
 * 根据工具类型分发到对应的专用组件
 */
export const ToolBlockRenderer = memo(function ToolBlockRenderer({
  item,
  isExpanded,
  onToggle,
  onRequestAutoScroll,
}: ToolBlockRendererProps) {
  const toolName = extractToolName(item.title);
  const lower = toolName.toLowerCase();

  // 根据 toolType 或工具名称选择组件

  // 1. 命令执行工具
  if (item.toolType === 'commandExecution' || isBashTool(lower)) {
    return (
      <BashToolBlock
        item={item}
        isExpanded={isExpanded}
        onToggle={onToggle}
        onRequestAutoScroll={onRequestAutoScroll}
      />
    );
  }

  // 2. 读取文件工具
  if (isReadTool(lower)) {
    return (
      <ReadToolBlock
        item={item}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
    );
  }

  // 3. 搜索工具 (grep, glob, search)
  if (isSearchTool(lower)) {
    return (
      <SearchToolBlock
        item={item}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
    );
  }

  // 4. MCP 工具
  if (item.toolType === 'mcpToolCall' || isMcpTool(item.title)) {
    return (
      <McpToolBlock
        item={item}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
    );
  }

  // 5. 其他工具使用通用组件
  return (
    <GenericToolBlock
      item={item}
      isExpanded={isExpanded}
      onToggle={onToggle}
    />
  );
});

export default ToolBlockRenderer;
