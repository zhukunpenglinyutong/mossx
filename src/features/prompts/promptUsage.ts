const PROMPT_USAGE_STORAGE_KEY = "mossx.promptUsage.v1";
const MAX_PROMPT_USAGE_RECORDS = 500;

export type PromptUsageEntry = {
  count: number;
  lastUsedAt: number;
};

export type PromptHeatLevel = 0 | 1 | 2 | 3;

type PromptUsageStore = Record<string, PromptUsageEntry>;

function canUseLocalStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

function sanitizeStore(store: unknown): PromptUsageStore {
  if (!store || typeof store !== "object") {
    return {};
  }
  const entries = Object.entries(store as Record<string, unknown>);
  const next: PromptUsageStore = {};
  for (const [key, value] of entries) {
    if (!key) {
      continue;
    }
    const count = Number((value as PromptUsageEntry | undefined)?.count ?? 0);
    const lastUsedAt = Number((value as PromptUsageEntry | undefined)?.lastUsedAt ?? 0);
    if (!Number.isFinite(count) || count <= 0) {
      continue;
    }
    next[key] = {
      count,
      lastUsedAt: Number.isFinite(lastUsedAt) && lastUsedAt > 0 ? lastUsedAt : 0,
    };
  }
  return next;
}

export function loadPromptUsage(): PromptUsageStore {
  if (!canUseLocalStorage()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(PROMPT_USAGE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return sanitizeStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

function savePromptUsage(store: PromptUsageStore) {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    const trimmedEntries = Object.entries(store)
      .sort((left, right) => {
        const leftValue = left[1];
        const rightValue = right[1];
        if (rightValue.count !== leftValue.count) {
          return rightValue.count - leftValue.count;
        }
        return rightValue.lastUsedAt - leftValue.lastUsedAt;
      })
      .slice(0, MAX_PROMPT_USAGE_RECORDS);
    window.localStorage.setItem(
      PROMPT_USAGE_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(trimmedEntries)),
    );
  } catch {
    // Ignore persistence failures and keep in-memory behavior only.
  }
}

export function recordPromptUsage(promptId: string, now = Date.now()) {
  const normalizedId = promptId.trim();
  if (!normalizedId) {
    return;
  }
  const store = loadPromptUsage();
  const current = store[normalizedId];
  store[normalizedId] = {
    count: (current?.count ?? 0) + 1,
    lastUsedAt: now,
  };
  savePromptUsage(store);
}

export function getPromptUsageEntry(promptId: string) {
  return loadPromptUsage()[promptId] ?? { count: 0, lastUsedAt: 0 };
}

export function getPromptHeatLevel(count: number): PromptHeatLevel {
  if (count >= 8) {
    return 3;
  }
  if (count >= 4) {
    return 2;
  }
  if (count >= 1) {
    return 1;
  }
  return 0;
}

export function clearPromptUsageForTests() {
  if (!canUseLocalStorage()) {
    return;
  }
  window.localStorage.removeItem(PROMPT_USAGE_STORAGE_KEY);
}
