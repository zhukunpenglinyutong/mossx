/**
 * 终端命令工具块组件
 * Bash Tool Block Component - for displaying terminal command executions
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useEffect, useRef, useState, useCallback } from 'react';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  truncateText,
  resolveToolStatus,
} from './toolConstants';

interface BashToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onRequestAutoScroll?: () => void;
}

const MAX_OUTPUT_LINES = 200;

/**
 * 清理命令文本，移除 shell 包装
 */
function cleanCommand(commandText: string): string {
  if (!commandText) return '';
  const trimmed = commandText.trim();

  const shellMatch = trimmed.match(
    /^(?:\/\S+\/)?(?:bash|zsh|sh|fish)(?:\.exe)?\s+-(?:l?c)\s+(['"])([\s\S]+)\1$/
  );
  const inner = shellMatch ? shellMatch[2] : trimmed;

  const cdMatch = inner.match(/^\s*cd\s+[^&;]+(?:\s*&&\s*|\s*;\s*)([\s\S]+)$/i);
  const stripped = cdMatch ? cdMatch[1] : inner;

  return stripped.trim();
}

/**
 * 获取状态
 */
function getStatus(item: Extract<ConversationItem, { kind: 'tool' }>): 'completed' | 'processing' | 'failed' {
  return resolveToolStatus(item.status, Boolean(item.output));
}

export const BashToolBlock = memo(function BashToolBlock({
  item,
  isExpanded,
  onToggle,
  onRequestAutoScroll,
}: BashToolBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [showLiveOutput, setShowLiveOutput] = useState(false);

  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  let rawCommand = '';
  if (item.title.toLowerCase().startsWith('command:')) {
    rawCommand = item.title.replace(/^Command:\s*/i, '').trim();
  } else {
    rawCommand = getFirstStringField(args, ['command', 'cmd']);
  }

  const command = cleanCommand(rawCommand);
  const displayCommand = truncateText(command, 80);
  const description = getFirstStringField(args, ['description']);

  const cwd = item.detail && !item.detail.startsWith('{') ? item.detail : getFirstStringField(args, ['cwd', 'working_directory', 'workdir']);

  const status = getStatus(item);
  const isRunning = status === 'processing';
  const durationMs = typeof item.durationMs === 'number' ? item.durationMs : null;
  const isLongRunning = durationMs !== null && durationMs >= 1200;

  const outputLines = useMemo(() => {
    if (!item.output) return [];
    const lines = item.output.split(/\r?\n/);
    if (lines.length <= MAX_OUTPUT_LINES) return lines;
    return lines.slice(-MAX_OUTPUT_LINES);
  }, [item.output]);

  useEffect(() => {
    if (!isRunning) {
      setShowLiveOutput(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setShowLiveOutput(true);
    }, 600);
    return () => window.clearTimeout(timeoutId);
  }, [isRunning]);

  const handleScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    const threshold = 6;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    setIsPinned(distanceFromBottom <= threshold);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !isPinned) return;
    node.scrollTop = node.scrollHeight;
  }, [outputLines, isPinned]);

  useEffect(() => {
    if (isRunning && showLiveOutput) {
      onRequestAutoScroll?.();
    }
  }, [isRunning, showLiveOutput, onRequestAutoScroll]);

  const showOutput = isExpanded || (isRunning && showLiveOutput) || isLongRunning;
  const isError = status === 'failed';
  const isCompleted = status === 'completed';

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => onToggle(item.id)}
        style={{
          borderBottom: showOutput ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className="codicon codicon-terminal tool-title-icon" />
          <span className="tool-title-text">运行命令</span>
          {description ? (
            <span className="tool-title-summary" title={description}>
              {truncateText(description, 60)}
            </span>
          ) : displayCommand ? (
            <span className="tool-title-summary" title={command} style={{ fontFamily: 'var(--font-mono, monospace)', opacity: 0.8 }}>
              {displayCommand}
            </span>
          ) : null}
        </div>
        <div className={`tool-status-indicator ${isError ? 'error' : isCompleted ? 'completed' : 'pending'}`} />
      </div>

      {showOutput && (
        <div className="task-details" style={{ padding: 0, border: 'none' }}>
          {isExpanded && command && (
            <div className="bash-command-block">
              {command}
            </div>
          )}
          {cwd && isExpanded && (
            <div style={{ padding: '4px 12px', fontSize: '11px', color: 'var(--text-tertiary, var(--text-secondary))', opacity: 0.7 }}>
              cwd: {cwd}
            </div>
          )}
          {outputLines.length > 0 && (
            <div
              className={`bash-output-block ${isError ? 'error' : 'normal'}`}
              ref={containerRef}
              onScroll={handleScroll}
              role="log"
              aria-live="polite"
              style={{ maxHeight: '300px', overflowY: 'auto' }}
            >
              {outputLines.map((line, index) => (
                <div key={`${index}-${line.slice(0, 20)}`}>
                  {line || ' '}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default BashToolBlock;
