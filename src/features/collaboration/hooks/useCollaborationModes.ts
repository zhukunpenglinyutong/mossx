import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CollaborationModeOption,
  DebugEntry,
  WorkspaceInfo,
} from "../../../types";
import { getCollaborationModes } from "../../../services/tauri";
import { formatCollaborationModeLabel } from "../../../utils/collaborationModes";
import { startupOrchestrator } from "../../startup-orchestration/utils/startupOrchestrator";

type UseCollaborationModesOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabled: boolean;
  onDebug?: (entry: DebugEntry) => void;
};

export function useCollaborationModes({
  activeWorkspace,
  enabled,
  onDebug,
}: UseCollaborationModesOptions) {
  const [modes, setModes] = useState<CollaborationModeOption[]>([]);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);
  const lastFetchedWorkspaceId = useRef<string | null>(null);
  const previousWorkspaceId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const selectedModeIdRef = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  const selectedMode = useMemo(
    () => modes.find((mode) => mode.id === selectedModeId) ?? null,
    [modes, selectedModeId],
  );

  const refreshModes = useCallback(async (phase: "idle-prewarm" | "on-demand" = "on-demand") => {
    if (!workspaceId || !isConnected || !enabled) {
      return;
    }
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    onDebug?.({
      id: `${Date.now()}-client-collaboration-mode-list`,
      timestamp: Date.now(),
      source: "client",
      label: "collaborationMode/list",
      payload: { workspaceId },
    });
    try {
      const response = await startupOrchestrator.run({
        id: `collaboration-modes:${workspaceId}`,
        phase,
        priority: phase === "on-demand" ? 80 : 25,
        dedupeKey: `collaboration-modes:${workspaceId}`,
        concurrencyKey: "catalog",
        timeoutMs: 5_000,
        workspaceScope: { workspaceId },
        cancelPolicy: "soft-ignore",
        traceLabel: "collaborationMode/list",
        commandLabel: "collaboration_mode_list",
        run: () => getCollaborationModes(workspaceId),
        fallback: () => ({ data: [] }),
      });
      onDebug?.({
        id: `${Date.now()}-server-collaboration-mode-list`,
        timestamp: Date.now(),
        source: "server",
        label: "collaborationMode/list response",
        payload: response,
      });
      const rawData = response.result?.data ?? response.data ?? [];
      const data: CollaborationModeOption[] = [];
      for (const rawItem of rawData) {
        if (!rawItem || typeof rawItem !== "object") {
          continue;
        }
        const item = rawItem as Record<string, unknown>;
        const mode = String(item.mode ?? item.name ?? "");
        if (!mode) {
          continue;
        }
        const normalizedModeRaw = mode.trim().toLowerCase();
        const normalizedMode =
          normalizedModeRaw === "default" ? "code" : normalizedModeRaw;
        if (normalizedMode && normalizedMode !== "plan" && normalizedMode !== "code") {
          continue;
        }

        const rawSettings =
          item.settings && typeof item.settings === "object" && !Array.isArray(item.settings)
            ? (item.settings as Record<string, unknown>)
            : null;
        const settings = rawSettings ?? {
          model: item.model ?? null,
          reasoning_effort:
            item.reasoning_effort ?? item.reasoningEffort ?? null,
          developer_instructions:
            item.developer_instructions ??
            item.developerInstructions ??
            null,
        };

        const model = String(settings.model ?? "");
        const reasoningEffort = settings.reasoning_effort ?? null;
        const developerInstructions = settings.developer_instructions ?? null;

        const labelSource = String(item.name ?? item.label ?? mode);
        const normalizedValue: Record<string, unknown> = {
          ...(item as Record<string, unknown>),
          mode: normalizedMode,
        };

        data.push({
          id: normalizedMode,
          label: formatCollaborationModeLabel(labelSource),
          mode: normalizedMode,
          model,
          reasoningEffort: reasoningEffort ? String(reasoningEffort) : null,
          developerInstructions: developerInstructions
            ? String(developerInstructions)
            : null,
          value: normalizedValue,
        });
      }
      setModes(data);
      lastFetchedWorkspaceId.current = workspaceId;
      const preferredModeId =
        data.find((mode) => mode.mode === "code" || mode.id === "code")?.id ??
        data[0]?.id ??
        null;
      setSelectedModeId((currentSelection) => {
        const selection = currentSelection ?? selectedModeIdRef.current;
        if (!selection) {
          return preferredModeId;
        }
        if (!data.some((mode) => mode.id === selection)) {
          return preferredModeId;
        }
        return selection;
      });
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-client-collaboration-mode-list-error`,
        timestamp: Date.now(),
        source: "error",
        label: "collaborationMode/list error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      inFlight.current = false;
    }
  }, [enabled, isConnected, onDebug, workspaceId]);

  useEffect(() => {
    selectedModeIdRef.current = selectedModeId;
  }, [selectedModeId]);

  useEffect(() => {
    if (previousWorkspaceId.current !== workspaceId) {
      previousWorkspaceId.current = workspaceId;
      setModes([]);
      lastFetchedWorkspaceId.current = null;
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setModes([]);
      setSelectedModeId(null);
      lastFetchedWorkspaceId.current = null;
      return;
    }
    if (!workspaceId || !isConnected) {
      setModes([]);
      lastFetchedWorkspaceId.current = null;
      return;
    }
    const alreadyFetchedForWorkspace = lastFetchedWorkspaceId.current === workspaceId;
    if (alreadyFetchedForWorkspace) {
      return;
    }
    refreshModes("idle-prewarm");
  }, [enabled, isConnected, modes.length, refreshModes, workspaceId]);

  return {
    collaborationModes: modes,
    collaborationModesAvailable: Boolean(activeWorkspace),
    collaborationModesEnabled: enabled,
    selectedCollaborationMode: selectedMode,
    selectedCollaborationModeId: selectedModeId,
    setSelectedCollaborationModeId: setSelectedModeId,
    refreshCollaborationModes: refreshModes,
  };
}
