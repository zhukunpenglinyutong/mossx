import {
  getClientStoreSync,
  isPreloaded,
  writeClientStoreValue,
} from "./clientStorage";

export type RendererDiagnosticEntry = {
  timestamp: number;
  label: string;
  payload: Record<string, unknown>;
};

const RENDERER_DIAGNOSTICS_KEY = "diagnostics.rendererLifecycleLog";
const MAX_RENDERER_DIAGNOSTICS = 200;
const MAX_PERF_ENTRIES = 1000;
const EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY = "ccgui.bootstrapRendererDiagnostics";

let installed = false;
let bufferedEntries: RendererDiagnosticEntry[] = [];

function trimDiagnostics(entries: RendererDiagnosticEntry[]) {
  const regularEntries: RendererDiagnosticEntry[] = [];
  const perfEntries: RendererDiagnosticEntry[] = [];
  for (const entry of entries) {
    if (entry.label.startsWith("perf.")) {
      perfEntries.push(entry);
    } else {
      regularEntries.push(entry);
    }
  }
  return [
    ...regularEntries.slice(Math.max(0, regularEntries.length - MAX_RENDERER_DIAGNOSTICS)),
    ...perfEntries.slice(Math.max(0, perfEntries.length - MAX_PERF_ENTRIES)),
  ].sort((left, right) => left.timestamp - right.timestamp);
}

function mergeDiagnostics(
  ...groups: RendererDiagnosticEntry[][]
): RendererDiagnosticEntry[] {
  const seen = new Set<string>();
  const merged: RendererDiagnosticEntry[] = [];
  for (const group of groups) {
    for (const entry of group) {
      const signature = JSON.stringify(entry);
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      merged.push(entry);
    }
  }
  return trimDiagnostics(merged);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeDiagnosticEntry(value: unknown): RendererDiagnosticEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const { timestamp, label, payload } = value;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || typeof label !== "string") {
    return null;
  }
  return {
    timestamp,
    label,
    payload: isRecord(payload) ? payload : {},
  };
}

function normalizeDiagnosticEntries(value: unknown): RendererDiagnosticEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const normalized = normalizeDiagnosticEntry(entry);
    return normalized ? [normalized] : [];
  });
}

function formatUnknown(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectWindowSnapshot(extra: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return extra;
  }
  return {
    visibilityState: document.visibilityState,
    readyState: document.readyState,
    hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : null,
    href: window.location.href,
    ...extra,
  };
}

function persistDiagnostics(entries: RendererDiagnosticEntry[]) {
  writeClientStoreValue("app", RENDERER_DIAGNOSTICS_KEY, entries, { immediate: true });
}

function canUseLocalStorage() {
  return typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined";
}

function readEarlyPersistedDiagnostics(): RendererDiagnosticEntry[] {
  if (!canUseLocalStorage()) {
    return [];
  }
  try {
    const raw = globalThis.localStorage.getItem(EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return normalizeDiagnosticEntries(parsed);
  } catch {
    return [];
  }
}

function persistEarlyDiagnostics(entries: RendererDiagnosticEntry[]) {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    if (entries.length === 0) {
      globalThis.localStorage.removeItem(EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY);
      return;
    }
    globalThis.localStorage.setItem(
      EARLY_RENDERER_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify(trimDiagnostics(entries)),
    );
  } catch {
    // Ignore localStorage failures, diagnostics are best effort.
  }
}

function readPersistedDiagnostics() {
  const stored = getClientStoreSync<RendererDiagnosticEntry[] | unknown>(
    "app",
    RENDERER_DIAGNOSTICS_KEY,
  );
  return mergeDiagnostics(normalizeDiagnosticEntries(stored), readEarlyPersistedDiagnostics());
}

export function appendRendererDiagnostic(
  label: string,
  payload: Record<string, unknown> = {},
) {
  const entry: RendererDiagnosticEntry = {
    timestamp: Date.now(),
    label,
    payload,
  };

  if (!isPreloaded()) {
    bufferedEntries = trimDiagnostics([...bufferedEntries, entry]);
    persistEarlyDiagnostics(bufferedEntries);
    return;
  }

  const existing = readPersistedDiagnostics();
  const nextEntries = mergeDiagnostics(existing, bufferedEntries, [entry]);
  bufferedEntries = [];
  persistEarlyDiagnostics([]);
  persistDiagnostics(nextEntries);
}

export function appendRendererPerfDiagnostic(
  label: "perf.web-vital",
  payload: Record<string, unknown> = {},
) {
  appendRendererDiagnostic(label, payload);
}

export function flushRendererDiagnosticsBuffer() {
  if (bufferedEntries.length === 0 && readEarlyPersistedDiagnostics().length === 0) {
    return;
  }
  if (!isPreloaded()) {
    persistEarlyDiagnostics(bufferedEntries);
    return;
  }
  const existing = readPersistedDiagnostics();
  const nextEntries = mergeDiagnostics(existing, bufferedEntries);
  bufferedEntries = [];
  persistEarlyDiagnostics([]);
  persistDiagnostics(nextEntries);
}

export function installRendererLifecycleDiagnostics() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  installed = true;

  appendRendererDiagnostic("renderer/install", collectWindowSnapshot());

  window.addEventListener("focus", () => {
    appendRendererDiagnostic("window/focus", collectWindowSnapshot());
  });

  window.addEventListener("blur", () => {
    appendRendererDiagnostic("window/blur", collectWindowSnapshot());
  });

  document.addEventListener("visibilitychange", () => {
    appendRendererDiagnostic(
      "document/visibilitychange",
      collectWindowSnapshot({
        hidden: document.hidden,
      }),
    );
  });

  window.addEventListener("pageshow", (event) => {
    appendRendererDiagnostic(
      "window/pageshow",
      collectWindowSnapshot({
        persisted: event.persisted,
      }),
    );
  });

  window.addEventListener("pagehide", (event) => {
    appendRendererDiagnostic(
      "window/pagehide",
      collectWindowSnapshot({
        persisted: event.persisted,
      }),
    );
  });

  window.addEventListener("error", (event) => {
    appendRendererDiagnostic(
      "window/error",
      collectWindowSnapshot({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: formatUnknown(event.error),
      }),
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    appendRendererDiagnostic(
      "window/unhandledrejection",
      collectWindowSnapshot({
        reason: formatUnknown(event.reason),
      }),
    );
  });

  void import("./perfBaseline")
    .then((module) => {
      module.installPerfBaselineWebVitals();
    })
    .catch((error: unknown) => {
      appendRendererDiagnostic("perf.web-vital/install-failed", {
        error: formatUnknown(error),
      });
    });
}
