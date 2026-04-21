import { getClientStoreSync, writeClientStoreValue } from "../../../services/clientStorage";

export const MAX_PINS_SOFT_LIMIT = 5;

export type ThreadActivityMap = Record<string, Record<string, number>>;
export type PinnedThreadsMap = Record<string, number>;
export type CustomNamesMap = Record<string, string>;
export type AutoTitlePendingMap = Record<string, true>;
export type ThreadAliasMap = Record<string, string>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadThreadActivity(): ThreadActivityMap {
  return getClientStoreSync<ThreadActivityMap>("threads", "lastUserActivity") ?? {};
}

export function saveThreadActivity(activity: ThreadActivityMap) {
  writeClientStoreValue("threads", "lastUserActivity", activity);
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

export function normalizeThreadAliases(raw: unknown): ThreadAliasMap {
  if (!isPlainRecord(raw)) {
    return {};
  }

  const normalized: ThreadAliasMap = {};
  Object.entries(raw).forEach(([source, target]) => {
    if (typeof target !== "string") {
      return;
    }
    const normalizedSource = source.trim();
    const normalizedTarget = target.trim();
    if (!normalizedSource || !normalizedTarget || normalizedSource === normalizedTarget) {
      return;
    }
    normalized[normalizedSource] = normalizedTarget;
  });

  const flattened: ThreadAliasMap = {};
  Object.keys(normalized).forEach((sourceThreadId) => {
    let currentThreadId = sourceThreadId;
    const visited = new Set<string>();
    let nextThreadId = normalized[currentThreadId];
    while (nextThreadId) {
      if (visited.has(currentThreadId)) {
        return;
      }
      visited.add(currentThreadId);
      currentThreadId = nextThreadId;
      nextThreadId = normalized[currentThreadId];
    }
    if (currentThreadId !== sourceThreadId) {
      flattened[sourceThreadId] = currentThreadId;
    }
  });

  return flattened;
}

export function resolveCanonicalThreadAlias(
  aliases: ThreadAliasMap,
  threadId: string,
): string {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    return threadId;
  }
  let current = normalizedThreadId;
  const visited = new Set<string>();
  while (aliases[current] && !visited.has(current)) {
    visited.add(current);
    current = aliases[current] ?? current;
  }
  return current;
}

export function loadThreadAliases(): ThreadAliasMap {
  const raw = getClientStoreSync<unknown>("threads", "threadAliases") ?? {};
  return normalizeThreadAliases(raw);
}

export function saveThreadAliases(value: ThreadAliasMap): void {
  writeClientStoreValue("threads", "threadAliases", normalizeThreadAliases(value));
}

export function buildUpdatedThreadAliases(
  current: ThreadAliasMap,
  oldThreadId: string,
  newThreadId: string,
): ThreadAliasMap {
  const normalizedCurrent = normalizeThreadAliases(current);
  const normalizedOldThreadId = oldThreadId.trim();
  const normalizedNewThreadId = newThreadId.trim();
  if (
    !normalizedOldThreadId ||
    !normalizedNewThreadId ||
    normalizedOldThreadId === normalizedNewThreadId
  ) {
    return normalizedCurrent;
  }
  const canonicalNewThreadId = resolveCanonicalThreadAlias(
    normalizedCurrent,
    normalizedNewThreadId,
  );
  normalizedCurrent[normalizedOldThreadId] = canonicalNewThreadId;
  if (canonicalNewThreadId !== normalizedNewThreadId) {
    normalizedCurrent[normalizedNewThreadId] = canonicalNewThreadId;
  }
  Object.keys(normalizedCurrent).forEach((sourceThreadId) => {
    const canonicalThreadId = resolveCanonicalThreadAlias(
      normalizedCurrent,
      sourceThreadId,
    );
    if (!canonicalThreadId || canonicalThreadId === sourceThreadId) {
      delete normalizedCurrent[sourceThreadId];
      return;
    }
    normalizedCurrent[sourceThreadId] = canonicalThreadId;
  });
  return normalizedCurrent;
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
