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
  isWebServiceRuntime,
  switchEngine,
} from "../../../services/tauri";
import {
  STORAGE_KEYS as MODEL_STORAGE_KEYS,
  getModelMapping,
  applyModelMapping as applyMappingToDisplayName,
} from "../../models/constants";
import {
  STORAGE_KEYS as PROVIDER_STORAGE_KEYS,
  validateCodexCustomModels,
} from "../../composer/types/provider";

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

const GEMINI_VENDOR_UPDATED_EVENT = "mossx:gemini-vendor-updated";
const WEB_RUNTIME_DEFAULT_ENGINE: EngineType = "codex";
const WEB_RUNTIME_INITIAL_STATUSES: EngineStatus[] = [
  {
    engineType: "codex",
    installed: true,
    version: "web-service",
    binPath: null,
    features: {
      streaming: true,
      reasoning: true,
      toolUse: true,
      imageInput: true,
      sessionContinuation: true,
    },
    models: [],
    error: null,
  },
];
const GEMINI_DEFAULT_MODEL_ID = "gemini-2.5-flash-lite";
const GEMINI_PRESET_MODEL_IDS = [
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.1-pro-preview",
] as const;

function normalizeGeminiModelEntry(
  model: Partial<EngineModelInfo> & { id: string },
): EngineModelInfo {
  const normalizedId = model.id.trim();
  return {
    id: normalizedId,
    displayName:
      model.displayName && model.displayName.trim().length > 0
        ? model.displayName.trim()
        : normalizedId,
    description: model.description?.trim() ?? "",
    isDefault: Boolean(model.isDefault),
  };
}

function appendGeminiPresetModels(models: EngineModelInfo[]): EngineModelInfo[] {
  const merged: EngineModelInfo[] = [];
  const seenIds = new Set<string>();

  const pushModel = (model: Partial<EngineModelInfo> & { id: string }) => {
    const normalized = normalizeGeminiModelEntry(model);
    if (!normalized.id || seenIds.has(normalized.id)) {
      return;
    }
    seenIds.add(normalized.id);
    merged.push(normalized);
  };

  models.forEach(pushModel);
  GEMINI_PRESET_MODEL_IDS.forEach((id) => {
    pushModel({ id, displayName: id, description: id, isDefault: false });
  });

  return merged;
}

function enforceGeminiDefaultModel(models: EngineModelInfo[]): EngineModelInfo[] {
  if (!models.some((model) => model.id === GEMINI_DEFAULT_MODEL_ID)) {
    return models;
  }
  return models.map((model) => ({
    ...model,
    isDefault: model.id === GEMINI_DEFAULT_MODEL_ID,
  }));
}

function readCustomGeminiModels(): EngineModelInfo[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PROVIDER_STORAGE_KEYS.GEMINI_CUSTOM_MODELS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const models = validateCodexCustomModels(parsed);
    return models.map((model) => ({
      id: model.id,
      displayName: model.label?.trim() || model.id,
      description: model.description?.trim() ?? "",
      isDefault: false,
    }));
  } catch {
    return [];
  }
}

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
  const [engineStatuses, setEngineStatuses] = useState<EngineStatus[]>(() =>
    isWebServiceRuntime() ? WEB_RUNTIME_INITIAL_STATUSES : [],
  );
  const [activeEngine, setActiveEngineState] = useState<EngineType>(() =>
    isWebServiceRuntime() ? WEB_RUNTIME_DEFAULT_ENGINE : "claude",
  );
  const [engineModels, setEngineModels] = useState<EngineModelInfo[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [modelMapping, setModelMapping] = useState(getModelMapping);
  const [geminiCustomModelsVersion, setGeminiCustomModelsVersion] = useState(0);

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
        // Immediately switch visible model list to target engine snapshot to avoid
        // showing stale models from previous engine while CLI refresh is in flight.
        setEngineModels(status.models.length > 0 ? status.models : []);

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
    if (activeEngine === "gemini") {
      const customGeminiModels = readCustomGeminiModels();
      const customGeminiIds = new Set(
        customGeminiModels.map((model) => model.id),
      );
      const mergedModels =
        customGeminiModels.length === 0
          ? engineModels
          : [
              ...customGeminiModels,
              ...engineModels.filter(
                (model) => !customGeminiIds.has(model.id),
              ),
            ];
      return enforceGeminiDefaultModel(
        appendGeminiPresetModels(mergedModels),
      );
    }
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
  }, [activeEngine, engineModels, geminiCustomModelsVersion, modelMapping]);

  /**
   * Convert engine models to ModelOption format for UI compatibility
   */
  const engineModelsAsOptions = useMemo((): ModelOption[] => {
    return mappedEngineModels.map(engineModelToOption);
  }, [mappedEngineModels]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === MODEL_STORAGE_KEYS.CLAUDE_MODEL_MAPPING) {
        setModelMapping(getModelMapping());
      } else if (e.key === PROVIDER_STORAGE_KEYS.GEMINI_CUSTOM_MODELS) {
        setGeminiCustomModelsVersion((value) => value + 1);
      }
    };

    const handleCustomStorageChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === MODEL_STORAGE_KEYS.CLAUDE_MODEL_MAPPING) {
        setModelMapping(getModelMapping());
      } else if (
        customEvent.detail?.key === PROVIDER_STORAGE_KEYS.GEMINI_CUSTOM_MODELS
      ) {
        setGeminiCustomModelsVersion((value) => value + 1);
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

  useEffect(() => {
    const handleGeminiVendorUpdated = () => {
      void refreshEngines();
    };

    window.addEventListener(
      GEMINI_VENDOR_UPDATED_EVENT,
      handleGeminiVendorUpdated,
    );
    return () => {
      window.removeEventListener(
        GEMINI_VENDOR_UPDATED_EVENT,
        handleGeminiVendorUpdated,
      );
    };
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
