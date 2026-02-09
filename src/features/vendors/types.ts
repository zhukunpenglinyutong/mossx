/**
 * 供应商配置相关类型定义
 * 数据格式与 idea-claude-code-gui 项目完全兼容
 */

// ============ Constants ============

export const STORAGE_KEYS = {
  CODEX_CUSTOM_MODELS: 'codex-custom-models',
  /** @deprecated Use STORAGE_KEYS from features/models/constants instead for model mapping */
  CLAUDE_MODEL_MAPPING: 'codemoss-claude-model-mapping',
} as const;

export const MODEL_ID_PATTERN = /^[a-zA-Z0-9._\-/:]+$/;

// ============ Validation Helpers ============

export function isValidModelId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 256) return false;
  return MODEL_ID_PATTERN.test(trimmed);
}

export function isValidCodexCustomModel(model: unknown): model is CodexCustomModel {
  if (!model || typeof model !== 'object') return false;
  const obj = model as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !isValidModelId(obj.id)) return false;
  if (typeof obj.label !== 'string' || obj.label.trim().length === 0) return false;
  if (obj.description !== undefined && typeof obj.description !== 'string') return false;
  return true;
}

export function validateCodexCustomModels(models: unknown): CodexCustomModel[] {
  if (!Array.isArray(models)) return [];
  return models.filter(isValidCodexCustomModel);
}

// ============ Types ============

export type ProviderCategory =
  | 'official'
  | 'cn_official'
  | 'aggregator'
  | 'third_party'
  | 'custom';

export interface ProviderConfig {
  id: string;
  name: string;
  remark?: string;
  websiteUrl?: string;
  category?: ProviderCategory;
  createdAt?: number;
  isActive?: boolean;
  source?: 'cc-switch' | string;
  isLocalProvider?: boolean;
  settingsConfig?: {
    env?: {
      ANTHROPIC_AUTH_TOKEN?: string;
      ANTHROPIC_BASE_URL?: string;
      ANTHROPIC_MODEL?: string;
      ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
      ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
      ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
      [key: string]: any;
    };
    alwaysThinkingEnabled?: boolean;
    permissions?: {
      allow?: string[];
      deny?: string[];
    };
  };
}

export interface CodexCustomModel {
  id: string;
  label: string;
  description?: string;
}

export interface CodexProviderConfig {
  id: string;
  name: string;
  remark?: string;
  createdAt?: number;
  isActive?: boolean;
  configToml?: string;
  authJson?: string;
  customModels?: CodexCustomModel[];
}

export type VendorTab = "claude" | "codex";
