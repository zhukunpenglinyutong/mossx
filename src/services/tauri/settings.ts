import { invoke } from "@tauri-apps/api/core";
import type { CodexUnifiedExecExternalStatus } from "../../types";

export interface CodexRuntimeReloadResult {
  status: string;
  stage: string;
  restartedSessions: number;
  message?: string | null;
}

export async function getCodexConfigPath(): Promise<string> {
  return invoke<string>("get_codex_config_path");
}

export async function getCodexUnifiedExecExternalStatus(): Promise<CodexUnifiedExecExternalStatus> {
  return invoke<CodexUnifiedExecExternalStatus>(
    "get_codex_unified_exec_external_status",
  );
}

export async function restoreCodexUnifiedExecOfficialDefault(): Promise<CodexUnifiedExecExternalStatus> {
  return invoke<CodexUnifiedExecExternalStatus>(
    "restore_codex_unified_exec_official_default",
  );
}

export async function setCodexUnifiedExecOfficialOverride(
  enabled: boolean,
): Promise<CodexUnifiedExecExternalStatus> {
  return invoke<CodexUnifiedExecExternalStatus>(
    "set_codex_unified_exec_official_override",
    { enabled },
  );
}

export async function reloadCodexRuntimeConfig(): Promise<CodexRuntimeReloadResult> {
  return invoke<CodexRuntimeReloadResult>("reload_codex_runtime_config");
}
