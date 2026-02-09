import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DebugEntry,
  EngineModelInfo,
  EngineStatus,
  EngineType,
  ModelOption,
  WorkspaceInfo,
} from "../../../types";
import {
  detectEngines,
  getActiveEngine,
  getEngineModels,
  switchEngine,
} from "../../../services/tauri";
import {
  STORAGE_KEYS,
  getModelMapping,
  applyModelMapping as applyMappingToDisplayName,
} from "../../models/constants";

type UseEngineControllerOptions = {
  activeWorkspace: WorkspaceInfo | null;
  onDebug?: (entry: DebugEntry) => void;
};

/**
 * Engine display information for UI
 */
export type EngineDisplayInfo = {
  type: EngineType;
  displayName: string;
  shortName: string;
  installed: boolean;
  version: string | null;
  error: string | null;
};

/**
 * Map engine type to display information
 */
const ENGINE_DISPLAY_MAP: Record<
  EngineType,
  { displayName: string; shortName: string }
> = {
  claude: { displayName: "Claude Code", shortName: "Claude Code" },
  codex: { displayName: "Codex CLI", shortName: "Codex" },
  gemini: { displayName: "Gemini CLI", shortName: "Gemini" },
  opencode: { displayName: "OpenCode", shortName: "OpenCode" },
};

/**
 * Convert EngineModelInfo to ModelOption format for UI compatibility
 */
function engineModelToOption(model: EngineModelInfo): ModelOption {
  return {
    id: model.id,
    model: model.id,
    displayName: model.displayName,
    description: model.description,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: model.isDefault,
  };
}

/**
 * Hook for managing multi-engine state and selection
 */
