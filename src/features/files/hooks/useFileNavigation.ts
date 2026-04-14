import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { EditorView, keymap } from "@codemirror/view";
import { closeSearchPanel, openSearchPanel, searchPanelOpen } from "@codemirror/search";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { getCodeIntelDefinition, getCodeIntelReferences } from "../../../services/tauri";
import {
  isAbsoluteFsPath,
  normalizeFsPath,
  resolveWorkspaceRelativePath,
} from "../../../utils/workspacePaths";
import { lspPositionToEditorLocation, offsetToLspPosition } from "../utils/lspPosition";
import {
  areFileUrisEquivalent,
  CODE_INTEL_CACHE_TTL_MS,
  CODE_INTEL_REPEAT_DEBOUNCE_MS,
  errorMessageFromUnknown,
  extractLocations,
  makeLocationQueryKey,
  NAVIGATION_REQUEST_TIMEOUT_MS,
  readFreshCache,
  relativePathFromFileUri,
  toFileUri,
  type LocationCacheEntry,
  type LspLocationLike,
  type RecentTrigger,
  withTimeout,
} from "../utils/fileViewNavigationUtils";

type UseFileNavigationArgs = {
  workspaceId: string;
  workspacePath: string;
  filePath: string;
  absolutePath: string;
  caseInsensitivePathCompare: boolean;
  isSameWorkspacePath: (leftPath: string, rightPath: string) => boolean;
  navigationTarget: {
    path: string;
    line: number;
    column: number;
    requestId: number;
  } | null;
  isLoading: boolean;
  t: (key: string) => string;
  onNavigateToLocation?: (
    path: string,
    location: { line: number; column: number },
  ) => void;
  setMode: (mode: "edit") => void;
  cmRef: RefObject<ReactCodeMirrorRef | null>;
};

