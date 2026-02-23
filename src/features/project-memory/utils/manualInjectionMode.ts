import type { MemoryContextInjectionMode } from "../../../types";

export const MANUAL_MEMORY_INJECTION_MODE_STORAGE_KEY =
  "projectMemory.manualSelectionInjectionMode";
export const DEFAULT_MANUAL_MEMORY_INJECTION_MODE: MemoryContextInjectionMode =
  "detail";

function normalizeMode(value: string | null | undefined): MemoryContextInjectionMode {
  return value === "summary" ? "summary" : "detail";
}

export function getManualMemoryInjectionMode(): MemoryContextInjectionMode {
  if (typeof window === "undefined") {
    return DEFAULT_MANUAL_MEMORY_INJECTION_MODE;
  }
  return normalizeMode(
    window.localStorage.getItem(MANUAL_MEMORY_INJECTION_MODE_STORAGE_KEY),
  );
}

export function setManualMemoryInjectionMode(mode: MemoryContextInjectionMode): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(MANUAL_MEMORY_INJECTION_MODE_STORAGE_KEY, mode);
}

