/**
 * 读取文件工具块组件
 * Read Tool Block Component - for displaying file read operations
 */
import { memo, useMemo } from 'react';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Folder from 'lucide-react/dist/esm/icons/folder';
import type { ConversationItem } from '../../../../types';
import {
  parseToolArgs,
  getFirstStringField,
  getFileName,
  resolveToolStatus,
} from './toolConstants';
import { FileIcon } from './FileIcon';

interface ReadToolBlockProps {
  item: Extract<ConversationItem, { kind: 'tool' }>;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

/**
 * 获取状态
 */
function getStatus(item: Extract<ConversationItem, { kind: 'tool' }>): 'completed' | 'processing' | 'failed' {
  return resolveToolStatus(item.status, Boolean(item.output));
}

export const ReadToolBlock = memo(function ReadToolBlock({
  item,
  isExpanded,
  onToggle,
}: ReadToolBlockProps) {
  const args = useMemo(() => parseToolArgs(item.detail), [item.detail]);

  // 提取文件路径
  const filePath = getFirstStringField(args, ['file_path', 'path', 'target_file', 'filename']);
  const fileName = getFileName(filePath);

  // 提取行号信息
  const offset = args?.offset as number | undefined;
  const limit = args?.limit as number | undefined;
  let lineInfo = '';
  if (typeof offset === 'number' && typeof limit === 'number') {
    const startLine = offset + 1;
    const endLine = offset + limit;
    lineInfo = `第 ${startLine}-${endLine} 行`;
  }

  // 判断是否为目录
  const isDirectory = filePath?.endsWith('/') || fileName === '.' || fileName === '..';

  const status = getStatus(item);

  return (
    <div className="tool-block">
      <button
        type="button"
        className={`tool-block-header${isExpanded && item.output ? ' expanded' : ''}`}
        onClick={() => onToggle(item.id)}
        aria-expanded={isExpanded}
      >
        <div className="tool-block-title">
          {isDirectory ? (
            <Folder className={`tool-block-icon ${status}`} size={16} aria-hidden />
          ) : (
            <FileText className={`tool-block-icon ${status}`} size={16} aria-hidden />
          )}
          <span className="tool-block-name">
            {isDirectory ? '读取目录' : '读取文件'}
          </span>
          {fileName && (
            <span className="tool-block-summary tool-block-file">
              <FileIcon fileName={isDirectory ? fileName + '/' : fileName} size={14} />
              <span>{fileName}</span>
              {lineInfo && <span className="tool-block-line-info">{lineInfo}</span>}
            </span>
          )}
        </div>
        <span className={`tool-block-dot ${status}`} aria-hidden />
      </button>

      {isExpanded && item.output && (
        <div className="tool-block-output">
          <pre>{item.output}</pre>
        </div>
      )}
    </div>
  );
});

export default ReadToolBlock;
