import { useCallback, useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ButtonAreaProps, ModelInfo, PermissionMode, ReasoningEffort } from './types';
import { ConfigSelect, ModelSelect, ModeSelect, ProviderSelect, ReasoningSelect, ShortcutActionsSelect } from './selectors';
import { CLAUDE_MODELS, CODEX_MODELS } from './types';
import { STORAGE_KEYS, validateCodexCustomModels } from '../../types/provider';
import type { CodexCustomModel } from '../../types/provider';

// Stable no-op callbacks to avoid re-renders when optional handlers are not provided
const NOOP_MODE = (_mode: PermissionMode) => {};
const NOOP_MODEL = (_modelId: string) => {};
const NOOP_REASONING = (_effort: ReasoningEffort) => {};
const CLAUDE_MODEL_MAPPING_KEY_BY_ID: Record<string, 'haiku' | 'sonnet' | 'opus'> = {
  'claude-haiku-4-5': 'haiku',
  'claude-sonnet-4-6': 'sonnet',
  'claude-opus-4-6': 'opus',
};

/**
 * Get custom Codex model list from localStorage
 * Uses runtime type validation for data safety
 */
function getCustomCodexModels(): ModelInfo[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.CODEX_CUSTOM_MODELS);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    // Use runtime type validation
    const validModels = validateCodexCustomModels(parsed);
    return validModels.map(m => ({
      id: m.id,
      label: m.label || m.id,
      description: m.description,
    }));
  } catch {
    return [];
  }
}

/**
 * Get custom Claude model list from localStorage
 * Uses runtime type validation for data safety
 */
function getCustomClaudeModels(): ModelInfo[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.CLAUDE_CUSTOM_MODELS);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as CodexCustomModel[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((m): m is CodexCustomModel => !!m && typeof m === 'object' && typeof m.id === 'string' && m.id.trim().length > 0)
      .map(m => ({
        id: m.id,
        label: m.label || m.id,
        description: m.description,
      }));
  } catch {
    return [];
  }
}

/**
 * Get custom Gemini model list from localStorage
 * Uses runtime type validation for data safety
 */
function getCustomGeminiModels(): ModelInfo[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.GEMINI_CUSTOM_MODELS);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    const validModels = validateCodexCustomModels(parsed);
    return validModels.map(m => ({
      id: m.id,
      label: m.label || m.id,
      description: m.description,
    }));
  } catch {
    return [];
  }
}

/**
 * ButtonArea - Bottom toolbar component
 * Contains mode selector, model selector, attachment button, prompt enhancer button, send/stop button
 */
