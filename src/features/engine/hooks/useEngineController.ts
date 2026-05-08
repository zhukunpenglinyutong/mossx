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
  isWebServiceRuntime,
  switchEngine,
} from "../../../services/tauri";
import {
  getClientStoreSync,
  writeClientStoreValue,
} from "../../../services/clientStorage";
import { pushGlobalRuntimeNotice } from "../../../services/globalRuntimeNotices";
import {
  STORAGE_KEYS as PROVIDER_STORAGE_KEYS,
  isValidModelId,
  validateCodexCustomModels,
} from "../../composer/types/provider";

type UseEngineControllerOptions = {
  activeWorkspace: WorkspaceInfo | null;
  enabledEngines?: Partial<Record<EngineType, boolean>>;
  onDebug?: (entry: DebugEntry) => void;
};

type RefreshEngineModelsOptions = {
  forceRefresh?: boolean;
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
  availabilityState?: "loading" | "ready" | "requires-login" | "unavailable";
  availabilityLabelKey?: string | null;
};

export type EngineRefreshResult = {
  availableEngines: EngineDisplayInfo[];
  activeEngine: EngineType;
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

function buildAvailableEngines(
  engineStatuses: EngineStatus[],
  isInitialized: boolean,
  enabledEngineTypes: EngineType[],
): EngineDisplayInfo[] {
  return enabledEngineTypes.map((engineType) => {
    const status = engineStatuses.find((entry) => entry.engineType === engineType) ?? null;
    const baseInfo = ENGINE_DISPLAY_MAP[engineType];
    let availabilityState: EngineDisplayInfo["availabilityState"] = "unavailable";
    let availabilityLabelKey: string | null = "sidebar.cliNotInstalled";

    if (!isInitialized) {
      availabilityState = "loading";
      availabilityLabelKey = "workspace.engineStatusLoading";
    } else if (status?.installed) {
      availabilityState = "ready";
      availabilityLabelKey = null;
    }

    return {
      type: engineType,
      displayName: baseInfo?.displayName ?? engineType,
      shortName: baseInfo?.shortName ?? engineType,
      installed: status?.installed ?? false,
      version: availabilityState === "loading" ? null : (status?.version ?? null),
      error: status?.error ?? null,
      availabilityState,
      availabilityLabelKey,
    };
  });
}

const GEMINI_VENDOR_UPDATED_EVENT = "ccgui:gemini-vendor-updated";
const WEB_RUNTIME_DEFAULT_ENGINE: EngineType = "codex";
const ENGINE_TYPES: EngineType[] = ["claude", "codex", "gemini", "opencode"];
const ENGINE_SELECTION_STORE = "composer";
const ENGINE_SELECTION_KEY = "selectedEngine";
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

const UNKNOWN_MODEL_SOURCE = "unknown";
const CUSTOM_MODEL_SOURCE = "custom";

function normalizeGeminiModelEntry(
  model: Partial<EngineModelInfo> & { id: string },
): EngineModelInfo {
  const normalizedId = model.id.trim();
  const normalizedModel = model.model?.trim() || normalizedId;
  return {
    id: normalizedId,
    model: normalizedModel,
    displayName:
      model.displayName && model.displayName.trim().length > 0
        ? model.displayName.trim()
        : normalizedId,
    description: model.description?.trim() ?? "",
    source: model.source?.trim() || UNKNOWN_MODEL_SOURCE,
    isDefault: Boolean(model.isDefault),
  };
}

function normalizeEngineModelEntry(
  model: Partial<EngineModelInfo> & { id: string },
  fallbackSource = UNKNOWN_MODEL_SOURCE,
): EngineModelInfo {
  const normalizedId = model.id.trim();
  const runtimeModel = model.model?.trim() || normalizedId;
  return {
    id: normalizedId,
    model: runtimeModel,
    displayName:
      model.displayName && model.displayName.trim().length > 0
        ? model.displayName.trim()
        : normalizedId,
    description: model.description?.trim() ?? "",
    source: model.source?.trim() || fallbackSource,
    isDefault: Boolean(model.isDefault),
  };
}

function getEngineModelIdentity(model: Pick<EngineModelInfo, "id" | "model">): string {
  const runtimeModel = model.model?.trim();
  if (runtimeModel && runtimeModel.length > 0) {
    return runtimeModel;
  }
  return model.id.trim();
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
      model: model.id,
      displayName: model.label?.trim() || model.id,
      description: model.description?.trim() ?? "",
      source: CUSTOM_MODEL_SOURCE,
      isDefault: false,
    }));
  } catch {
    return [];
  }
}

