import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

export const MAX_PINS_SOFT_LIMIT = 5;

export type ThreadActivityMap = Record<string, Record<string, number>>;
export type PinnedThreadsMap = Record<string, number>;
export type CustomNamesMap = Record<string, string>;
export type AutoTitlePendingMap = Record<string, true>;
export type CodexRewindHiddenItemIdsMap = Record<string, string[]>;

const CODEX_REWIND_HIDDEN_ITEM_IDS_STORE_KEY = "codexRewindHiddenItemIds";
const CODEX_REWIND_HIDDEN_ITEM_IDS_PER_THREAD_LIMIT = 4000;

export function loadThreadActivity(): ThreadActivityMap {
  return getClientStoreSync<ThreadActivityMap>("threads", "lastUserActivity") ?? {};
}

export function saveThreadActivity(activity: ThreadActivityMap) {
  writeClientStoreValue("threads", "lastUserActivity", activity);
}

function normalizeCodexRewindHiddenItemIds(
  value: unknown,
): CodexRewindHiddenItemIdsMap {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized: CodexRewindHiddenItemIdsMap = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, rawIds]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey || !Array.isArray(rawIds)) {
      return;
    }
    const seen = new Set<string>();
    const ids: string[] = [];
    rawIds.forEach((rawId) => {
      if (typeof rawId !== "string") {
        return;
      }
      const normalizedId = rawId.trim();
      if (!normalizedId || seen.has(normalizedId)) {
        return;
      }
      seen.add(normalizedId);
      ids.push(normalizedId);
    });
    if (ids.length < 1) {
      return;
    }
    normalized[normalizedKey] = ids.slice(
      -CODEX_REWIND_HIDDEN_ITEM_IDS_PER_THREAD_LIMIT,
    );
  });
  return normalized;
}

export function loadCodexRewindHiddenItemIds(): CodexRewindHiddenItemIdsMap {
  const raw = getClientStoreSync<CodexRewindHiddenItemIdsMap>(
    "threads",
    CODEX_REWIND_HIDDEN_ITEM_IDS_STORE_KEY,
  );
  return normalizeCodexRewindHiddenItemIds(raw);
}

export function saveCodexRewindHiddenItemIds(
  value: CodexRewindHiddenItemIdsMap,
): void {
  writeClientStoreValue(
    "threads",
    CODEX_REWIND_HIDDEN_ITEM_IDS_STORE_KEY,
    normalizeCodexRewindHiddenItemIds(value),
  );
}

export function makeCustomNameKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadCustomNames(): CustomNamesMap {
  return getClientStoreSync<CustomNamesMap>("threads", "customNames") ?? {};
}

export function saveCustomName(workspaceId: string, threadId: string, name: string): void {
  const current = loadCustomNames();
  const key = makeCustomNameKey(workspaceId, threadId);
  const updated = { ...current, [key]: name };
  writeClientStoreValue("threads", "customNames", updated);
}

export function loadAutoTitlePending(): AutoTitlePendingMap {
  const raw = getClientStoreSync<AutoTitlePendingMap>("threads", "autoTitlePending") ?? {};
  const normalized: AutoTitlePendingMap = {};
  Object.entries(raw).forEach(([key, value]) => {
    if (key.trim() && value === true) {
      normalized[key] = true;
    }
  });
  return normalized;
}

export function saveAutoTitlePending(value: AutoTitlePendingMap): void {
  writeClientStoreValue("threads", "autoTitlePending", value);
}

export function makePinKey(workspaceId: string, threadId: string): string {
  return `${workspaceId}:${threadId}`;
}

export function loadPinnedThreads(): PinnedThreadsMap {
  return getClientStoreSync<PinnedThreadsMap>("threads", "pinnedThreads") ?? {};
}

export function savePinnedThreads(pinned: PinnedThreadsMap) {
  writeClientStoreValue("threads", "pinnedThreads", pinned);
}
