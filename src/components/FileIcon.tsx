import { memo, useMemo } from 'react';
import { getFileIcon, getFolderIcon } from '../utils/fileIcons';

interface FileIconProps {
  filePath: string;
  isFolder?: boolean;
  isOpen?: boolean;
  className?: string;
}

/**
 * Get file name from path
 */
function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || '';
}

/**
 * Get file icon SVG from file path
 */
function getFileIconSvg(filePath: string, isFolder?: boolean, isOpen?: boolean): string {
  const name = getFileName(filePath);

  if (isFolder) {
    return getFolderIcon(name, isOpen);
  }

  // Remove line number suffix if present (e.g., "file.ts:10-20")
  const cleanName = name.replace(/:\d+(-\d+)?$/, '');
  const extension = cleanName.indexOf('.') !== -1 ? cleanName.split('.').pop() : '';
  return getFileIcon(extension, cleanName);
}

/**
 * File icon component that safely renders SVG icons.
 *
 * Security note: The SVG content comes from internal trusted source (getFileIconSvg)
 * which maps file extensions to pre-defined SVG strings. No user input is rendered.
 */
const FileIcon = memo(({ filePath, isFolder, isOpen, className = 'file-icon' }: FileIconProps) => {
  const svgContent = useMemo(
    () => getFileIconSvg(filePath, isFolder, isOpen),
    [filePath, isFolder, isOpen]
  );

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: svgContent }}
      aria-hidden="true"
    />
  );
});

FileIcon.displayName = 'FileIcon';

export default FileIcon;
export { getFileIconSvg, getFileName };
