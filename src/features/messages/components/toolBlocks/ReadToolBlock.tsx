/**
 * 读取文件工具块组件
 * Read Tool Block Component - for displaying file read operations
 * 使用 task-container 样式 + codicon 图标（匹配参考项目）
 */
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationItem } from '../../../../types';
import {
  asRecord,
  parseToolArgs,
  getFirstStringField,
  getFileName,
  resolveToolStatus,
} from './toolConstants';
import { FileIcon } from './FileIcon';
import { Markdown } from '../Markdown';

interface ReadToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx']);
const PATH_KEYS = ['file_path', 'filePath', 'path', 'target_file', 'targetFile', 'filename', 'file'];
const OUTPUT_KEYS = ['output', 'result', 'content', 'text'];

function looksLikeMarkdownOutput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return (
    /^#{1,6}\s+/m.test(trimmed) ||
    /^\s*[-*+]\s+\S+/m.test(trimmed) ||
    /^\s*\d+\.\s+\S+/m.test(trimmed) ||
    /^\s*>+\s+\S+/m.test(trimmed) ||
    /```[\s\S]*```/.test(trimmed) ||
    (/^\s*\|.+\|\s*$/m.test(trimmed) && /^\s*\|?\s*[-:]{2,}/m.test(trimmed))
  );
}

function isMarkdownPath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, '/');
  if (!normalized) {
    return false;
  }
  const fileName = getFileName(normalized).toLowerCase();
  const ext = fileName.includes('.') ? fileName.split('.').pop() ?? '' : '';
  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return true;
  }
  return fileName === 'readme' || fileName.startsWith('readme.');
}

export const ReadToolBlock = memo(function ReadToolBlock({
  item,
  isExpanded: _isExpanded,
  onToggle: _onToggle,
}: ReadToolBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);
  const nestedInput = useMemo(() => asRecord(args?.input), [args]);
  const nestedArgs = useMemo(() => asRecord(args?.arguments), [args]);

  const filePath =
    getFirstStringField(args, PATH_KEYS) ||
    getFirstStringField(nestedInput, PATH_KEYS) ||
    getFirstStringField(nestedArgs, PATH_KEYS);
  const fileName = getFileName(filePath);

  const renderedOutput = useMemo(() => {
    if (item.output && item.output.trim()) {
      return item.output;
    }
    return (
      getFirstStringField(args, OUTPUT_KEYS) ||
      getFirstStringField(nestedInput, OUTPUT_KEYS) ||
      getFirstStringField(nestedArgs, OUTPUT_KEYS)
    );
  }, [args, item.output, nestedArgs, nestedInput]);

  const renderAsMarkdown = useMemo(() => {
    if (!renderedOutput) {
      return false;
    }
    if (isMarkdownPath(filePath)) {
      return true;
    }
    return looksLikeMarkdownOutput(renderedOutput);
  }, [filePath, renderedOutput]);

  const offset = args?.offset as number | undefined;
  const limit = args?.limit as number | undefined;
  let lineInfo = '';
  if (typeof offset === 'number' && typeof limit === 'number') {
    const startLine = offset + 1;
    const endLine = offset + limit;
    lineInfo = t("tools.lineRange", { start: startLine, end: endLine });
  }

  const isDirectory = filePath?.endsWith('/') || fileName === '.' || fileName === '..';
  const iconClass = isDirectory ? 'codicon-folder' : 'codicon-file-code';
  const actionText = isDirectory ? t("tools.readDirectory") : t("tools.readFile");

  const status = resolveToolStatus(item.status, Boolean(renderedOutput));
  const isCompleted = status === 'completed';
  const isError = status === 'failed';

  return (
    <div className="task-container">
      <div
        className="task-header"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          borderBottom: expanded ? '1px solid var(--border-primary)' : undefined,
        }}
      >
        <div className="task-title-section">
          <span className={`codicon ${iconClass} tool-title-icon`} />
          <span className="tool-title-text">{actionText}</span>
          {fileName && (
            <span className="tool-title-summary" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center', width: '16px', height: '16px' }}>
                <FileIcon fileName={isDirectory ? fileName + '/' : fileName} size={16} />
              </span>
              {fileName}
            </span>
          )}
          {lineInfo && (
            <span className="tool-title-summary" style={{ marginLeft: '8px', fontSize: '12px' }}>
              {lineInfo}
            </span>
          )}
        </div>
        <div className={`tool-status-indicator ${isError ? 'error' : isCompleted ? 'completed' : 'pending'}`} />
      </div>

      {expanded && renderedOutput && (
        <div className="task-details read-tool-details" style={{ border: 'none' }}>
          {renderAsMarkdown ? (
            <div className="task-content-wrapper read-tool-markdown-wrapper">
              <div className="read-tool-rendered-content">
                <Markdown
                  value={renderedOutput}
                  className="markdown read-tool-markdown"
                />
              </div>
            </div>
          ) : (
            <div className="task-content-wrapper">
              <div className="task-field-content" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {renderedOutput}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default ReadToolBlock;
