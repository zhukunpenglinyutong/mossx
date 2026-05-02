import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { getClientStoreSync, writeClientStoreValue } from "../../../../../services/clientStorage";

const PANEL_RESIZING_DATASET_KEY = "panelResizing";
const MIN_CHANGES_WIDTH = 220;
const MAX_CHANGES_WIDTH = 420;
const DEFAULT_CHANGES_WIDTH: Record<"embedded" | "detached", number> = {
  embedded: 248,
  detached: 280,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredBoolean(key: string, fallback: boolean) {
  const stored = getClientStoreSync<boolean>("layout", key);
  return typeof stored === "boolean" ? stored : fallback;
}

function readStoredWidth(key: string, fallback: number) {
  const stored = getClientStoreSync<number>("layout", key);
  return typeof stored === "number" && Number.isFinite(stored)
    ? clamp(stored, MIN_CHANGES_WIDTH, MAX_CHANGES_WIDTH)
    : clamp(fallback, MIN_CHANGES_WIDTH, MAX_CHANGES_WIDTH);
}

function resolveStorageKeys(surfaceMode: "embedded" | "detached") {
  return {
    changesCollapsed: `specHub.${surfaceMode}.changesCollapsed`,
    changesWidth: `specHub.${surfaceMode}.changesWidth`,
    outlineCollapsed: `specHub.${surfaceMode}.outlineCollapsed`,
  };
}

function setPanelResizing(active: boolean) {
  if (active) {
    document.body.dataset[PANEL_RESIZING_DATASET_KEY] = "true";
    document.body.style.cursor = "col-resize";
    return;
  }
  delete document.body.dataset[PANEL_RESIZING_DATASET_KEY];
  document.body.style.cursor = "";
}

function resolveChangesMaxWidth(
  root: HTMLElement | null,
  surfaceMode: "embedded" | "detached",
  controlCollapsed: boolean,
  artifactMaximized: boolean,
) {
  const grid = root?.querySelector<HTMLElement>(".spec-hub-grid");
  const gridWidth = grid?.getBoundingClientRect().width ?? 0;
  if (!Number.isFinite(gridWidth) || gridWidth <= 0) {
    return MAX_CHANGES_WIDTH;
  }
  if (artifactMaximized) {
    return MIN_CHANGES_WIDTH;
  }
  const minArtifactWidth = surfaceMode === "detached" ? 520 : 420;
  const minControlWidth = controlCollapsed ? 0 : surfaceMode === "detached" ? 320 : 280;
  const gapAllowance = controlCollapsed ? 12 : 24;
  return clamp(
    Math.floor(gridWidth - minArtifactWidth - minControlWidth - gapAllowance),
    MIN_CHANGES_WIDTH,
    MAX_CHANGES_WIDTH,
  );
}

type UseSpecHubSurfaceLayoutOptions = {
  surfaceMode: "embedded" | "detached";
  rootRef: RefObject<HTMLDivElement | null>;
  controlCollapsed: boolean;
  artifactMaximized: boolean;
};

export function useSpecHubSurfaceLayout({
  surfaceMode,
  rootRef,
  controlCollapsed,
  artifactMaximized,
}: UseSpecHubSurfaceLayoutOptions) {
  const storageKeys = resolveStorageKeys(surfaceMode);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [changesCollapsed, setChangesCollapsed] = useState(() =>
    readStoredBoolean(storageKeys.changesCollapsed, false),
  );
  const [outlineCollapsed, setOutlineCollapsed] = useState(() =>
    readStoredBoolean(storageKeys.outlineCollapsed, true),
  );
  const [changesWidth, setChangesWidth] = useState(() =>
    readStoredWidth(storageKeys.changesWidth, DEFAULT_CHANGES_WIDTH[surfaceMode]),
  );
  const [isDraggingChanges, setIsDraggingChanges] = useState(false);

  useEffect(() => {
    writeClientStoreValue("layout", storageKeys.changesCollapsed, changesCollapsed);
  }, [changesCollapsed, storageKeys.changesCollapsed]);

  useEffect(() => {
    writeClientStoreValue("layout", storageKeys.outlineCollapsed, outlineCollapsed);
  }, [outlineCollapsed, storageKeys.outlineCollapsed]);

  useEffect(() => {
    writeClientStoreValue("layout", storageKeys.changesWidth, changesWidth);
  }, [changesWidth, storageKeys.changesWidth]);

  useEffect(() => {
    const syncWidth = () => {
      const maxWidth = resolveChangesMaxWidth(
        rootRef.current,
        surfaceMode,
        controlCollapsed,
        artifactMaximized,
      );
      setChangesWidth((current) => clamp(current, MIN_CHANGES_WIDTH, maxWidth));
    };
    syncWidth();
    window.addEventListener("resize", syncWidth);
    return () => {
      window.removeEventListener("resize", syncWidth);
    };
  }, [artifactMaximized, controlCollapsed, rootRef, surfaceMode]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setPanelResizing(false);
    };
  }, []);

  const handleChangesResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || artifactMaximized || changesCollapsed) {
        return;
      }
      const root = rootRef.current;
      if (!(root instanceof HTMLElement)) {
        return;
      }
      const startX = event.clientX;
      const startWidth = changesWidth;
      const maxWidth = resolveChangesMaxWidth(root, surfaceMode, controlCollapsed, artifactMaximized);
      if (maxWidth <= MIN_CHANGES_WIDTH) {
        return;
      }

      event.preventDefault();
      setIsDraggingChanges(true);
      setPanelResizing(true);

      const cleanup = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
        setIsDraggingChanges(false);
        setPanelResizing(false);
        cleanupRef.current = null;
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clamp(startWidth + (moveEvent.clientX - startX), MIN_CHANGES_WIDTH, maxWidth);
        setChangesWidth(nextWidth);
      };

      const handlePointerUp = () => {
        cleanup();
      };

      cleanupRef.current?.();
      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [
      artifactMaximized,
      changesCollapsed,
      changesWidth,
      controlCollapsed,
      rootRef,
      surfaceMode,
    ],
  );

  return {
    changesCollapsed,
    setChangesCollapsed,
    outlineCollapsed,
    setOutlineCollapsed,
    changesWidth,
    isDraggingChanges,
    handleChangesResizeStart,
  };
}
