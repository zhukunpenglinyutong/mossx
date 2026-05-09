import type { OpenAppTarget } from "../../types";

export const OPEN_APP_STORAGE_KEY = "open-workspace-app";
export const DEFAULT_OPEN_APP_ID = "vscode";
export const DEFAULT_VISIBLE_THREAD_ROOT_COUNT = 20;
export const MIN_VISIBLE_THREAD_ROOT_COUNT = 1;
export const MAX_VISIBLE_THREAD_ROOT_COUNT = 200;

export function normalizeVisibleThreadRootCount(
  value: number | null | undefined,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_VISIBLE_THREAD_ROOT_COUNT;
  }

  return Math.max(
    MIN_VISIBLE_THREAD_ROOT_COUNT,
    Math.min(MAX_VISIBLE_THREAD_ROOT_COUNT, Math.trunc(value)),
  );
}

export type OpenAppId = string;

export const DEFAULT_OPEN_APP_TARGETS: OpenAppTarget[] = [
  {
    id: "vscode",
    label: "VS Code",
    kind: "app",
    appName: "Visual Studio Code",
    args: [],
  },
  {
    id: "cursor",
    label: "Cursor",
    kind: "app",
    appName: "Cursor",
    args: [],
  },
  {
    id: "zed",
    label: "Zed",
    kind: "app",
    appName: "Zed",
    args: [],
  },
  {
    id: "ghostty",
    label: "Ghostty",
    kind: "app",
    appName: "Ghostty",
    args: [],
  },
  {
    id: "antigravity",
    label: "Antigravity",
    kind: "app",
    appName: "Antigravity",
    args: [],
  },
  {
    id: "finder",
    label: "Finder",
    kind: "finder",
    args: [],
  },
];
