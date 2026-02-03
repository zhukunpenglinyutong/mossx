import type { DebugEntry } from "../types";

export function buildErrorDebugEntry(label: string, error: unknown): DebugEntry {
  const timestamp = Date.now();
  const payload = error instanceof Error ? error.message : String(error);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return {
    id: `${timestamp}-${slug || "error"}`,
    timestamp,
    source: "error",
    label,
    payload,
  };
}
