/**
 * 批量编辑文件分组组件
 * Groups multiple consecutive Edit/Write/FileChange tool calls into a collapsible file list with diff stats
 */
import { memo, useMemo, useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationItem, TurnPlan } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  getFileName,
  resolveToolStatus,
  type ToolStatusTone,
} from './toolConstants';
import { FileIcon } from './FileIcon';

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

interface EditToolGroupBlockProps {
  items: ToolItem[];
  plan?: TurnPlan | null;
  isProcessing?: boolean;
  isPlanMode?: boolean;
  onOpenFullPlan?: () => void;
  onOpenDiffPath?: (path: string) => void;
}

interface DiffStats {
  additions: number;
  deletions: number;
}

interface ParsedEditItem {
  id: string;
  fileName: string;
  filePath: string;
  diff: DiffStats;
  status: ToolStatusTone;
}

const MAX_VISIBLE_ITEMS = 3;
const ITEM_HEIGHT = 32;

/**
 * 从 old_string / new_string 计算简单 diff 统计
 */
function computeDiffStats(oldStr: string, newStr: string): DiffStats {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');
  const oldCount = oldLines.length;
  const newCount = newLines.length;

  if (oldCount === 0 && newCount === 0) return { additions: 0, deletions: 0 };
  if (oldCount === 0) return { additions: newCount, deletions: 0 };
  if (newCount === 0) return { additions: 0, deletions: oldCount };

  // 简化计算：行数差异
  const diff = newCount - oldCount;
  if (diff >= 0) {
    return { additions: diff || 1, deletions: 0 };
  }
  return { additions: 0, deletions: -diff };
}

function parseEditItem(item: ToolItem): ParsedEditItem {
  const args = parseToolArgs(item.detail);
  let fileName = '';
  let filePath = '';
  let diff: DiffStats = { additions: 0, deletions: 0 };

  if (item.toolType === 'fileChange' && item.changes?.length) {
    // fileChange 类型
    filePath = item.changes[0].path;
    fileName = getFileName(filePath);
    // 从 changes diff 统计
    for (const change of item.changes) {
      if (change.diff) {
        const lines = change.diff.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) diff.additions++;
          if (line.startsWith('-') && !line.startsWith('---')) diff.deletions++;
        }
      }
    }
  } else {
    // edit/write 工具
    filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
    fileName = getFileName(filePath);
    const oldString = (args?.old_string as string) ?? '';
    const newString = (args?.new_string as string) ?? '';
    if (oldString || newString) {
      diff = computeDiffStats(oldString, newString);
    } else {
      // write 工具 - 全部是新增
      const content = (args?.content as string) ?? '';
      if (content) {
        diff = { additions: content.split('\n').length, deletions: 0 };
      }
    }
  }

  const hasOutput = Boolean(item.output) || Boolean(item.changes?.length);
  const status = resolveToolStatus(item.status, hasOutput);

  return { id: item.id, fileName, filePath, diff, status };
}

function groupStatus(items: ToolItem[]): ToolStatusTone {
  const hasProcessing = items.some((item) => {
    const hasOutput = Boolean(item.output) || Boolean(item.changes?.length);
    return resolveToolStatus(item.status, hasOutput) === 'processing';
  });
  if (hasProcessing) return 'processing';
  const hasFailed = items.some((item) => {
    const hasOutput = Boolean(item.output) || Boolean(item.changes?.length);
    return resolveToolStatus(item.status, hasOutput) === 'failed';
  });
  if (hasFailed) return 'failed';
  return 'completed';
}

function formatPlanProgress(plan: TurnPlan | null | undefined) {
  if (!plan || !plan.steps.length) {
    return '';
  }
  const completed = plan.steps.filter((step) => step.status === 'completed').length;
  return `${completed}/${plan.steps.length}`;
}

function planStepStatusLabel(status: TurnPlan['steps'][number]['status']) {
  if (status === 'completed') {
    return '[x]';
  }
  if (status === 'inProgress') {
    return '[>]';
  }
  return '[ ]';
}

function getPlanEmptyLabel(_isPlanMode: boolean, isProcessing: boolean) {
  if (isProcessing) {
    return 'Generating plan...';
  }
  return 'No plan generated. Send a message to start.';
}

