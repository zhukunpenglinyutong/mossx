import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorNavigationTarget } from "../../app/hooks/useGitPanelController";
import { resolveWorkspaceRelativePath } from "../../../utils/workspacePaths";

type EditorNavigationLocation = {
  line: number;
  column: number;
};

export function useDetachedFileExplorerState(
  workspaceId: string | null,
  workspacePath: string | null,
  initialFilePath?: string | null,
  sessionUpdatedAt?: number | null,
) {
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] =
    useState<EditorNavigationTarget | null>(null);
  const navigationRequestIdRef = useRef(0);
  const lastWorkspaceIdRef = useRef<string | null>(null);

  const normalizeDetachedPath = useCallback((path: string | null | undefined) => {
    const trimmedPath = path?.trim() || null;
    if (!trimmedPath) {
      return null;
    }
    return resolveWorkspaceRelativePath(workspacePath, trimmedPath);
  }, [workspacePath]);

  useEffect(() => {
    const previousWorkspaceId = lastWorkspaceIdRef.current;
    lastWorkspaceIdRef.current = workspaceId;
    const normalizedInitialFilePath = normalizeDetachedPath(initialFilePath);
    if (!workspaceId) {
      setOpenTabs([]);
      setActiveFilePath(null);
      setNavigationTarget(null);
      navigationRequestIdRef.current = 0;
      return;
    }
    if (previousWorkspaceId !== workspaceId) {
      setOpenTabs(normalizedInitialFilePath ? [normalizedInitialFilePath] : []);
      setActiveFilePath(normalizedInitialFilePath);
      setNavigationTarget(null);
      navigationRequestIdRef.current = 0;
      return;
    }
    if (!normalizedInitialFilePath) {
      setNavigationTarget(null);
      return;
    }
    setOpenTabs((current) =>
      current.includes(normalizedInitialFilePath)
        ? current
        : [...current, normalizedInitialFilePath],
    );
    setActiveFilePath(normalizedInitialFilePath);
    setNavigationTarget(null);
  }, [initialFilePath, normalizeDetachedPath, sessionUpdatedAt, workspaceId]);

  useEffect(() => {
    setNavigationTarget((currentTarget) => {
      if (!currentTarget) {
        return null;
      }
      if (activeFilePath && currentTarget.path === activeFilePath) {
        return currentTarget;
      }
      if (openTabs.includes(currentTarget.path)) {
        return currentTarget;
      }
      return null;
    });
  }, [activeFilePath, openTabs]);

  const openFile = (path: string, location?: EditorNavigationLocation) => {
    const normalizedPath = normalizeDetachedPath(path);
    if (!normalizedPath) {
      return;
    }
    setOpenTabs((current) =>
      current.includes(normalizedPath) ? current : [...current, normalizedPath],
    );
    setActiveFilePath(normalizedPath);
    if (!location) {
      setNavigationTarget(null);
      return;
    }
    navigationRequestIdRef.current += 1;
    setNavigationTarget({
      path: normalizedPath,
      line: location.line,
      column: location.column,
      requestId: navigationRequestIdRef.current,
    });
  };

  const activateTab = (path: string) => {
    const normalizedPath = normalizeDetachedPath(path);
    if (!normalizedPath) {
      return;
    }
    setOpenTabs((current) =>
      current.includes(normalizedPath) ? current : [...current, normalizedPath],
    );
    setActiveFilePath(normalizedPath);
    setNavigationTarget(null);
  };

  const closeTab = (path: string) => {
    const normalizedPath = normalizeDetachedPath(path);
    if (!normalizedPath) {
      return;
    }
    setOpenTabs((current) => {
      const closingIndex = current.indexOf(normalizedPath);
      if (closingIndex < 0) {
        return current;
      }
      const nextTabs = current.filter((entry) => entry !== normalizedPath);
      setActiveFilePath((currentActivePath) => {
        if (currentActivePath && currentActivePath !== normalizedPath) {
          return nextTabs.includes(currentActivePath) ? currentActivePath : nextTabs[0] ?? null;
        }
        return nextTabs[closingIndex] ?? nextTabs[closingIndex - 1] ?? null;
      });
      setNavigationTarget((currentTarget) =>
        currentTarget?.path === normalizedPath ? null : currentTarget,
      );
      return nextTabs;
    });
  };

  const closeAllTabs = () => {
    setOpenTabs([]);
    setActiveFilePath(null);
    setNavigationTarget(null);
  };

  return {
    openTabs,
    activeFilePath,
    navigationTarget,
    openFile,
    activateTab,
    closeTab,
    closeAllTabs,
  };
}
