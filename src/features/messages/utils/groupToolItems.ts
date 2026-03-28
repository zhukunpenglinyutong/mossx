/**
 * 工具项分组逻辑
 * Groups consecutive same-category tool items into batch entries
 */
import type { ConversationItem } from '../../../types';
import {
  classifyToolCategory,
  extractToolName,
} from '../components/toolBlocks/toolConstants';

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;
type ExploreItem = Extract<ConversationItem, { kind: 'explore' }>;

export type GroupedEntry =
  | { kind: 'item'; item: ConversationItem }
  | { kind: 'readGroup'; items: ToolItem[] }
  | { kind: 'editGroup'; items: ToolItem[] }
  | { kind: 'bashGroup'; items: ToolItem[] }
  | { kind: 'searchGroup'; items: ToolItem[] };

/**
 * 合并连续 explore items
 */
function mergeExploreItems(items: ExploreItem[]): ExploreItem {
  const first = items[0];
  const last = items[items.length - 1];
  return {
    id: first.id,
    kind: 'explore',
    status: last?.status ?? 'explored',
    title: last?.title ?? first.title,
    collapsible: first.collapsible ?? last?.collapsible,
    mergeKey: first.mergeKey ?? last?.mergeKey,
    entries: items.flatMap((item) => item.entries),
  };
}

function canMergeExploreItems(previous: ExploreItem, next: ExploreItem): boolean {
  const previousKey = previous.mergeKey ?? "default";
  const nextKey = next.mergeKey ?? "default";
  return previousKey === nextKey;
}

/**
 * 将分类映射到 GroupedEntry 的 kind
 */
type GroupableCategory = 'read' | 'edit' | 'bash' | 'search';

const CATEGORY_TO_GROUP_KIND: Record<GroupableCategory, GroupedEntry['kind']> = {
  read: 'readGroup',
  edit: 'editGroup',
  bash: 'bashGroup',
  search: 'searchGroup',
};

function isGroupableCategory(cat: string): cat is GroupableCategory {
  return cat in CATEGORY_TO_GROUP_KIND;
}

export function shouldHideToolItemForRender(item: ToolItem): boolean {
  const toolName = extractToolName(item.title).toLowerCase();
  return toolName === 'todowrite' || toolName === 'todo_write';
}

function shouldUngroupSearchTools(item: ToolItem): boolean {
  if (item.toolType !== 'mcpToolCall') {
    return false;
  }
  const toolName = extractToolName(item.title).toLowerCase();
  return toolName === 'search_query';
}

/**
 * 对 ConversationItem[] 进行分组，连续 2+ 个同类工具合并为 group entry。
 * 保留 explore 合并逻辑。
 */
export function groupToolItems(items: ConversationItem[]): GroupedEntry[] {
  const entries: GroupedEntry[] = [];

  let exploreBuffer: ExploreItem[] = [];
  let toolBuffer: ToolItem[] = [];
  let currentCategory = '';

  const flushExplores = () => {
    if (exploreBuffer.length === 0) return;
    if (exploreBuffer.length === 1) {
      entries.push({ kind: 'item', item: exploreBuffer[0] });
    } else {
      entries.push({ kind: 'item', item: mergeExploreItems(exploreBuffer) });
    }
    exploreBuffer = [];
  };

  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    const hasUngroupedSearchTool =
      currentCategory === 'search' && toolBuffer.some(shouldUngroupSearchTools);
    // Keep only codex mcp search_query tools line-by-line so each search record can expand.
    if (
      toolBuffer.length >= 2 &&
      isGroupableCategory(currentCategory) &&
      !hasUngroupedSearchTool
    ) {
      entries.push({
        kind: CATEGORY_TO_GROUP_KIND[currentCategory],
        items: toolBuffer,
      } as GroupedEntry);
    } else {
      for (const item of toolBuffer) {
        entries.push({ kind: 'item', item });
      }
    }
    toolBuffer = [];
    currentCategory = '';
  };

  for (const item of items) {
    if (item.kind === 'explore') {
      flushTools();
      const lastExplore = exploreBuffer[exploreBuffer.length - 1];
      if (lastExplore && !canMergeExploreItems(lastExplore, item)) {
        flushExplores();
      }
      exploreBuffer.push(item);
      continue;
    }

    flushExplores();

    if (item.kind === 'tool') {
      if (shouldHideToolItemForRender(item)) {
        flushTools();
        continue;
      }
      const cat = classifyToolCategory(item);
      if (toolBuffer.length > 0 && cat === currentCategory) {
        toolBuffer.push(item);
      } else {
        flushTools();
        toolBuffer = [item];
        currentCategory = cat;
      }
      continue;
    }

    // 非 tool/explore item
    flushTools();
    entries.push({ kind: 'item', item });
  }

  flushExplores();
  flushTools();

  return entries;
}