function readCustomClaudeModels(): EngineModelInfo[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PROVIDER_STORAGE_KEYS.CLAUDE_CUSTOM_MODELS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seenIds = new Set<string>();
    const models: EngineModelInfo[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const idValue = (entry as { id?: unknown }).id;
      if (typeof idValue !== "string") {
        continue;
      }
      const id = idValue.trim();
      if (!isValidModelId(id) || seenIds.has(id)) {
        continue;
      }
      const labelValue = (entry as { label?: unknown }).label;
      const descriptionValue = (entry as { description?: unknown }).description;
      models.push({
        id,
        model: id,
        displayName:
          typeof labelValue === "string" && labelValue.trim().length > 0
            ? labelValue.trim()
            : id,
        description:
          typeof descriptionValue === "string"
            ? descriptionValue.trim()
            : "",
        source: CUSTOM_MODEL_SOURCE,
        isDefault: false,
      });
      seenIds.add(id);
    }
    return models;
  } catch {
    return [];
  }
}

function mergeClaudeModelsPreserveDefault(
  engineModels: EngineModelInfo[],
  customModels: EngineModelInfo[],
): EngineModelInfo[] {
  if (customModels.length === 0) {
    return engineModels;
  }
  const engineDefaultIdentities = new Set(
    engineModels
      .filter((model) => model.isDefault)
      .map((model) => getEngineModelIdentity(model)),
  );
  const patchedCustomModels = customModels.map((model) => ({
    ...model,
    isDefault: engineDefaultIdentities.has(getEngineModelIdentity(model)),
    source: model.source?.trim() || CUSTOM_MODEL_SOURCE,
  }));
  const customRuntimeModels = new Set(
    patchedCustomModels.map((model) => getEngineModelIdentity(model)),
  );
  return [
    ...patchedCustomModels,
    ...engineModels.filter(
      (model) => !customRuntimeModels.has(getEngineModelIdentity(model)),
    ),
  ];
}

function isSupportedEngineType(value: unknown): value is EngineType {
  return (
    value === "claude" ||
    value === "codex" ||
    value === "gemini" ||
    value === "opencode"
  );
}

function readPersistedEngineSelection(): EngineType | null {
  const stored = getClientStoreSync<string>(
    ENGINE_SELECTION_STORE,
    ENGINE_SELECTION_KEY,
  );
  return isSupportedEngineType(stored) ? stored : null;
}

function persistEngineSelection(engineType: EngineType) {
  writeClientStoreValue(
    ENGINE_SELECTION_STORE,
    ENGINE_SELECTION_KEY,
    engineType,
    { immediate: true },
  );
}

/**
 * Convert EngineModelInfo to ModelOption format for UI compatibility
 */
function engineModelToOption(model: EngineModelInfo): ModelOption {
  const normalized = normalizeEngineModelEntry(model);
  return {
    id: normalized.id,
    model: normalized.model ?? normalized.id,
    displayName: normalized.displayName,
    description: normalized.description,
    source: normalized.source ?? UNKNOWN_MODEL_SOURCE,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: normalized.isDefault,
  };
}

/**
 * Hook for managing multi-engine state and selection
 */