export const EditToolGroupBlock = memo(function EditToolGroupBlock({
  items,
  plan = null,
  isProcessing = false,
  isPlanMode = false,
  onOpenFullPlan,
  onOpenDiffPath,
}: EditToolGroupBlockProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPlanPopoverOpen, setIsPlanPopoverOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const planPopoverRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(items.length);

  const parsed = useMemo(() => items.map(parseEditItem), [items]);
  const status = groupStatus(items);
  const completedCount = parsed.filter((entry) => entry.status === 'completed').length;
  const failedCount = parsed.filter((entry) => entry.status === 'failed').length;
  const pendingCount = parsed.filter((entry) => entry.status === 'processing').length;

  const totalDiff = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const p of parsed) {
      additions += p.diff.additions;
      deletions += p.diff.deletions;
    }
    return { additions, deletions };
  }, [parsed]);

  useEffect(() => {
    if (items.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  const listHeight = Math.min(parsed.length, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;
  const needsScroll = parsed.length > MAX_VISIBLE_ITEMS;
  const planProgress = formatPlanProgress(plan);
  const planSteps = plan?.steps ?? [];
  const showPlanEmpty = !planSteps.length && !plan?.explanation;
  const planEmptyLabel = getPlanEmptyLabel(isPlanMode, isProcessing);

  useEffect(() => {
    if (!isPlanPopoverOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!planPopoverRef.current) {
        return;
      }
      if (!planPopoverRef.current.contains(event.target as Node)) {
        setIsPlanPopoverOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPlanPopoverOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [isPlanPopoverOpen]);

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          borderBottom: isExpanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className="codicon codicon-edit tool-title-icon" />
          <span className="tool-title-text">{t("tools.batchEditFile")}</span>
          <span className="tool-title-summary" style={{
            color: 'var(--text-secondary)',
            marginLeft: '4px',
            flexShrink: 0,
          }}>
            ({items.length})
          </span>
          {(totalDiff.additions > 0 || totalDiff.deletions > 0) && (
            <span className="edit-group-diff-total">
              {totalDiff.additions > 0 && (
                <span className="diff-stat-add">+{totalDiff.additions}</span>
              )}
              {totalDiff.deletions > 0 && (
                <span className="diff-stat-del">-{totalDiff.deletions}</span>
              )}
            </span>
          )}
          <span className="edit-group-result-summary">
            <span className="edit-group-result-chip completed">{completedCount}</span>
            {failedCount > 0 && <span className="edit-group-result-chip failed">{failedCount}</span>}
            {pendingCount > 0 && <span className="edit-group-result-chip pending">{pendingCount}</span>}
          </span>
        </div>
        <div className={`tool-status-indicator ${status === 'failed' ? 'error' : status}`} />
      </div>

      {isExpanded && (
        <div
          className="task-details file-list-container"
          ref={listRef}
          style={{
            padding: '6px 8px',
            border: 'none',
            maxHeight: needsScroll ? `${listHeight + 12}px` : undefined,
            overflowY: needsScroll ? 'auto' : 'hidden',
            overflowX: 'hidden',
          }}
        >
          {parsed.map((entry) => (
            <div key={entry.id} className="file-list-item" style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: '4px',
              minHeight: `${ITEM_HEIGHT}px`,
            }}>
              <span style={{ marginRight: '8px', display: 'flex', alignItems: 'center', width: '16px', height: '16px', flexShrink: 0 }}>
                <FileIcon fileName={entry.fileName || 'file'} size={16} />
              </span>
              <button
                type="button"
                className={`edit-group-file-link${onOpenDiffPath ? ' is-clickable' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!onOpenDiffPath || !entry.filePath) {
                    return;
                  }
                  onOpenDiffPath(entry.filePath);
                }}
                disabled={!onOpenDiffPath || !entry.filePath}
                title={entry.filePath || entry.fileName}
              >
                <span style={{
                fontSize: '12px',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
                }}>
                  {entry.fileName || entry.filePath || '...'}
                </span>
              </button>
              <span className="edit-item-diff-stats">
                {entry.diff.additions > 0 && (
                  <span className="diff-stat-add">+{entry.diff.additions}</span>
                )}
                {entry.diff.deletions > 0 && (
                  <span className="diff-stat-del">-{entry.diff.deletions}</span>
                )}
              </span>
              <div
                className={`tool-status-indicator ${entry.status === 'failed' ? 'error' : entry.status}`}
                style={{ marginLeft: '8px' }}
              />
            </div>
          ))}
        </div>
      )}
      {isExpanded && (
        <div className="edit-group-toolbar" ref={planPopoverRef}>
          <button
            type="button"
            className="edit-group-plan-btn"
            onClick={(event) => {
              event.stopPropagation();
              setIsPlanPopoverOpen((prev) => !prev);
            }}
            aria-expanded={isPlanPopoverOpen}
            aria-label={t('tools.planQuickView')}
          >
            <span className="codicon codicon-list-unordered" aria-hidden />
            <span>{t('tools.planQuickView')}</span>
          </button>
          {isPlanPopoverOpen && (
            <div
              className="edit-group-plan-popover"
              role="dialog"
              aria-label={t('tools.planQuickView')}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="edit-group-plan-popover-header">
                <span className="edit-group-plan-popover-title">{t('tools.planQuickView')}</span>
                {planProgress && (
                  <span className="edit-group-plan-popover-progress">{planProgress}</span>
                )}
              </div>
              <div className="edit-group-plan-popover-body">
                {plan?.explanation && (
                  <div className="edit-group-plan-popover-explanation">{plan.explanation}</div>
                )}
                {showPlanEmpty ? (
                  <div className="edit-group-plan-popover-empty">{planEmptyLabel}</div>
                ) : (
                  <ol className="edit-group-plan-popover-list">
                    {planSteps.map((step, index) => (
                      <li key={`${step.step}-${index}`} className={`edit-group-plan-popover-step ${step.status}`}>
                        <span className="edit-group-plan-popover-step-status" aria-hidden>
                          {planStepStatusLabel(step.status)}
                        </span>
                        <span className="edit-group-plan-popover-step-text">{step.step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <button
                type="button"
                className="edit-group-plan-open-full"
                onClick={() => {
                  setIsPlanPopoverOpen(false);
                  onOpenFullPlan?.();
                }}
              >
                {t('tools.openFullPlanPanel')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default EditToolGroupBlock;
