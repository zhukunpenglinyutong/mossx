import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

type CollaborationMode = "plan" | "code";
type CollaborationModeByThread = Record<string, CollaborationMode>;

type UseThreadScopedCollaborationModeOptions = {
  setSelectedCollaborationModeId: Dispatch<SetStateAction<string | null>>;
};

export function useThreadScopedCollaborationMode({
  setSelectedCollaborationModeId,
}: UseThreadScopedCollaborationModeOptions) {
  const [collaborationUiModeByThread, setCollaborationUiModeByThread] =
    useState<CollaborationModeByThread>({});
  const [collaborationRuntimeModeByThread, setCollaborationRuntimeModeByThread] =
    useState<CollaborationModeByThread>({});
  const activeThreadIdForModeRef = useRef<string | null>(null);
  const lastCodexModeSyncThreadRef = useRef<string | null>(null);
  const codexComposerModeRef = useRef<CollaborationMode | null>(null);

  const applySelectedCollaborationMode = useCallback(
    (modeId: string | null) => {
      if (!modeId) {
        codexComposerModeRef.current = null;
        setSelectedCollaborationModeId(null);
        return;
      }
      const normalized: CollaborationMode = modeId === "plan" ? "plan" : "code";
      codexComposerModeRef.current = normalized;
      const threadId = activeThreadIdForModeRef.current;
      if (threadId) {
        setCollaborationUiModeByThread((prev) => {
          if (prev[threadId] === normalized) {
            return prev;
          }
          return {
            ...prev,
            [threadId]: normalized,
          };
        });
      }
      setSelectedCollaborationModeId(normalized);
    },
    [setSelectedCollaborationModeId],
  );

  const setCodexCollaborationMode = useCallback(
    (mode: CollaborationMode) => {
      applySelectedCollaborationMode(mode);
    },
    [applySelectedCollaborationMode],
  );

  const resolveCollaborationRuntimeMode = useCallback(
    (threadId: string): CollaborationMode | null =>
      collaborationRuntimeModeByThread[threadId] ?? null,
    [collaborationRuntimeModeByThread],
  );

  const resolveCollaborationUiMode = useCallback(
    (threadId: string): CollaborationMode | null =>
      collaborationUiModeByThread[threadId] ?? null,
    [collaborationUiModeByThread],
  );

  const handleCollaborationModeResolved = useCallback(
    (payload: {
      workspaceId: string;
      threadId: string;
      selectedUiMode: "plan" | "default";
      effectiveRuntimeMode: CollaborationMode;
      effectiveUiMode: "plan" | "default";
      fallbackReason: string | null;
    }) => {
      const threadId = payload.threadId.trim();
      if (!threadId) {
        return;
      }
      const effectiveRuntimeMode =
        payload.effectiveRuntimeMode === "plan" ? "plan" : "code";
      const effectiveUiMode = payload.effectiveUiMode === "plan" ? "plan" : "code";
      setCollaborationRuntimeModeByThread((prev) => {
        if (prev[threadId] === effectiveRuntimeMode) {
          return prev;
        }
        return {
          ...prev,
          [threadId]: effectiveRuntimeMode,
        };
      });
      setCollaborationUiModeByThread((prev) => {
        if (prev[threadId] === effectiveUiMode) {
          return prev;
        }
        return {
          ...prev,
          [threadId]: effectiveUiMode,
        };
      });
    },
    [],
  );

  return {
    collaborationUiModeByThread,
    setCollaborationUiModeByThread,
    collaborationRuntimeModeByThread,
    setCollaborationRuntimeModeByThread,
    activeThreadIdForModeRef,
    lastCodexModeSyncThreadRef,
    codexComposerModeRef,
    applySelectedCollaborationMode,
    setCodexCollaborationMode,
    resolveCollaborationRuntimeMode,
    resolveCollaborationUiMode,
    handleCollaborationModeResolved,
  };
}
