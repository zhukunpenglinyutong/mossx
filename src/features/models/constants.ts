/**
 * Model mapping constants and storage keys
 * Supports custom model name mapping similar to Claude CLI environment variables:
 * - ANTHROPIC_DEFAULT_HAIKU_MODEL
 * - ANTHROPIC_DEFAULT_OPUS_MODEL
 * - ANTHROPIC_DEFAULT_SONNET_MODEL
 */

/**
 * Model mapping configuration stored in localStorage
 * Maps base model IDs to custom model names (e.g., for GLM or other providers)
 */
export interface ModelMapping {
  /** Optional main model override (ANTHROPIC_MODEL) */
  main?: string;
  /** Custom model ID for Haiku (e.g., "glm-4.7-air") */
  haiku?: string;
  /** Custom model ID for Sonnet (e.g., "glm-4.7") */
  sonnet?: string;
  /** Custom model ID for Opus (e.g., "glm-4.7") */
  opus?: string;
}

/**
 * localStorage keys for model-related data
 */
export const STORAGE_KEYS = {
  /** Storage key for Claude model name mapping */
  CLAUDE_MODEL_MAPPING: "claude-model-mapping",
} as const;

const LEGACY_CLAUDE_MODEL_MAPPING_KEYS = [
  "mossx-claude-model-mapping",
  "codemoss-claude-model-mapping",
] as const;

/**
 * Mapping from model ID to mapping key
 * Used to apply custom display names to models
 */
export const MODEL_ID_TO_MAPPING_KEY: Record<string, keyof ModelMapping> = {
  sonnet: "sonnet",
  opus: "opus",
  haiku: "haiku",
  "claude-sonnet-4-5-20250929": "sonnet",
  "claude-sonnet-4-6": "sonnet",
  "claude-opus-4-5-20251101": "opus",
  "claude-opus-4-6": "opus",
  "claude-haiku-4-5": "haiku",
};

function inferModelFamilyKey(modelId: string): keyof ModelMapping | undefined {
  const normalized = modelId.toLowerCase();
  if (normalized.includes("haiku")) {
    return "haiku";
  }
  if (normalized.includes("sonnet")) {
    return "sonnet";
  }
  if (normalized.includes("opus-4-5") || normalized.includes("opus-4-6")) {
    return "opus";
  }
  return undefined;
}

function getMappingKeyForModel(modelId: string): keyof ModelMapping | undefined {
  return MODEL_ID_TO_MAPPING_KEY[modelId] ?? inferModelFamilyKey(modelId);
}

export function resolveModelMappingValue(
  modelId: string,
  mapping: ModelMapping,
): string | null {
  const key = getMappingKeyForModel(modelId);
  if (!key) {
    return null;
  }
  const mappedValue = mapping[key]?.trim();
  return mappedValue && mappedValue.length > 0 ? mappedValue : null;
}

/**
 * Get model mapping from localStorage
 */
export function getModelMapping(): ModelMapping {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  const candidateKeys = [
    STORAGE_KEYS.CLAUDE_MODEL_MAPPING,
    ...LEGACY_CLAUDE_MODEL_MAPPING_KEYS,
  ];
  for (const key of candidateKeys) {
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) {
        continue;
      }
      const parsed = JSON.parse(stored);
      // Basic validation: ensure all values are strings if present
      const mapping: ModelMapping = {};
      if (typeof parsed.main === "string" && parsed.main.trim()) {
        mapping.main = parsed.main.trim();
      }
      if (typeof parsed.haiku === "string" && parsed.haiku.trim()) {
        mapping.haiku = parsed.haiku.trim();
      }
      if (typeof parsed.sonnet === "string" && parsed.sonnet.trim()) {
        mapping.sonnet = parsed.sonnet.trim();
      }
      if (typeof parsed.opus === "string" && parsed.opus.trim()) {
        mapping.opus = parsed.opus.trim();
      }
      if (Object.keys(mapping).length > 0 || key === STORAGE_KEYS.CLAUDE_MODEL_MAPPING) {
        return mapping;
      }
    } catch {
      continue;
    }
  }
  return {};
}

/**
 * Save model mapping to localStorage
 */
export function saveModelMapping(mapping: ModelMapping): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const serialized = JSON.stringify(mapping);
    window.localStorage.setItem(STORAGE_KEYS.CLAUDE_MODEL_MAPPING, serialized);
    for (const legacyKey of LEGACY_CLAUDE_MODEL_MAPPING_KEYS) {
      window.localStorage.setItem(legacyKey, serialized);
    }
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Apply model mapping to a display name
 * @param baseDisplayName - The original display name
 * @param modelId - The model ID to look up in the mapping
 * @param mapping - The model mapping configuration
 * @returns The mapped display name, or the original if no mapping exists
 */
export function applyModelMapping(
  baseDisplayName: string,
  modelId: string,
  mapping: ModelMapping,
): string {
  return resolveModelMappingValue(modelId, mapping) ?? baseDisplayName;
}
