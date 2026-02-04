/**
 * 文件图标组件 - 根据文件扩展名显示不同颜色的图标
 * File Icon Component - displays colored icons based on file extension
 */
import { memo } from 'react';
import File from 'lucide-react/dist/esm/icons/file';
import FileCode from 'lucide-react/dist/esm/icons/file-code';
import FileJson from 'lucide-react/dist/esm/icons/file-json';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import FileType from 'lucide-react/dist/esm/icons/file-type';
import Folder from 'lucide-react/dist/esm/icons/folder';
import Settings from 'lucide-react/dist/esm/icons/settings';
import Database from 'lucide-react/dist/esm/icons/database';
import Image from 'lucide-react/dist/esm/icons/image';
import type { LucideIcon } from 'lucide-react';

interface FileIconProps {
  fileName: string;
  size?: number;
  className?: string;
}

// 扩展名到颜色的映射
const EXT_COLORS: Record<string, string> = {
  // TypeScript/JavaScript - 蓝色系
  ts: '#3178c6',
  tsx: '#3178c6',
  js: '#f7df1e',
  jsx: '#61dafb',
  mjs: '#f7df1e',
  cjs: '#f7df1e',

  // Web - 橙色/红色系
  html: '#e34c26',
  css: '#264de4',
  scss: '#c6538c',
  less: '#1d365d',
  vue: '#42b883',
  svelte: '#ff3e00',

  // Data - 黄色系
  json: '#cbcb41',
  yaml: '#cb171e',
  yml: '#cb171e',
  toml: '#9c4121',
  xml: '#0060ac',

  // Config - 灰色系
  md: '#083fa1',
  txt: '#89898a',
  log: '#89898a',

  // Languages - 各种颜色
  py: '#3776ab',
  rb: '#cc342d',
  go: '#00add8',
  rs: '#dea584',
  java: '#b07219',
  kt: '#a97bff',
  swift: '#f05138',
  php: '#777bb4',
  c: '#555555',
  cpp: '#f34b7d',
  cs: '#178600',
  sh: '#89e051',
  bash: '#89e051',
  zsh: '#89e051',
  sql: '#e38c00',

  // Config files
  lock: '#89898a',
  gitignore: '#f14e32',
  env: '#ecd53f',
  dockerfile: '#2496ed',
};

// 特殊文件名映射
const SPECIAL_FILES: Record<string, { icon: LucideIcon; color: string }> = {
  'package.json': { icon: FileJson, color: '#cb3837' },
  'tsconfig.json': { icon: FileJson, color: '#3178c6' },
  'dockerfile': { icon: Settings, color: '#2496ed' },
  'docker-compose.yml': { icon: Settings, color: '#2496ed' },
  'docker-compose.yaml': { icon: Settings, color: '#2496ed' },
  '.gitignore': { icon: File, color: '#f14e32' },
  '.env': { icon: File, color: '#ecd53f' },
  'readme.md': { icon: FileText, color: '#083fa1' },
  'license': { icon: FileText, color: '#d4af37' },
  'makefile': { icon: Settings, color: '#6d8086' },
  'cargo.toml': { icon: Settings, color: '#dea584' },
  'go.mod': { icon: Settings, color: '#00add8' },
};

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

function getIconForFile(fileName: string): { Icon: LucideIcon; color: string } {
  const lowerName = fileName.toLowerCase();

  // 检查特殊文件
  if (SPECIAL_FILES[lowerName]) {
    return { Icon: SPECIAL_FILES[lowerName].icon, color: SPECIAL_FILES[lowerName].color };
  }

  // 检查是否为目录
  if (fileName.endsWith('/')) {
    return { Icon: Folder, color: '#dcb67a' };
  }

  const ext = getExtension(fileName);

  // 根据扩展名选择图标类型
  let Icon: LucideIcon = File;
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'php', 'c', 'cpp', 'cs', 'sh', 'bash', 'zsh'].includes(ext)) {
    Icon = FileCode;
  } else if (['json', 'yaml', 'yml', 'toml', 'xml'].includes(ext)) {
    Icon = FileJson;
  } else if (['md', 'txt', 'log'].includes(ext)) {
    Icon = FileText;
  } else if (['html', 'css', 'scss', 'less'].includes(ext)) {
    Icon = FileType;
  } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    Icon = Image;
  } else if (['sql', 'db', 'sqlite'].includes(ext)) {
    Icon = Database;
  }

  const color = EXT_COLORS[ext] || '#89898a';

  return { Icon, color };
}

export const FileIcon = memo(function FileIcon({
  fileName,
  size = 14,
  className = '',
}: FileIconProps) {
  const { Icon, color } = getIconForFile(fileName);

  return (
    <Icon
      size={size}
      className={`file-icon ${className}`}
      style={{ color }}
      aria-hidden
    />
  );
});

export default FileIcon;
