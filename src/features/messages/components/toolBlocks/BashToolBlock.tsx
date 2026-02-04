/**
 * 终端命令工具块组件
 * Bash Tool Block Component - for displaying terminal command executions
 */
import { memo, useMemo, useEffect, useRef, useState, useCallback } from 'react';
import Terminal from 'lucide-react/dist/esm/icons/terminal';
import type { ConversationItem } from '../../../../types';
import { parseToolArgs, getFirstStringField, truncateText } from './toolConstants';

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

  // 移除 shell 包装: /bin/bash -c '...' 或 /bin/zsh -lc '...'
  const shellMatch = trimmed.match(
    /^(?:\/\S+\/)?(?:bash|zsh|sh|fish)(?:\.exe)?\s+-(?:l?c)\s+(['"])([\s\S]+)\1$/
  );
  const inner = shellMatch ? shellMatch[2] : trimmed;

  // 移除 cd 前缀: cd dir && actual_command
  const cdMatch = inner.match(/^\s*cd\s+[^&;]+(?:\s*&&\s*|\s*;\s*)([\s\S]+)$/i);
  const stripped = cdMatch ? cdMatch[1] : inner;

  return stripped.trim();
}

/**
 * 获取状态
 */
function getStatus(item: Extract<ConversationItem, { kind: 'tool' }>): 'completed' | 'processing' | 'failed' {
  const status = item.status?.toLowerCase() || '';
  if (/(fail|error)/.test(status)) return 'failed';
  if (/(pending|running|processing|started|in_progress)/.test(status)) return 'processing';
  if (item.output) return 'completed';
  return 'processing';
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

  // 从标题或参数中提取命令
  let rawCommand = '';
  if (item.title.toLowerCase().startsWith('command:')) {
    rawCommand = item.title.replace(/^Command:\s*/i, '').trim();
  } else {
    rawCommand = getFirstStringField(args, ['command', 'cmd']);
  }

  const command = cleanCommand(rawCommand);
  const displayCommand = truncateText(command, 80);
  const description = getFirstStringField(args, ['description']);

  // 工作目录
  const cwd = item.detail && !item.detail.startsWith('{') ? item.detail : getFirstStringField(args, ['cwd', 'working_directory', 'workdir']);

  const status = getStatus(item);
  const isRunning = status === 'processing';
  const durationMs = typeof item.durationMs === 'number' ? item.durationMs : null;
  const isLongRunning = durationMs !== null && durationMs >= 1200;

  // 处理输出行
  const outputLines = useMemo(() => {
    if (!item.output) return [];
    const lines = item.output.split(/\r?\n/);
    if (lines.length <= MAX_OUTPUT_LINES) return lines;
    return lines.slice(-MAX_OUTPUT_LINES);
  }, [item.output]);

  // 实时输出显示逻辑
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

  // 自动滚动
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

  return (
    <div className="tool-block">
      <button
        type="button"
        className="tool-block-header"
        onClick={() => onToggle(item.id)}
        aria-expanded={isExpanded}
      >
        <div className="tool-block-title">
          <Terminal className={`tool-block-icon ${status}`} size={14} aria-hidden />
          <span className="tool-block-name">运行命令</span>
          {description ? (
            <span className="tool-block-summary" title={description}>
              {truncateText(description, 60)}
            </span>
          ) : displayCommand ? (
            <span className="tool-block-summary tool-block-command" title={command}>
              {displayCommand}
            </span>
          ) : null}
        </div>
        <span className={`tool-block-dot ${status}`} aria-hidden />
      </button>

      {showOutput && outputLines.length > 0 && (
        <div className="tool-block-details">
          {cwd && isExpanded && (
            <div className="tool-block-cwd">
              cwd: {cwd}
            </div>
          )}
          <div
            className="tool-block-terminal"
            ref={containerRef}
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
          >
            {outputLines.map((line, index) => (
              <div key={`${index}-${line.slice(0, 20)}`} className="tool-block-terminal-line">
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default BashToolBlock;