export function useFileNavigation({
  workspaceId,
  workspacePath,
  filePath,
  absolutePath,
  caseInsensitivePathCompare,
  isSameWorkspacePath,
  navigationTarget,
  isLoading,
  t,
  onNavigateToLocation,
  setMode,
  cmRef,
}: UseFileNavigationArgs) {
  const [isDefinitionLoading, setIsDefinitionLoading] = useState(false);
  const [isReferencesLoading, setIsReferencesLoading] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [definitionCandidates, setDefinitionCandidates] = useState<LspLocationLike[]>([]);
  const [referenceResults, setReferenceResults] = useState<LspLocationLike[] | null>(null);
  const lspRequestIdRef = useRef(0);
  const definitionCacheRef = useRef<Map<string, LocationCacheEntry>>(new Map());
  const referencesCacheRef = useRef<Map<string, LocationCacheEntry>>(new Map());
  const recentDefinitionTriggerRef = useRef<RecentTrigger | null>(null);
  const recentReferencesTriggerRef = useRef<RecentTrigger | null>(null);
  const appliedNavigationRequestRef = useRef(0);
  const navigationFocusTimerRef = useRef<number | null>(null);
  const currentFileUri = useMemo(() => toFileUri(absolutePath), [absolutePath]);

  const clearNavigationFocusTimer = useCallback(() => {
    if (navigationFocusTimerRef.current !== null) {
      window.clearTimeout(navigationFocusTimerRef.current);
      navigationFocusTimerRef.current = null;
    }
  }, []);

  const focusEditorAtLocation = useCallback((line: number, column: number) => {
    const view = cmRef.current?.view;
    if (!view) {
      return false;
    }
    if (line < 1 || line > view.state.doc.lines) {
      return false;
    }
    const lineInfo = view.state.doc.line(line);
    const safeColumn = Math.max(1, Math.min(column, lineInfo.length + 1));
    const anchor = lineInfo.from + safeColumn - 1;
    view.dispatch({
      selection: { anchor },
      scrollIntoView: true,
    });
    view.focus();
    return true;
  }, [cmRef]);

  const focusEditorAtLocationWithRetry = useCallback(
    (
      line: number,
      column: number,
      attempt = 0,
      onFocused?: () => void,
    ) => {
      const focused = focusEditorAtLocation(line, column);
      if (focused && attempt >= 4) {
        clearNavigationFocusTimer();
        onFocused?.();
        return;
      }
      if (attempt >= 12) {
        clearNavigationFocusTimer();
        return;
      }
      clearNavigationFocusTimer();
      navigationFocusTimerRef.current = window.setTimeout(() => {
        focusEditorAtLocationWithRetry(line, column, attempt + 1, onFocused);
      }, 16);
    },
    [clearNavigationFocusTimer, focusEditorAtLocation],
  );

  const navigateToLocation = useCallback(
    (location: LspLocationLike) => {
      const relativePathFromUri = relativePathFromFileUri(location.uri, workspacePath);
      const relativePathFromLocation =
        typeof location.path === "string" && location.path.trim().length > 0
          ? resolveWorkspaceRelativePath(
              workspacePath,
              normalizeFsPath(location.path.trim()),
            )
          : null;
      const relativePath =
        relativePathFromLocation && !isAbsoluteFsPath(relativePathFromLocation)
          ? relativePathFromLocation
          : relativePathFromUri;
      const { line, column } = lspPositionToEditorLocation({
        line: location.line,
        character: location.character,
      });

      if (relativePath && onNavigateToLocation) {
        onNavigateToLocation(relativePath, { line, column });
        return;
      }

      const hitsCurrentFileByPath =
        (relativePath && isSameWorkspacePath(relativePath, filePath)) ||
        (relativePathFromUri && isSameWorkspacePath(relativePathFromUri, filePath));
      if (
        hitsCurrentFileByPath ||
        areFileUrisEquivalent(
          location.uri,
          currentFileUri,
          caseInsensitivePathCompare,
        )
      ) {
        setMode("edit");
        focusEditorAtLocationWithRetry(line, column);
      }
    },
    [
      caseInsensitivePathCompare,
      currentFileUri,
      filePath,
      focusEditorAtLocationWithRetry,
      isSameWorkspacePath,
      onNavigateToLocation,
      setMode,
      workspacePath,
    ],
  );

  const resolveDefinitionAtOffset = useCallback(
    async (offset: number, view?: EditorView) => {
      const editorView = view ?? cmRef.current?.view;
      if (!editorView) {
        return;
      }
      const position = offsetToLspPosition(editorView.state.doc, offset);
      const queryKey = makeLocationQueryKey(
        filePath,
        position.line,
        position.character,
      );
      const now = Date.now();
      const recentTrigger = recentDefinitionTriggerRef.current;
      if (
        recentTrigger &&
        recentTrigger.key === queryKey &&
        now - recentTrigger.at < CODE_INTEL_REPEAT_DEBOUNCE_MS
      ) {
        return;
      }
      recentDefinitionTriggerRef.current = { key: queryKey, at: now };
      const requestId = lspRequestIdRef.current + 1;
      lspRequestIdRef.current = requestId;
      setNavigationError(null);
      setDefinitionCandidates([]);
      const cachedLocations = readFreshCache(definitionCacheRef.current, queryKey);
      if (cachedLocations) {
        setIsDefinitionLoading(false);
        if (cachedLocations.length === 0) {
          setNavigationError(t("files.navigationNoDefinition"));
          return;
        }
        if (cachedLocations.length === 1) {
          const onlyLocation = cachedLocations[0];
          if (onlyLocation) {
            navigateToLocation(onlyLocation);
          }
          return;
        }
        setDefinitionCandidates(cachedLocations);
        return;
      }
      setIsDefinitionLoading(true);
      try {
        const response = await withTimeout(
          getCodeIntelDefinition(workspaceId, {
            filePath,
            line: position.line,
            character: position.character,
          }),
          NAVIGATION_REQUEST_TIMEOUT_MS,
          t("files.navigationTimeout"),
        );
        if (requestId !== lspRequestIdRef.current) {
          return;
        }
        const locations = extractLocations(response.result);
        definitionCacheRef.current.set(queryKey, {
          expiresAt: Date.now() + CODE_INTEL_CACHE_TTL_MS,
          value: locations,
        });
        if (locations.length === 0) {
          setNavigationError(t("files.navigationNoDefinition"));
          return;
        }
        if (locations.length === 1) {
          const onlyLocation = locations[0];
          if (onlyLocation) {
            navigateToLocation(onlyLocation);
          }
          return;
        }
        setDefinitionCandidates(locations);
      } catch (error) {
        if (requestId !== lspRequestIdRef.current) {
          return;
        }
        setNavigationError(errorMessageFromUnknown(error, t("files.navigationError")));
      } finally {
        if (requestId === lspRequestIdRef.current) {
          setIsDefinitionLoading(false);
        }
      }
    },
    [cmRef, filePath, navigateToLocation, t, workspaceId],
  );

  const findReferencesAtOffset = useCallback(
    async (offset: number) => {
      const editorView = cmRef.current?.view;
      if (!editorView) {
        return;
      }
      const position = offsetToLspPosition(editorView.state.doc, offset);
      const queryKey = makeLocationQueryKey(
        filePath,
        position.line,
        position.character,
        false,
      );
      const now = Date.now();
      const recentTrigger = recentReferencesTriggerRef.current;
      if (
        recentTrigger &&
        recentTrigger.key === queryKey &&
        now - recentTrigger.at < CODE_INTEL_REPEAT_DEBOUNCE_MS
      ) {
        return;
      }
      recentReferencesTriggerRef.current = { key: queryKey, at: now };
      const requestId = lspRequestIdRef.current + 1;
      lspRequestIdRef.current = requestId;
      setNavigationError(null);
      setReferenceResults(null);
      const cachedLocations = readFreshCache(referencesCacheRef.current, queryKey);
      if (cachedLocations) {
        setIsReferencesLoading(false);
        setReferenceResults(cachedLocations);
        return;
      }
      setIsReferencesLoading(true);
      try {
        const response = await withTimeout(
          getCodeIntelReferences(workspaceId, {
            filePath,
            line: position.line,
            character: position.character,
          }),
          NAVIGATION_REQUEST_TIMEOUT_MS,
          t("files.navigationTimeout"),
        );
        if (requestId !== lspRequestIdRef.current) {
          return;
        }
        const locations = extractLocations(response.result);
        referencesCacheRef.current.set(queryKey, {
          expiresAt: Date.now() + CODE_INTEL_CACHE_TTL_MS,
          value: locations,
        });
        setReferenceResults(locations);
      } catch (error) {
        if (requestId !== lspRequestIdRef.current) {
          return;
        }
        setNavigationError(errorMessageFromUnknown(error, t("files.navigationError")));
      } finally {
        if (requestId === lspRequestIdRef.current) {
          setIsReferencesLoading(false);
        }
      }
    },
    [cmRef, filePath, t, workspaceId],
  );

  const runDefinitionFromCursor = useCallback(() => {
    const view = cmRef.current?.view;
    if (!view) {
      return;
    }
    void resolveDefinitionAtOffset(view.state.selection.main.head, view as unknown as EditorView);
  }, [cmRef, resolveDefinitionAtOffset]);

  const runReferencesFromCursor = useCallback(() => {
    const view = cmRef.current?.view;
    if (!view) {
      return;
    }
    void findReferencesAtOffset(view.state.selection.main.head);
  }, [cmRef, findReferencesAtOffset]);

  const editorNavigationKeymapExt = useMemo(
    () =>
      keymap.of([
        {
          key: "Mod-f",
          run: (view) => {
            if (searchPanelOpen(view.state)) {
              closeSearchPanel(view);
            } else {
              openSearchPanel(view);
            }
            view.focus();
            return true;
          },
        },
        {
          key: "Mod-b",
          run: () => {
            runDefinitionFromCursor();
            return true;
          },
        },
        {
          key: "Alt-F7",
          run: () => {
            runReferencesFromCursor();
            return true;
          },
        },
      ]),
    [runDefinitionFromCursor, runReferencesFromCursor],
  );

  const ctrlClickDefinitionExt = useMemo(
    () =>
      EditorView.domEventHandlers({
        mousedown: (event, view) => {
          if (event.button !== 0) {
            return false;
          }
          if (!(event.metaKey || event.ctrlKey)) {
            return false;
          }
          const offset = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (offset == null) {
            return false;
          }
          event.preventDefault();
          void resolveDefinitionAtOffset(offset, view);
          return true;
        },
      }),
    [resolveDefinitionAtOffset],
  );

  useEffect(() => {
    lspRequestIdRef.current += 1;
    recentDefinitionTriggerRef.current = null;
    recentReferencesTriggerRef.current = null;
    setIsDefinitionLoading(false);
    setIsReferencesLoading(false);
    setNavigationError(null);
    setDefinitionCandidates([]);
    setReferenceResults(null);
  }, [filePath]);

  useEffect(() => {
    clearNavigationFocusTimer();
    return () => {
      clearNavigationFocusTimer();
    };
  }, [clearNavigationFocusTimer, filePath]);

  useEffect(() => {
    if (!navigationTarget) {
      return;
    }
    if (!isSameWorkspacePath(navigationTarget.path, filePath)) {
      return;
    }
    if (navigationTarget.requestId === appliedNavigationRequestRef.current) {
      return;
    }
    if (isLoading) {
      return;
    }
    setMode("edit");
    focusEditorAtLocationWithRetry(
      navigationTarget.line,
      navigationTarget.column,
      0,
      () => {
        appliedNavigationRequestRef.current = navigationTarget.requestId;
      },
    );
  }, [
    filePath,
    focusEditorAtLocationWithRetry,
    isLoading,
    isSameWorkspacePath,
    navigationTarget,
    setMode,
  ]);

  const openFindPanelInEditor = useCallback(() => {
    const view = cmRef.current?.view;
    if (!view) {
      return false;
    }
    openSearchPanel(view as unknown as EditorView);
    view.focus();
    return true;
  }, [cmRef]);

  const toggleFindPanelInEditor = useCallback(() => {
    const view = cmRef.current?.view;
    if (!view) {
      return false;
    }
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view as unknown as EditorView);
    } else {
      openSearchPanel(view as unknown as EditorView);
    }
    view.focus();
    return true;
  }, [cmRef]);

  return {
    isDefinitionLoading,
    isReferencesLoading,
    navigationError,
    definitionCandidates,
    setDefinitionCandidates,
    referenceResults,
    setReferenceResults,
    navigateToLocation,
    runDefinitionFromCursor,
    runReferencesFromCursor,
    editorNavigationKeymapExt,
    ctrlClickDefinitionExt,
    openFindPanelInEditor,
    toggleFindPanelInEditor,
  };
}
