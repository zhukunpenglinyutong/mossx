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
  getOpenCodeCommandsList,
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

  const loadModelsForEngine = useCallback(
    async (engineType: EngineType, fallbackModels: EngineModelInfo[] = []) => {
      try {
        const models = await getEngineModels(engineType);
        if (models.length > 0) {
          setEngineModels(models);
          return;
        }
        // Keep fallback instead of clearing to empty, avoids transient "-" model state.
        setEngineModels(fallbackModels);
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-engine-models-load-error`,
          timestamp: Date.now(),
          source: "error",
          label: "engine/models load error",
          payload: {
            engine: engineType,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        setEngineModels(fallbackModels);
      }
    },
    [onDebug],
  );

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
      const [rawStatuses, currentEngine] = await Promise.all([
        detectEngines(),
        getActiveEngine(),
      ]);
      let statuses = rawStatuses;
      const opencodeIndex = statuses.findIndex((s) => s.engineType === "opencode");
      const opencodeInstalled = opencodeIndex >= 0 ? statuses[opencodeIndex]?.installed : false;
      if (!opencodeInstalled) {
        try {
          const commands = await getOpenCodeCommandsList(false);
          if (Array.isArray(commands) && commands.length > 0) {
            if (opencodeIndex >= 0) {
              statuses = [...statuses];
              statuses[opencodeIndex] = {
                ...statuses[opencodeIndex],
                installed: true,
                error: null,
                version: statuses[opencodeIndex]?.version ?? "unknown",
              };
            }
          }
        } catch {
          // Keep backend detection result when fallback probe fails.
        }
      }

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

      // Get models from the detected status first.
      const currentStatus = statuses.find((s) => s.engineType === currentEngine);
      if (currentStatus?.installed && currentStatus.models.length > 0) {
        setEngineModels(currentStatus.models);
      } else {
        setEngineModels([]);
      }

      // For OpenCode, always refresh from CLI model list to ensure "all models"
      // are shown independent of provider login status.
      if (currentStatus?.installed) {
        await loadModelsForEngine(currentEngine, currentStatus.models);
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
  }, [isDetecting, loadModelsForEngine, onDebug]);

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

        // Always refresh models from CLI and keep status models as fallback.
        await loadModelsForEngine(engineType, status.models);

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
    [activeEngine, engineStatuses, loadModelsForEngine, onDebug],
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
      void loadModelsForEngine(activeEngine, currentEngineStatus.models);
    }
  }, [
    workspaceId,
    isConnected,
    activeEngine,
    currentEngineStatus?.installed,
    currentEngineStatus?.models,
    loadModelsForEngine,
  ]);

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
