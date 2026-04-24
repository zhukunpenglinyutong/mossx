import { invoke } from "@tauri-apps/api/core";
import type {
  ClaudeCurrentConfig as VendorClaudeCurrentConfig,
  CodexProviderConfig as VendorCodexProviderConfig,
  ProviderConfig as VendorProviderConfig,
} from "../../features/vendors/types";

export async function getClaudeProviders(): Promise<VendorProviderConfig[]> {
  return invoke<VendorProviderConfig[]>("vendor_get_claude_providers");
}

export async function addClaudeProvider(provider: unknown): Promise<void> {
  return invoke("vendor_add_claude_provider", { provider });
}

export async function updateClaudeProvider(
  id: string,
  updates: unknown,
): Promise<void> {
  return invoke("vendor_update_claude_provider", { id, updates });
}

export async function deleteClaudeProvider(id: string): Promise<void> {
  return invoke("vendor_delete_claude_provider", { id });
}

export async function switchClaudeProvider(id: string): Promise<void> {
  return invoke("vendor_switch_claude_provider", { id });
}

export async function getCurrentClaudeConfig(): Promise<VendorClaudeCurrentConfig> {
  return invoke<VendorClaudeCurrentConfig>("vendor_get_current_claude_config");
}

export async function getClaudeAlwaysThinkingEnabled(): Promise<boolean> {
  return invoke<boolean>("vendor_get_claude_always_thinking_enabled");
}

export async function setClaudeAlwaysThinkingEnabled(
  enabled: boolean,
): Promise<void> {
  return invoke("vendor_set_claude_always_thinking_enabled", { enabled });
}

export async function getCodexProviders(): Promise<
  VendorCodexProviderConfig[]
> {
  return invoke<VendorCodexProviderConfig[]>("vendor_get_codex_providers");
}

export async function addCodexProvider(provider: unknown): Promise<void> {
  return invoke("vendor_add_codex_provider", { provider });
}

export async function updateCodexProvider(
  id: string,
  updates: unknown,
): Promise<void> {
  return invoke("vendor_update_codex_provider", { id, updates });
}

export async function deleteCodexProvider(id: string): Promise<void> {
  return invoke("vendor_delete_codex_provider", { id });
}

export async function switchCodexProvider(id: string): Promise<void> {
  return invoke("vendor_switch_codex_provider", { id });
}

export interface GeminiVendorSettings {
  enabled: boolean;
  env: Record<string, string>;
  authMode: string;
}

export interface GeminiVendorPreflightCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | string;
  message: string;
}

export interface GeminiVendorPreflightResult {
  checks: GeminiVendorPreflightCheck[];
}

export async function getGeminiVendorSettings(): Promise<GeminiVendorSettings> {
  return invoke<GeminiVendorSettings>("vendor_get_gemini_settings");
}

export async function saveGeminiVendorSettings(
  settings: GeminiVendorSettings,
): Promise<void> {
  return invoke("vendor_save_gemini_settings", { settings });
}

export async function getGeminiVendorPreflight(): Promise<GeminiVendorPreflightResult> {
  return invoke<GeminiVendorPreflightResult>("vendor_gemini_preflight");
}
