import type { ComposerSessionSelection } from "./selectedComposerSession";
import type { EngineType, ModelOption } from "../types";

type GetEffectiveSelectedModelIdOptions = {
  activeEngine: EngineType;
  selectedModelId: string | null;
  activeThreadSelectedModelId: string | null;
  hasActiveThread: boolean;
  codexModels: ModelOption[];
  engineModelsAsOptions: ModelOption[];
  engineSelectedModelIdByType: Partial<Record<EngineType, string | null>>;
  defaultClaudeModelId: string;
};

type GetNextEngineSelectedModelIdOptions = {
  activeEngine: EngineType;
  engineModelsAsOptions: ModelOption[];
  currentSelection: string | null;
};

type GetEffectiveSelectedEffortOptions = {
  activeEngine: EngineType;
  hasActiveThread: boolean;
  selectedEffort: string | null;
  activeThreadSelection: ComposerSessionSelection | null;
  reasoningOptions: string[];
};

function findModelById(models: ModelOption[], id: string | null) {
  if (!id) {
    return null;
  }
  return (
    models.find((model) => model.id === id) ??
    models.find((model) => model.model === id) ??
    null
  );
}

function getDefaultModelId(models: ModelOption[]) {
  return models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? null;
}

function normalizeReasoningEffort(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getEffectiveModels(
  activeEngine: EngineType,
  codexModels: ModelOption[],
  engineModelsAsOptions: ModelOption[],
) {
  return activeEngine === "codex" ? codexModels : engineModelsAsOptions;
}

export function getNextEngineSelectedModelId({
  activeEngine,
  engineModelsAsOptions,
  currentSelection,
}: GetNextEngineSelectedModelIdOptions) {
  if (activeEngine === "codex" || engineModelsAsOptions.length === 0) {
    return null;
  }
  if (findModelById(engineModelsAsOptions, currentSelection)) {
    return null;
  }
  return getDefaultModelId(engineModelsAsOptions);
}

export function getEffectiveSelectedModelId({
  activeEngine,
  selectedModelId,
  activeThreadSelectedModelId,
  hasActiveThread,
  codexModels,
  engineModelsAsOptions,
  engineSelectedModelIdByType,
  defaultClaudeModelId,
}: GetEffectiveSelectedModelIdOptions) {
  if (activeEngine === "codex") {
    const selectedCodexModelId = findModelById(codexModels, selectedModelId)?.id ?? null;
    const threadCodexModelId =
      findModelById(codexModels, activeThreadSelectedModelId)?.id ?? null;
    const defaultCodexModelId = getDefaultModelId(codexModels);
    if (hasActiveThread) {
      return threadCodexModelId ?? selectedCodexModelId ?? defaultCodexModelId;
    }
    return selectedCodexModelId ?? defaultCodexModelId;
  }
  const engineSelection = engineSelectedModelIdByType[activeEngine] ?? null;
  if (engineModelsAsOptions.length === 0) {
    if (hasActiveThread) {
      return activeThreadSelectedModelId ?? (activeEngine === "claude" ? defaultClaudeModelId : null);
    }
    return activeEngine === "claude" ? engineSelection ?? defaultClaudeModelId : engineSelection;
  }
  if (hasActiveThread) {
    return (
      findModelById(engineModelsAsOptions, activeThreadSelectedModelId)?.id ??
      getDefaultModelId(engineModelsAsOptions)
    );
  }
  return (
    findModelById(engineModelsAsOptions, engineSelection)?.id ??
    getDefaultModelId(engineModelsAsOptions)
  );
}

export function getEffectiveSelectedEffort({
  activeEngine,
  hasActiveThread,
  selectedEffort,
  activeThreadSelection,
  reasoningOptions,
}: GetEffectiveSelectedEffortOptions) {
  const normalizedReasoningOptions = reasoningOptions.filter((option) => option.trim().length > 0);
  const normalizeEffort = (value: string | null) => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (
      normalizedReasoningOptions.length > 0 &&
      !normalizedReasoningOptions.includes(trimmed)
    ) {
      return normalizedReasoningOptions[0] ?? null;
    }
    return trimmed;
  };
  if (activeEngine !== "codex" || !hasActiveThread) {
    return normalizeEffort(selectedEffort);
  }
  if (!activeThreadSelection) {
    return normalizeEffort(selectedEffort);
  }
  return normalizeEffort(activeThreadSelection.effort);
}

export function getReasoningOptionsForModel(model: ModelOption | null): string[] {
  const supported = model?.supportedReasoningEfforts.map((effort) => effort.reasoningEffort) ?? [];
  if (supported.length > 0) {
    return supported;
  }
  const defaultEffort = normalizeReasoningEffort(model?.defaultReasoningEffort);
  return defaultEffort ? [defaultEffort] : [];
}

export function getEffectiveReasoningSupported(
  activeEngine: EngineType,
  codexReasoningSupported: boolean,
) {
  return activeEngine === "codex" ? codexReasoningSupported : false;
}