export function useEngineController({
  activeWorkspace,
  onDebug,
}: UseEngineControllerOptions) {
  // Engine detection state
  const [engineStatuses, setEngineStatuses] = useState<EngineStatus[]>([]);
  const [activeEngine, setActiveEngineState] = useState<EngineType>("claude");
  const [engineModels, setEngineModels] = useState<EngineModelInfo[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [modelMapping, setModelMapping] = useState(getModelMapping);

  // Track initialization
  const initRef = useRef(false);
  const lastWorkspaceId = useRef<string | null>(null);

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);

  /**
   * Detect all installed engines
   */
  const refreshEngines = useCallback(async () => {
    if (isDetecting) {
      return;
    }
    setIsDetecting(true);

    onDebug?.({
      id: `${Date.now()}-engine-detect`,
      timestamp: Date.now(),
      source: "client",
      label: "engine/detect",
      payload: {},
    });

    try {
      const [statuses, currentEngine] = await Promise.all([
        detectEngines(),
        getActiveEngine(),
      ]);

      onDebug?.({
        id: `${Date.now()}-engine-detect-result`,
        timestamp: Date.now(),
        source: "server",
        label: "engine/detect response",
        payload: { statuses, currentEngine },
      });

      setEngineStatuses(statuses);
      setActiveEngineState(currentEngine);
      setIsInitialized(true);

      // Get models from the detected status (already included in detectEngines response)
      const currentStatus = statuses.find((s) => s.engineType === currentEngine);
      if (currentStatus?.installed && currentStatus.models.length > 0) {
        // Convert EngineStatus.models to EngineModelInfo format
        setEngineModels(currentStatus.models);
      } else if (currentStatus?.installed) {
        // Fallback: fetch models separately if not included in status
        try {
          const models = await getEngineModels(currentEngine);
          setEngineModels(models);
        } catch {
          // Use empty models if fetch fails
          setEngineModels([]);
        }
      }
    } catch (error) {
      onDebug?.({
        id: `${Date.now()}-engine-detect-error`,
        timestamp: Date.now(),
        source: "error",
        label: "engine/detect error",
        payload: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDetecting(false);
    }
  }, [isDetecting, onDebug]);

  /**
   * Switch to a different engine
   */
  const setActiveEngine = useCallback(
    async (engineType: EngineType) => {
      if (engineType === activeEngine) {
        return;
      }

      // Check if engine is installed
      const status = engineStatuses.find((s) => s.engineType === engineType);
      if (!status?.installed) {
        onDebug?.({
          id: `${Date.now()}-engine-switch-error`,
          timestamp: Date.now(),
          source: "error",
          label: "engine/switch error",
          payload: `Engine ${engineType} is not installed`,
        });
        return;
      }

      onDebug?.({
        id: `${Date.now()}-engine-switch`,
        timestamp: Date.now(),
        source: "client",
        label: "engine/switch",
        payload: { from: activeEngine, to: engineType },
      });

      try {
        await switchEngine(engineType);
        setActiveEngineState(engineType);

        // Use models from cached status first
        if (status.models.length > 0) {
          setEngineModels(status.models);
        } else {
          // Fallback: fetch models separately if not in status
          try {
            const models = await getEngineModels(engineType);
            setEngineModels(models);
          } catch {
            setEngineModels([]);
          }
        }

        onDebug?.({
          id: `${Date.now()}-engine-switch-success`,
          timestamp: Date.now(),
          source: "server",
          label: "engine/switch success",
          payload: { engine: engineType, models: status.models },
        });
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-engine-switch-error`,
          timestamp: Date.now(),
          source: "error",
          label: "engine/switch error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [activeEngine, engineStatuses, onDebug],
  );

  /**
   * Get display information for all engines
   */
  const availableEngines = useMemo((): EngineDisplayInfo[] => {
    return engineStatuses.map((status) => ({
      type: status.engineType,
      displayName:
        ENGINE_DISPLAY_MAP[status.engineType]?.displayName ?? status.engineType,
      shortName:
        ENGINE_DISPLAY_MAP[status.engineType]?.shortName ?? status.engineType,
      installed: status.installed,
      version: status.version,
      error: status.error,
    }));
  }, [engineStatuses]);

  /**
   * Get display information for installed engines only
   */
  const installedEngines = useMemo((): EngineDisplayInfo[] => {
    return availableEngines.filter((e) => e.installed);
  }, [availableEngines]);

  /**
   * Get current engine status
   */
  const currentEngineStatus = useMemo((): EngineStatus | null => {
    return engineStatuses.find((s) => s.engineType === activeEngine) ?? null;
  }, [engineStatuses, activeEngine]);

  /**
   * Get current engine display info
   */
  const currentEngineDisplay = useMemo((): EngineDisplayInfo | null => {
    return availableEngines.find((e) => e.type === activeEngine) ?? null;
  }, [availableEngines, activeEngine]);

  /**
   * Check if multiple engines are available
   */
  const hasMultipleEngines = useMemo(() => {
    return installedEngines.length > 1;
  }, [installedEngines]);

  const mappedEngineModels = useMemo((): EngineModelInfo[] => {
    if (activeEngine !== "claude") {
      return engineModels;
    }
    return engineModels.map((model) => ({
      ...model,
      displayName: applyMappingToDisplayName(
        model.displayName,
        model.id,
        modelMapping,
      ),
    }));
  }, [activeEngine, engineModels, modelMapping]);

  /**
   * Convert engine models to ModelOption format for UI compatibility
   */
  const engineModelsAsOptions = useMemo((): ModelOption[] => {
    return mappedEngineModels.map(engineModelToOption);
  }, [mappedEngineModels]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.CLAUDE_MODEL_MAPPING) {
        setModelMapping(getModelMapping());
      }
    };

    const handleCustomStorageChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.CLAUDE_MODEL_MAPPING) {
        setModelMapping(getModelMapping());
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("localStorageChange", handleCustomStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("localStorageChange", handleCustomStorageChange);
    };
  }, []);

  // Initialize on mount
  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;
    refreshEngines();
  }, [refreshEngines]);

  // Reset models when workspace changes
  useEffect(() => {
    if (workspaceId === lastWorkspaceId.current) {
      return;
    }
    lastWorkspaceId.current = workspaceId;
    // Optionally refresh models when workspace changes
    if (workspaceId && isConnected && currentEngineStatus?.installed) {
      getEngineModels(activeEngine)
        .then(setEngineModels)
        .catch(() => {
          // Ignore errors silently
        });
    }
  }, [workspaceId, isConnected, activeEngine, currentEngineStatus?.installed]);

  return {
    // State
    activeEngine,
    engineStatuses,
    engineModels,
    engineModelsAsOptions,
    isDetecting,
    isInitialized,

    // Computed
    availableEngines,
    installedEngines,
    currentEngineStatus,
    currentEngineDisplay,
    hasMultipleEngines,

    // Actions
    setActiveEngine,
    refreshEngines,
  };
}
