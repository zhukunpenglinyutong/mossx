import type { LucideIcon } from "lucide-react";
import File from "lucide-react/dist/esm/icons/file";
import FileCode from "lucide-react/dist/esm/icons/file-code";
import FileJson from "lucide-react/dist/esm/icons/file-json";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Folder from "lucide-react/dist/esm/icons/folder";
import FileImage from "lucide-react/dist/esm/icons/file-image";
import FileArchive from "lucide-react/dist/esm/icons/file-archive";
import Settings from "lucide-react/dist/esm/icons/settings";

const EXT_ICONS: Record<string, LucideIcon> = {
  // Code files
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  py: FileCode,
  rs: FileCode,
  go: FileCode,
  java: FileCode,
  cpp: FileCode,
  c: FileCode,
  h: FileCode,
  hpp: FileCode,
  cs: FileCode,
  rb: FileCode,
  php: FileCode,
  swift: FileCode,
  kt: FileCode,
  scala: FileCode,
  // Data files
  json: FileJson,
  yaml: FileJson,
  yml: FileJson,
  toml: FileJson,
  xml: FileJson,
  // Text files
  md: FileText,
  txt: FileText,
  log: FileText,
  csv: FileText,
  // Config files
  env: Settings,
  gitignore: Settings,
  dockerignore: Settings,
  editorconfig: Settings,
  // Image files
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
  // Archive files
  zip: FileArchive,
  tar: FileArchive,
  gz: FileArchive,
  rar: FileArchive,
};

const EXT_COLORS: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#3178c6",
  js: "#f7df1e",
  jsx: "#f7df1e",
  py: "#3776ab",
  rs: "#dea584",
  go: "#00add8",
  java: "#b07219",
  json: "#cbcb41",
  yaml: "#cb171e",
  yml: "#cb171e",
  md: "#519aba",
  html: "#e34c26",
  css: "#563d7c",
  scss: "#c6538c",
  less: "#1d365d",
  vue: "#41b883",
  svelte: "#ff3e00",
};

export function getFileIcon(path: string): LucideIcon {
  if (path.endsWith("/") || path === "." || path === "..") {
    return Folder;
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_ICONS[ext] ?? File;
}

export function getFileIconColor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_COLORS[ext] ?? "var(--text-muted)";
}

export function basename(path: string): string {
  if (!path) return "";
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}