export const ButtonArea = ({
  disabled = false,
  hasInputContent = false,
  isLoading = false,
  streamActivityPhase = 'idle',
  selectedModel = '',
  models,
  permissionMode = 'bypassPermissions',
  currentProvider = 'claude',
  providerAvailability,
  providerVersions,
  reasoningEffort = 'medium',
  accountRateLimits,
  usageShowRemaining = false,
  onRefreshAccountRateLimits,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  codexSpeedMode,
  onCodexSpeedModeChange,
  onCodexReviewQuickStart,
  onSubmit,
  onStop,
  onModeSelect,
  onModelSelect,
  onProviderSelect,
  onReasoningChange,
  alwaysThinkingEnabled = false,
  onToggleThinking,
  streamingEnabled = true,
  onStreamingEnabledChange,
  sendShortcut = 'enter',
  selectedAgent,
  onAgentSelect,
  onOpenAgentSettings,
  onAddModel,
  shortcutActions,
}: ButtonAreaProps) => {
  const { t } = useTranslation();
  // const fileInputRef = useRef<HTMLInputElement>(null);
  const isPlanModeEnabled = (selectedCollaborationModeId ?? 'code') === 'plan';
  const supportsStreamActivityPhaseFx =
    currentProvider === 'codex' ||
    currentProvider === 'claude' ||
    currentProvider === 'gemini';
  const resolvedStopButtonPhase =
    supportsStreamActivityPhaseFx ? streamActivityPhase : 'idle';

  // Track changes to custom models in localStorage
  // When localStorage changes, updating this version number triggers useMemo recalculation
  const [customModelsVersion, setCustomModelsVersion] = useState(0);

  // Listen for localStorage changes (cross-tab sync + same-tab custom events)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === STORAGE_KEYS.CODEX_CUSTOM_MODELS ||
        e.key === STORAGE_KEYS.CLAUDE_MODEL_MAPPING ||
        e.key === STORAGE_KEYS.CLAUDE_CUSTOM_MODELS ||
        e.key === STORAGE_KEYS.GEMINI_CUSTOM_MODELS
      ) {
        setCustomModelsVersion(v => v + 1);
      }
    };

    // Listen for custom events (localStorage changes within the same tab)
    const handleCustomStorageChange = (e: CustomEvent<{ key: string }>) => {
      if (
        e.detail.key === STORAGE_KEYS.CODEX_CUSTOM_MODELS ||
        e.detail.key === STORAGE_KEYS.CLAUDE_MODEL_MAPPING ||
        e.detail.key === STORAGE_KEYS.CLAUDE_CUSTOM_MODELS ||
        e.detail.key === STORAGE_KEYS.GEMINI_CUSTOM_MODELS
      ) {
        setCustomModelsVersion(v => v + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageChange', handleCustomStorageChange as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageChange', handleCustomStorageChange as EventListener);
    };
  }, []);

  /**
   * Apply model name mapping
   * Maps base model IDs to actual model names (e.g., versions with capacity suffixes)
   */
  const applyModelMapping = useCallback((model: ModelInfo, mapping: { haiku?: string; sonnet?: string; opus?: string }): ModelInfo => {
    const key = CLAUDE_MODEL_MAPPING_KEY_BY_ID[model.id];
    if (key && mapping[key]) {
      const actualModel = String(mapping[key]).trim();
      if (actualModel.length > 0) {
        // Keep the original id as unique identifier, only modify label to custom name
        // This ensures id remains unique even if multiple models share the same displayName
        return { ...model, label: actualModel };
      }
    }
    return model;
  }, []);

  // Select model list based on current provider
  // customModelsVersion triggers recalculation when localStorage changes
  const availableModels = useMemo(() => {
    if (currentProvider === 'gemini') {
      const dynamicModels = Array.isArray(models) ? models : [];
      const customModels = getCustomGeminiModels();
      if (customModels.length > 0) {
        const customIds = new Set(customModels.map(m => m.id));
        const filteredDynamicModels = dynamicModels.filter(m => !customIds.has(m.id));
        const merged = [...customModels, ...filteredDynamicModels];
        if (merged.length > 0) {
          return merged;
        }
      }
      if (dynamicModels.length > 0) {
        return dynamicModels;
      }
      if (selectedModel && selectedModel.trim().length > 0) {
        return [{ id: selectedModel, label: selectedModel }];
      }
      return [];
    }
    if (currentProvider !== 'claude' && currentProvider !== 'codex') {
      if (Array.isArray(models) && models.length > 0) {
        return models;
      }
      if (selectedModel && selectedModel.trim().length > 0) {
        return [{ id: selectedModel, label: selectedModel }];
      }
      return [];
    }
    if (currentProvider === 'codex') {
      const dynamicModels = Array.isArray(models) ? models : [];
      if (dynamicModels.length > 0) {
        return dynamicModels;
      }
      // Fallback to built-in defaults only when backend model list is unavailable.
      const customModels = getCustomCodexModels();
      if (customModels.length === 0) {
        return CODEX_MODELS;
      }
      // Custom models first, built-in models after
      // Filter out built-in models that duplicate custom models
      const customIds = new Set(customModels.map(m => m.id));
      const filteredBuiltIn = CODEX_MODELS.filter(m => !customIds.has(m.id));
      return [...customModels, ...filteredBuiltIn];
    }
    const dynamicClaudeModels = Array.isArray(models) ? models : [];
    const baseClaudeModels = dynamicClaudeModels.length > 0 ? dynamicClaudeModels : CLAUDE_MODELS;
    if (typeof window === 'undefined' || !window.localStorage) {
      return baseClaudeModels;
    }

    // Apply model mapping to base Claude models
    let builtInModels = baseClaudeModels;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEYS.CLAUDE_MODEL_MAPPING);
      if (stored) {
        const mapping = JSON.parse(stored) as {
          main?: string;
          haiku?: string;
          sonnet?: string;
          opus?: string;
        };
        builtInModels = baseClaudeModels.map((m) => applyModelMapping(m, mapping));
      }
    } catch {
      // ignore
    }

    // Merge custom models (displayed before built-in models)
    const customModels = getCustomClaudeModels();
    if (customModels.length === 0) {
      return builtInModels;
    }
    // Filter out built-in models that duplicate custom models
    const customIds = new Set(customModels.map(m => m.id));
    const filteredBuiltIn = builtInModels.filter(m => !customIds.has(m.id));
    return [...customModels, ...filteredBuiltIn];
  }, [currentProvider, models, selectedModel, applyModelMapping, customModelsVersion]);

  /**
   * Handle submit button click
   */
  const handleSubmitClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSubmit?.();
  }, [onSubmit]);

  /**
   * Handle stop button click
   */
  const handleStopClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onStop?.();
  }, [onStop]);

  /**
   * Handle provider selection
   */
  const handleProviderSelect = useCallback((providerId: string) => {
    onProviderSelect?.(providerId);
  }, [onProviderSelect]);

  const handlePlanModeToggle = useCallback(() => {
    if (!onSelectCollaborationMode) {
      return;
    }
    onSelectCollaborationMode(isPlanModeEnabled ? 'code' : 'plan');
  }, [isPlanModeEnabled, onSelectCollaborationMode]);

  const handleAddModel = useCallback(() => {
    if (!onAddModel) {
      return;
    }
    const targetProvider =
      currentProvider === "codex"
        ? "codex"
        : currentProvider === "gemini"
          ? "gemini"
          : "claude";
    onAddModel(targetProvider);
  }, [currentProvider, onAddModel]);

  return (
    <div className="button-area" data-provider={currentProvider}>
      {/* Left side: selectors */}
      <div className="button-area-left">
        <ConfigSelect
          currentProvider={currentProvider}
          onProviderChange={handleProviderSelect}
          providerAvailability={providerAvailability}
          providerVersions={providerVersions}
          alwaysThinkingEnabled={alwaysThinkingEnabled}
          onToggleThinking={onToggleThinking}
          streamingEnabled={streamingEnabled}
          onStreamingEnabledChange={onStreamingEnabledChange}
          accountRateLimits={accountRateLimits}
          usageShowRemaining={usageShowRemaining}
          onRefreshAccountRateLimits={onRefreshAccountRateLimits}
          selectedCollaborationModeId={selectedCollaborationModeId}
          onSelectCollaborationMode={onSelectCollaborationMode}
          codexSpeedMode={codexSpeedMode}
          onCodexSpeedModeChange={onCodexSpeedModeChange}
          onCodexReviewQuickStart={onCodexReviewQuickStart}
          selectedAgent={selectedAgent}
          onAgentSelect={onAgentSelect}
          onOpenAgentSettings={onOpenAgentSettings}
        />
        <ShortcutActionsSelect actions={shortcutActions} />
        {onProviderSelect && (
          <ProviderSelect
            value={currentProvider}
            onChange={handleProviderSelect}
            providerAvailability={providerAvailability}
            providerVersions={providerVersions}
            iconOnly
          />
        )}
        <ModeSelect value={permissionMode} onChange={onModeSelect ?? NOOP_MODE} provider={currentProvider} />
        <ModelSelect
          value={selectedModel}
          onChange={onModelSelect ?? NOOP_MODEL}
          models={availableModels}
          currentProvider={currentProvider}
          onAddModel={
            onAddModel &&
            (currentProvider === "claude" ||
              currentProvider === "codex" ||
              currentProvider === "gemini")
              ? handleAddModel
              : undefined
          }
        />
        {currentProvider === 'codex' && (
          <ReasoningSelect value={reasoningEffort} onChange={onReasoningChange ?? NOOP_REASONING} />
        )}
        {currentProvider === 'codex' && isPlanModeEnabled && (
          <button
            className={`selector-button selector-plan-mode-button ${isPlanModeEnabled ? 'active' : ''}`}
            onClick={handlePlanModeToggle}
            title={t('composer.planModeToggle')}
            disabled={!onSelectCollaborationMode}
          >
            <span className="codicon codicon-git-branch" />
            <span className="selector-button-text">
              {t('composer.planModeShort')}
            </span>
          </button>
        )}
      </div>

      {/* Right side: tool buttons */}
      <div className="button-area-right">
        {/* Enhance prompt button - temporarily hidden */}
        {/* <button
          className="enhance-prompt-button has-tooltip"
          onClick={handleEnhanceClick}
          disabled={disabled || !hasInputContent || isLoading || isEnhancing}
          data-tooltip={`${t('promptEnhancer.tooltip')} (${t('promptEnhancer.shortcut')})`}
        >
          <span className={`codicon ${isEnhancing ? 'codicon-loading codicon-modifier-spin' : 'codicon-sparkle'}`} />
        </button> */}

        {/* Send/Stop button */}
        {isLoading ? (
          <button
            className={`submit-button stop-button is-${resolvedStopButtonPhase}`}
            onClick={handleStopClick}
            title={t('chat.stopGeneration')}
            data-stream-phase={resolvedStopButtonPhase}
          >
            <span className="codicon codicon-debug-stop" />
          </button>
        ) : (
          <button
            className="submit-button"
            onClick={handleSubmitClick}
            disabled={disabled || !hasInputContent}
            title={
              sendShortcut === 'cmdEnter'
                ? t('chat.sendMessageCmdEnter')
                : t('chat.sendMessageEnter')
            }
          >
            <span className="codicon codicon-send" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ButtonArea;
