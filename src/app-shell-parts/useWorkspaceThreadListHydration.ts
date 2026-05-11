import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { WorkspaceInfo } from "../types";
import {
  startupOrchestrator,
  type StartupTaskDescriptor,
} from "../features/startup-orchestration/utils/startupOrchestrator";
import {
  getStartupTraceSnapshot,
  recordStartupMilestone,
  type StartupMilestoneName,
} from "../features/startup-orchestration/utils/startupTrace";
import {
  resolveNextWorkspaceThreadListHydrationId,
  shouldSkipWorkspaceThreadListLoad,
} from "./workspaceThreadListLoadGuard";

type ListThreadsForWorkspace = (
  workspace: WorkspaceInfo,
  options?: {
    preserveState?: boolean;
    includeOpenCodeSessions?: boolean;
    startupHydrationMode?: "first-page" | "full-catalog";
  },
) => Promise<void>;

type UseWorkspaceThreadListHydrationOptions = {
  activeWorkspaceId: string | null;
  activeWorkspaceProjectionOwnerIds: readonly string[];
  listThreadsForWorkspace: ListThreadsForWorkspace;
  threadListLoadingByWorkspace: Record<string, boolean>;
  workspaces: WorkspaceInfo[];
  workspacesById: Map<string, WorkspaceInfo>;
};

type UseWorkspaceThreadListHydrationResult = {
  ensureWorkspaceThreadListLoaded: (
    workspaceId: string,
    options?: { preserveState?: boolean; force?: boolean },
  ) => void;
  hydratedThreadListWorkspaceIdsRef: MutableRefObject<Set<string>>;
  listThreadsForWorkspaceTracked: ListThreadsForWorkspace;
  prewarmSessionRadarForWorkspace: (workspaceId: string) => void;
};

type ThreadHydrationPhase = "active-workspace" | "idle-prewarm" | "on-demand";
type ThreadHydrationKind = "first-page" | "full-catalog" | "session-radar";
const ACTIVE_WORKSPACE_READY_MILESTONE: StartupMilestoneName = "active-workspace-ready";

function hasRecordedActiveWorkspaceReady() {
  return Boolean(getStartupTraceSnapshot().milestones[ACTIVE_WORKSPACE_READY_MILESTONE]);
}

function createThreadHydrationTask(
  workspace: WorkspaceInfo,
  phase: ThreadHydrationPhase,
  kind: ThreadHydrationKind,
  run: () => Promise<void>,
): StartupTaskDescriptor<void> {
  const dedupeKey = `thread-list:${kind}:${workspace.id}`;
  return {
    id: `thread-list:${kind}:${workspace.id}`,
    phase,
    priority:
      phase === "active-workspace" ? 90 : phase === "on-demand" ? 85 : kind === "session-radar" ? 30 : 20,
    dedupeKey,
    concurrencyKey: "thread-session-scan",
    timeoutMs: phase === "active-workspace" ? 12_000 : 20_000,
    workspaceScope: { workspaceId: workspace.id },
    cancelPolicy: "soft-ignore",
    traceLabel:
      kind === "session-radar" ? "session-radar workspace prewarm" : `thread/list ${kind} hydration`,
    commandLabel: "list_threads",
    run,
    fallback: () => undefined,
  };
}

