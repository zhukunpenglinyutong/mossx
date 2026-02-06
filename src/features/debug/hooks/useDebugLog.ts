import { useCallback, useRef, useState } from "react";
import type { DebugEntry } from "../../../types";

const MAX_DEBUG_ENTRIES = 200;

export function useDebugLog() {
  const [debugOpen, setDebugOpenState] = useState(false);
  const [debugEntries, setDebugEntries] = useState<DebugEntry[]>([]);
  const [hasDebugAlerts, setHasDebugAlerts] = useState(false);
  const [debugPinned, setDebugPinned] = useState(false);
  const debugEntryIdCounterRef = useRef(0);

  const shouldLogEntry = useCallback((entry: DebugEntry) => {
    if (entry.source === "error" || entry.source === "stderr") {
      return true;
    }
    const label = entry.label.toLowerCase();
    if (label.startsWith("thread/title")) {
      return true;
    }
    if (label.includes("turn/start")) {
      return true;
    }
    if (label.includes("warn") || label.includes("warning")) {
      return true;
    }
    if (typeof entry.payload === "string") {
      const payload = entry.payload.toLowerCase();
      return payload.includes("warn") || payload.includes("warning");
    }
    return false;
  }, []);

  const addDebugEntry = useCallback(
    (entry: DebugEntry) => {
      if (!shouldLogEntry(entry)) {
        return;
      }
      setHasDebugAlerts(true);
      setDebugEntries((prev) => {
        const trimmedId = entry.id.trim();
        const baseId =
          trimmedId.length > 0
            ? trimmedId
            : `debug-${entry.timestamp}-${debugEntryIdCounterRef.current++}`;

        let resolvedId = baseId;
        while (prev.some((existing) => existing.id === resolvedId)) {
          resolvedId = `${baseId}-${debugEntryIdCounterRef.current++}`;
        }

        const nextEntry =
          resolvedId === entry.id ? entry : { ...entry, id: resolvedId };

        return [...prev, nextEntry].slice(-MAX_DEBUG_ENTRIES);
      });
    },
    [shouldLogEntry],
  );

  const handleCopyDebug = useCallback(async () => {
    const text = debugEntries
      .map((entry) => {
        const timestamp = new Date(entry.timestamp).toLocaleTimeString();
        const payload =
          entry.payload !== undefined
            ? typeof entry.payload === "string"
              ? entry.payload
              : JSON.stringify(entry.payload, null, 2)
            : "";
        return [entry.source.toUpperCase(), timestamp, entry.label, payload]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    if (text) {
      await navigator.clipboard.writeText(text);
    }
  }, [debugEntries]);

  const clearDebugEntries = useCallback(() => {
    setDebugEntries([]);
    setHasDebugAlerts(false);
  }, []);

  const setDebugOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setDebugOpenState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (resolved) {
          setDebugPinned(true);
        }
        return resolved;
      });
    },
    [],
  );

  const showDebugButton = debugOpen || debugPinned;

  return {
    debugOpen,
    setDebugOpen,
    debugEntries,
    hasDebugAlerts,
    showDebugButton,
    addDebugEntry,
    handleCopyDebug,
    clearDebugEntries,
  };
}