export function useEngineController({
  activeWorkspace,
  enabledEngines,
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
  const [customModelsVersion, setCustomModelsVersion] = useState(0);

  // Track initialization
  const initRef = useRef(false);
  const detectPromiseRef = useRef<Promise<EngineRefreshResult | void> | null>(null);
  const lastWorkspaceId = useRef<string | null>(null);
  const previousAvailabilityRef = useRef<
    Partial<Record<EngineType, EngineDisplayInfo["availabilityState"]>>
  >({});

  const workspaceId = activeWorkspace?.id ?? null;
  const isConnected = Boolean(activeWorkspace?.connected);
  const geminiEnabled = enabledEngines?.gemini !== false;
  const opencodeEnabled = enabledEngines?.opencode !== false;
  const enabledEngineTypes = useMemo(
    () =>
      ENGINE_TYPES.filter((engineType) => {
        if (engineType === "gemini") {
          return geminiEnabled;
        }
        if (engineType === "opencode") {
          return opencodeEnabled;
        }
        return true;
      }),
    [geminiEnabled, opencodeEnabled],
  );

  const loadModelsForEngine = useCallback(
    async (
      engineType: EngineType,
      fallbackModels: EngineModelInfo[] = [],
      options: RefreshEngineModelsOptions = {},
    ) => {
      try {
        const models = options.forceRefresh
          ? await getEngineModels(engineType, { forceRefresh: true })
          : await getEngineModels(engineType);
        const sourceModels =
          models.length > 0 || options.forceRefresh ? models : fallbackModels;
        const nextModels = sourceModels.map((model) =>
          normalizeEngineModelEntry(model),
        );
        // Keep fallback instead of clearing to empty, avoids transient "-" model state.
        setEngineModels(nextModels);
        return nextModels;
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
        const normalizedFallback = fallbackModels.map((model) =>
          normalizeEngineModelEntry(model),
        );
        setEngineModels(normalizedFallback);
        return normalizedFallback;
      }
    },
    [onDebug],
  );

  const refreshEngineModels = useCallback(
    async (
      engineType: EngineType,
      options: RefreshEngineModelsOptions = {},
    ) => {
      const status = engineStatuses.find((entry) => entry.engineType === engineType);
      if (!status?.installed) {
        return;
      }
      const nextModels = await loadModelsForEngine(
        engineType,
        status.models,
        options,
      );
      if (options.forceRefresh && nextModels.length > 0) {
        setEngineStatuses((currentStatuses) =>
          currentStatuses.map((entry) =>
            entry.engineType === engineType
              ? { ...entry, models: nextModels }
              : entry,
          ),
        );
      }
    },
    [engineStatuses, loadModelsForEngine],
  );

  /**
   * Detect all installed engines
   */
  const refreshEngines = useCallback(async () => {
    if (detectPromiseRef.current) {
      return await detectPromiseRef.current;
    }

    const detectPromise = (async () => {
      setIsDetecting(true);

      onDebug?.({
        id: `${Date.now()}-engine-detect`,
        timestamp: Date.now(),
        source: "client",
        label: "engine/detect",
        payload: {},
      });

      try {
        const [rawStatuses, detectedEngine] = await Promise.all([
          detectEngines(),
          getActiveEngine(),
        ]);
        const statuses = rawStatuses.filter((status) =>
          enabledEngineTypes.includes(status.engineType),
        );

        let nextActiveEngine = detectedEngine;
        const detectedEngineInstalled = Boolean(
          statuses.find((status) => status.engineType === detectedEngine)?.installed,
        );
        if (!enabledEngineTypes.includes(detectedEngine) || !detectedEngineInstalled) {
          nextActiveEngine =
            statuses.find((status) => status.installed)?.engineType ??
            enabledEngineTypes[0] ??
            "claude";
        }
        const persistedEngine = readPersistedEngineSelection();
        const persistedEngineInstalled = persistedEngine
          ? Boolean(
              statuses.find((status) => status.engineType === persistedEngine)
                ?.installed,
            )
          : false;
        if (
          persistedEngine &&
          enabledEngineTypes.includes(persistedEngine) &&
          persistedEngineInstalled &&
          persistedEngine !== detectedEngine
        ) {
          try {
            await switchEngine(persistedEngine);
            nextActiveEngine = persistedEngine;
          } catch (error) {
            onDebug?.({
              id: `${Date.now()}-engine-restore-selection-error`,
              timestamp: Date.now(),
              source: "error",
              label: "engine/restore persisted selection error",
              payload: {
                engine: persistedEngine,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }

        onDebug?.({
          id: `${Date.now()}-engine-detect-result`,
          timestamp: Date.now(),
          source: "server",
          label: "engine/detect response",
          payload: { statuses, currentEngine: nextActiveEngine },
        });

        const nextAvailableEngines = buildAvailableEngines(
          statuses,
          true,
          enabledEngineTypes,
        );

        setEngineStatuses(statuses);
        setActiveEngineState(nextActiveEngine);
        setIsInitialized(true);

        // Get models from the detected status first.
        const currentStatus = statuses.find((s) => s.engineType === nextActiveEngine);
        if (currentStatus?.installed && currentStatus.models.length > 0) {
          setEngineModels(
            currentStatus.models.map((model) => normalizeEngineModelEntry(model)),
          );
        } else {
          setEngineModels([]);
        }

        // For OpenCode, always refresh from CLI model list to ensure "all models"
        // are shown independent of provider login status.
        if (currentStatus?.installed && nextActiveEngine !== "opencode") {
          await loadModelsForEngine(nextActiveEngine, currentStatus.models);
        }

        return {
          availableEngines: nextAvailableEngines,
          activeEngine: nextActiveEngine,
        };
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-engine-detect-error`,
          timestamp: Date.now(),
          source: "error",
          label: "engine/detect error",
          payload: error instanceof Error ? error.message : String(error),
        });
      } finally {
        detectPromiseRef.current = null;
        setIsDetecting(false);
      }
    })();

    detectPromiseRef.current = detectPromise;
    return await detectPromise;
  }, [enabledEngineTypes, loadModelsForEngine, onDebug]);

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
      const enabled = enabledEngineTypes.includes(engineType);
      if (!enabled || !status?.installed) {
        onDebug?.({
          id: `${Date.now()}-engine-switch-error`,
          timestamp: Date.now(),
          source: "error",
          label: "engine/switch error",
          payload: enabled
            ? `Engine ${engineType} is not installed`
            : `Engine ${engineType} is disabled`,
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
        persistEngineSelection(engineType);
        // Immediately switch visible model list to target engine snapshot to avoid
        // showing stale models from previous engine while CLI refresh is in flight.
        setEngineModels(
          status.models.length > 0
            ? status.models.map((model) => normalizeEngineModelEntry(model))
            : [],
        );

        // Always refresh models from CLI and keep status models as fallback.
        await refreshEngineModels(engineType);

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
    [activeEngine, enabledEngineTypes, engineStatuses, onDebug, refreshEngineModels],
  );

  /**
   * Get display information for all engines
   */
  const availableEngines = useMemo(
    () => buildAvailableEngines(engineStatuses, isInitialized, enabledEngineTypes),
    [enabledEngineTypes, engineStatuses, isInitialized],
  );

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
    // Keep memo output aligned with localStorage-backed custom model mutations.
    const storageRevision = customModelsVersion;
    void storageRevision;
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
      return engineModels.map((model) => normalizeEngineModelEntry(model));
    }
    const customClaudeModels = readCustomClaudeModels();
    const mergedModels = mergeClaudeModelsPreserveDefault(
      engineModels.map((model) => normalizeEngineModelEntry(model)),
      customClaudeModels,
    );
    return mergedModels;
  }, [activeEngine, engineModels, customModelsVersion]);

  /**
   * Convert engine models to ModelOption format for UI compatibility
   */
  const engineModelsAsOptions = useMemo((): ModelOption[] => {
    return mappedEngineModels.map(engineModelToOption);
  }, [mappedEngineModels]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === PROVIDER_STORAGE_KEYS.GEMINI_CUSTOM_MODELS ||
        e.key === PROVIDER_STORAGE_KEYS.CLAUDE_CUSTOM_MODELS
      ) {
        setCustomModelsVersion((value) => value + 1);
      }
    };

    const handleCustomStorageChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (
        customEvent.detail?.key === PROVIDER_STORAGE_KEYS.GEMINI_CUSTOM_MODELS ||
        customEvent.detail?.key === PROVIDER_STORAGE_KEYS.CLAUDE_CUSTOM_MODELS
      ) {
        setCustomModelsVersion((value) => value + 1);
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
    if (!initRef.current) {
      return;
    }
    void refreshEngines();
  }, [refreshEngines, geminiEnabled, opencodeEnabled]);

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
      void refreshEngineModels(activeEngine);
    }
  }, [
    workspaceId,
    isConnected,
    activeEngine,
    currentEngineStatus?.installed,
    refreshEngineModels,
  ]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const previousAvailability = previousAvailabilityRef.current;
    const nextAvailability: Partial<
      Record<EngineType, EngineDisplayInfo["availabilityState"]>
    > = {};

    availableEngines.forEach((engine) => {
      const nextState = engine.availabilityState ?? (engine.installed ? "ready" : "unavailable");
      const previousState = previousAvailability[engine.type];
      nextAvailability[engine.type] = nextState;

      if (nextState === previousState) {
        return;
      }

      let severity: "info" | "warning" = "info";
      let messageKey: string | null = null;

      if (nextState === "requires-login") {
        severity = "warning";
        messageKey = "runtimeNotice.engine.requiresLogin";
      } else if (nextState === "unavailable") {
        severity = "warning";
        messageKey = "runtimeNotice.engine.unavailable";
      } else if (
        nextState === "ready" &&
        previousState != null &&
        previousState !== "ready"
      ) {
        messageKey = "runtimeNotice.engine.ready";
      }

      if (!messageKey) {
        return;
      }

      pushGlobalRuntimeNotice({
        severity,
        category: "diagnostic",
        messageKey,
        messageParams: {
          engine: engine.displayName,
        },
        dedupeKey: `engine:${engine.type}:${nextState}`,
      });
    });

    previousAvailabilityRef.current = nextAvailability;
  }, [availableEngines, isInitialized]);

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
    refreshEngineModels,
  };
}