export function useWorkspaceThreadListHydration({
  activeWorkspaceId,
  activeWorkspaceProjectionOwnerIds,
  listThreadsForWorkspace,
  threadListLoadingByWorkspace,
  workspaces,
  workspacesById,
}: UseWorkspaceThreadListHydrationOptions): UseWorkspaceThreadListHydrationResult {
  const hydratedThreadListWorkspaceIdsRef = useRef(new Set<string>());
  const fullyHydratedThreadListWorkspaceIdsRef = useRef(new Set<string>());
  const hydratingThreadListWorkspaceIdsRef = useRef(new Set<string>());
  const hydrationPhaseByWorkspaceIdRef = useRef(new Map<string, ThreadHydrationPhase>());
  const hydrationKindByWorkspaceIdRef = useRef(new Map<string, ThreadHydrationKind>());
  const autoHydratedActiveWorkspaceIdRef = useRef<string | null>(null);
  const [hydrationCycle, setHydrationCycle] = useState(0);

  const listThreadsForWorkspaceTracked = useCallback<ListThreadsForWorkspace>(
    async (workspace, options) => {
      hydratingThreadListWorkspaceIdsRef.current.add(workspace.id);
      const phase =
        hydrationPhaseByWorkspaceIdRef.current.get(workspace.id) ??
        (workspace.id === activeWorkspaceId ? "active-workspace" : "on-demand");
      const kind =
        hydrationKindByWorkspaceIdRef.current.get(workspace.id) ??
        (phase === "active-workspace" ? "first-page" : "full-catalog");
      try {
        await startupOrchestrator.run(
          createThreadHydrationTask(workspace, phase, kind, () =>
            listThreadsForWorkspace(workspace, {
              ...options,
              startupHydrationMode: kind === "first-page" ? "first-page" : "full-catalog",
            }),
          ),
        );
      } finally {
        if (kind === "first-page" && phase === "active-workspace" && !hasRecordedActiveWorkspaceReady()) {
          recordStartupMilestone(ACTIVE_WORKSPACE_READY_MILESTONE);
        }
        hydratedThreadListWorkspaceIdsRef.current.add(workspace.id);
        if (kind !== "first-page") {
          fullyHydratedThreadListWorkspaceIdsRef.current.add(workspace.id);
        }
        hydratingThreadListWorkspaceIdsRef.current.delete(workspace.id);
        hydrationPhaseByWorkspaceIdRef.current.delete(workspace.id);
        hydrationKindByWorkspaceIdRef.current.delete(workspace.id);
        setHydrationCycle((current) => current + 1);
      }
    },
    [activeWorkspaceId, listThreadsForWorkspace],
  );

  const ensureWorkspaceThreadListLoaded = useCallback(
    (
      workspaceId: string,
      options?: { preserveState?: boolean; force?: boolean },
    ) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) {
        return;
      }
      const force = options?.force ?? false;
      const isLoading = threadListLoadingByWorkspace[workspaceId] ?? false;
      const hasHydratedThreadList =
        hydratedThreadListWorkspaceIdsRef.current.has(workspaceId);
      const isHydratingThreadList =
        hydratingThreadListWorkspaceIdsRef.current.has(workspaceId);
      if (
        shouldSkipWorkspaceThreadListLoad({
          force,
          isLoading,
          isHydratingThreadList,
          hasHydratedThreadList,
        })
      ) {
        return;
      }
      const phase: ThreadHydrationPhase = force
        ? "on-demand"
        : workspaceId === activeWorkspaceId
          ? "active-workspace"
          : "idle-prewarm";
      hydrationPhaseByWorkspaceIdRef.current.set(workspaceId, phase);
      hydrationKindByWorkspaceIdRef.current.set(
        workspaceId,
        phase === "active-workspace" ? "first-page" : "full-catalog",
      );
      void listThreadsForWorkspaceTracked(workspace, {
        preserveState: options?.preserveState,
      });
    },
    [
      activeWorkspaceId,
      listThreadsForWorkspaceTracked,
      threadListLoadingByWorkspace,
      workspacesById,
    ],
  );

  const prewarmSessionRadarForWorkspace = useCallback(
    (workspaceId: string) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) {
        return;
      }
      if (threadListLoadingByWorkspace[workspaceId] ?? false) {
        return;
      }
      if (hydratingThreadListWorkspaceIdsRef.current.has(workspaceId)) {
        return;
      }
      if (fullyHydratedThreadListWorkspaceIdsRef.current.has(workspaceId)) {
        return;
      }
      hydrationPhaseByWorkspaceIdRef.current.set(workspaceId, "idle-prewarm");
      hydrationKindByWorkspaceIdRef.current.set(workspaceId, "session-radar");
      void listThreadsForWorkspaceTracked(workspace, {
        preserveState: true,
        includeOpenCodeSessions: false,
      });
    },
    [listThreadsForWorkspaceTracked, threadListLoadingByWorkspace, workspacesById],
  );

  const prewarmFullCatalogForWorkspace = useCallback(
    (workspaceId: string) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) {
        return;
      }
      if (threadListLoadingByWorkspace[workspaceId] ?? false) {
        return;
      }
      if (hydratingThreadListWorkspaceIdsRef.current.has(workspaceId)) {
        return;
      }
      if (fullyHydratedThreadListWorkspaceIdsRef.current.has(workspaceId)) {
        return;
      }
      hydrationPhaseByWorkspaceIdRef.current.set(workspaceId, "idle-prewarm");
      hydrationKindByWorkspaceIdRef.current.set(workspaceId, "full-catalog");
      void listThreadsForWorkspaceTracked(workspace, {
        preserveState: true,
      });
    },
    [listThreadsForWorkspaceTracked, threadListLoadingByWorkspace, workspacesById],
  );

  useEffect(() => {
    if (!activeWorkspaceId) {
      autoHydratedActiveWorkspaceIdRef.current = null;
      return;
    }
    if (autoHydratedActiveWorkspaceIdRef.current === activeWorkspaceId) {
      return;
    }
    autoHydratedActiveWorkspaceIdRef.current = activeWorkspaceId;
    ensureWorkspaceThreadListLoaded(activeWorkspaceId, { preserveState: true });
  }, [activeWorkspaceId, ensureWorkspaceThreadListLoaded]);

  useEffect(() => {
    if (!activeWorkspaceId || activeWorkspaceProjectionOwnerIds.length <= 1) {
      return;
    }
    activeWorkspaceProjectionOwnerIds.forEach((workspaceId) => {
      if (workspaceId === activeWorkspaceId) {
        return;
      }
      ensureWorkspaceThreadListLoaded(workspaceId, { preserveState: true });
    });
  }, [
    activeWorkspaceId,
    activeWorkspaceProjectionOwnerIds,
    ensureWorkspaceThreadListLoaded,
  ]);

  const nextBackgroundWorkspaceThreadHydrationId =
    resolveNextWorkspaceThreadListHydrationId({
      workspaces,
      activeWorkspaceProjectionOwnerIds: activeWorkspaceProjectionOwnerIds.filter(
        (workspaceId) => workspaceId !== activeWorkspaceId,
      ),
      hydratedWorkspaceIds: fullyHydratedThreadListWorkspaceIdsRef.current,
      hydratingWorkspaceIds: hydratingThreadListWorkspaceIdsRef.current,
      loadingByWorkspace: threadListLoadingByWorkspace,
    });

  void hydrationCycle;

  useEffect(() => {
    if (!nextBackgroundWorkspaceThreadHydrationId) {
      return;
    }
    prewarmFullCatalogForWorkspace(nextBackgroundWorkspaceThreadHydrationId);
  }, [
    nextBackgroundWorkspaceThreadHydrationId,
    prewarmFullCatalogForWorkspace,
  ]);

  return {
    ensureWorkspaceThreadListLoaded,
    hydratedThreadListWorkspaceIdsRef,
    listThreadsForWorkspaceTracked,
    prewarmSessionRadarForWorkspace,
  };
}
