/**
 * 文件图标组件 - 使用 SVG 内联图标显示语言/框架特定的文件图标
 * File Icon Component - renders rich SVG icons based on file extension and name
 */
import { memo, useMemo } from 'react';
import { getFileIcon, getFolderIcon } from '../../../../utils/fileIcons';

interface FileIconProps {
  fileName: string;
  size?: number;
  className?: string;
}

/**
 * 从文件名获取 SVG 图标字符串
 */
function getSvgForFile(fileName: string): string {
  // 目录：以 / 结尾
  if (fileName.endsWith('/')) {
    const folderName = fileName.slice(0, -1);
    return getFolderIcon(folderName);
  }

  const ext = fileName.indexOf('.') !== -1 ? fileName.split('.').pop() ?? '' : '';
  return getFileIcon(ext, fileName);
}

export const FileIcon = memo(function FileIcon({
  fileName,
  size = 14,
  className = '',
}: FileIconProps) {
  const svgContent = useMemo(() => getSvgForFile(fileName), [fileName]);

  return (
    <span
      className={`file-icon ${className}`.trim()}
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svgContent }}
      aria-hidden="true"
    />
  );
});

export default FileIcon;
