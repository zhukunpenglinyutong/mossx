const FLAG_PREFIX = "ccgui.perf.";

const isTestMode = (() => {
  try {
    return import.meta.env.MODE === "test";
  } catch {
    return false;
  }
})();

const cachedFlags: Record<string, boolean> = {};

function parseBooleanFlag(raw: string | null): boolean | null {
  if (raw == null) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "1" || normalized === "true" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "off") {
    return false;
  }
  return null;
}

function readRealtimePerfFlag(
  key: string,
  defaultValue: boolean,
  testDefaultValue = defaultValue,
): boolean {
  const fallbackValue = isTestMode ? testDefaultValue : defaultValue;

  if (!isTestMode && key in cachedFlags) {
    return cachedFlags[key] ?? fallbackValue;
  }

  let resolved = fallbackValue;
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(`${FLAG_PREFIX}${key}`);
      const parsed = parseBooleanFlag(stored);
      if (parsed !== null) {
        resolved = parsed;
      }
    } catch {
      // Ignore storage read errors and keep fallback.
    }
  }

  if (!isTestMode) {
    cachedFlags[key] = resolved;
  }
  return resolved;
}

export function isRealtimeBatchingEnabled(): boolean {
  // Keep existing tests deterministic by default; runtime remains enabled by default.
  return readRealtimePerfFlag("realtimeBatching", true, false);
}

export function isReducerNoopGuardEnabled(): boolean {
  return readRealtimePerfFlag("reducerNoopGuard", true);
}

export function isIncrementalDerivationEnabled(): boolean {
  return readRealtimePerfFlag("incrementalDerivation", true);
}

export function isDebugLightPathEnabled(): boolean {
  return readRealtimePerfFlag("debugLightPath", true);
}

export function isBackgroundRenderGatingEnabled(): boolean {
  return readRealtimePerfFlag("backgroundRenderGating", true);
}

export function isBackgroundBufferedFlushEnabled(): boolean {
  return readRealtimePerfFlag("backgroundBufferedFlush", true);
}

export function isStagedHydrationEnabled(): boolean {
  return readRealtimePerfFlag("stagedHydration", true);
}

export function __resetRealtimePerfFlagCacheForTests() {
  for (const key of Object.keys(cachedFlags)) {
    delete cachedFlags[key];
  }
}
