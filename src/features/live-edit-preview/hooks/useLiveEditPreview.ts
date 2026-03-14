import { useCallback, useEffect, useRef } from "react";
import type { SessionActivityEvent } from "../../session-activity/types";

const DEFAULT_MANUAL_PAUSE_MS = 4_000;
const DEFAULT_THROTTLE_MS = 900;

type CenterMode = "chat" | "diff" | "editor" | "memory";

type UseLiveEditPreviewOptions = {
  enabled: boolean;
  timeline: SessionActivityEvent[];
  centerMode: CenterMode;
  activeEditorFilePath: string | null;
  onOpenFile: (path: string) => void;
  manualPauseMs?: number;
  throttleMs?: number;
};

type PendingPreviewTarget = {
  eventId: string;
  path: string;
};

export function useLiveEditPreview({
  enabled,
  timeline,
  centerMode,
  activeEditorFilePath,
  onOpenFile,
  manualPauseMs = DEFAULT_MANUAL_PAUSE_MS,
  throttleMs = DEFAULT_THROTTLE_MS,
}: UseLiveEditPreviewOptions) {
  const enabledRef = useRef(enabled);
  const centerModeRef = useRef(centerMode);
  const activeEditorFilePathRef = useRef(activeEditorFilePath);
  const onOpenFileRef = useRef(onOpenFile);
  const manualFocusLockUntilRef = useRef(0);
  const lastPreviewAtRef = useRef(0);
  const lastConsumedEventIdRef = useRef<string | null>(null);
  const pendingPreviewRef = useRef<PendingPreviewTarget | null>(null);
  const pendingTimeoutRef = useRef<number | null>(null);

  enabledRef.current = enabled;
  centerModeRef.current = centerMode;
  activeEditorFilePathRef.current = activeEditorFilePath;
  onOpenFileRef.current = onOpenFile;

  const clearPendingPreview = useCallback(() => {
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
    pendingPreviewRef.current = null;
  }, []);

  const openPreviewTarget = useCallback((target: PendingPreviewTarget) => {
    if (!enabledRef.current) {
      return;
    }
    if (Date.now() < manualFocusLockUntilRef.current) {
      return;
    }
    if (
      centerModeRef.current === "editor" &&
      activeEditorFilePathRef.current === target.path
    ) {
      return;
    }
    onOpenFileRef.current(target.path);
    lastPreviewAtRef.current = Date.now();
  }, []);

  const flushPendingPreview = useCallback(() => {
    pendingTimeoutRef.current = null;
    const target = pendingPreviewRef.current;
    pendingPreviewRef.current = null;
    if (!target) {
      return;
    }
    openPreviewTarget(target);
  }, [openPreviewTarget]);

  const markManualNavigation = useCallback(() => {
    manualFocusLockUntilRef.current = Date.now() + manualPauseMs;
    clearPendingPreview();
  }, [clearPendingPreview, manualPauseMs]);

  useEffect(() => {
    if (!enabled) {
      clearPendingPreview();
      return;
    }

    const latestFileChange = timeline.find(
      (event) =>
        event.kind === "fileChange" &&
        Boolean(event.filePath) &&
        event.status === "completed",
    );
    if (!latestFileChange?.filePath) {
      return;
    }
    if (latestFileChange.eventId === lastConsumedEventIdRef.current) {
      return;
    }
    lastConsumedEventIdRef.current = latestFileChange.eventId;

    if (Date.now() < manualFocusLockUntilRef.current) {
      return;
    }

    const target = {
      eventId: latestFileChange.eventId,
      path: latestFileChange.filePath,
    };
    const elapsedMs = Date.now() - lastPreviewAtRef.current;
    if (lastPreviewAtRef.current > 0 && elapsedMs < throttleMs) {
      pendingPreviewRef.current = target;
      if (pendingTimeoutRef.current !== null) {
        window.clearTimeout(pendingTimeoutRef.current);
      }
      pendingTimeoutRef.current = window.setTimeout(
        flushPendingPreview,
        Math.max(0, throttleMs - elapsedMs),
      );
      return;
    }

    openPreviewTarget(target);
  }, [clearPendingPreview, enabled, flushPendingPreview, openPreviewTarget, throttleMs, timeline]);

  useEffect(() => clearPendingPreview, [clearPendingPreview]);

  return {
    markManualNavigation,
  };
}
