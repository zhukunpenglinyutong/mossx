import { invoke } from "@tauri-apps/api/core";

export async function openTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<{ id: string }> {
  return invoke("terminal_open", { workspaceId, terminalId, cols, rows });
}

export async function writeTerminalSession(
  workspaceId: string,
  terminalId: string,
  data: string,
): Promise<void> {
  return invoke("terminal_write", { workspaceId, terminalId, data });
}

export async function resizeTerminalSession(
  workspaceId: string,
  terminalId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("terminal_resize", { workspaceId, terminalId, cols, rows });
}

export async function closeTerminalSession(
  workspaceId: string,
  terminalId: string,
): Promise<void> {
  return invoke("terminal_close", { workspaceId, terminalId });
}

export type RuntimeLogSessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";

export type RuntimeLogSessionSnapshot = {
  workspaceId: string;
  terminalId: string;
  status: RuntimeLogSessionStatus;
  commandPreview: string | null;
  profileId?: string | null;
  detectedStack?: string | null;
  startedAtMs: number | null;
  stoppedAtMs: number | null;
  exitCode: number | null;
  error: string | null;
};

export type RuntimeProfileDescriptor = {
  id: string;
  defaultCommand: string;
  detectedStack: string;
};

export async function runtimeLogDetectProfiles(
  workspaceId: string,
): Promise<RuntimeProfileDescriptor[]> {
  return invoke("runtime_log_detect_profiles", { workspaceId });
}

export async function runtimeLogStart(
  workspaceId: string,
  options?: {
    profileId?: string | null;
    commandOverride?: string | null;
  },
): Promise<RuntimeLogSessionSnapshot> {
  return invoke("runtime_log_start", {
    workspaceId,
    profileId: options?.profileId ?? null,
    commandOverride: options?.commandOverride ?? null,
  });
}

export async function runtimeLogStop(
  workspaceId: string,
): Promise<RuntimeLogSessionSnapshot> {
  return invoke("runtime_log_stop", { workspaceId });
}

export async function runtimeLogGetSession(
  workspaceId: string,
): Promise<RuntimeLogSessionSnapshot | null> {
  return invoke("runtime_log_get_session", { workspaceId });
}

export async function runtimeLogMarkExit(
  workspaceId: string,
  exitCode: number,
): Promise<RuntimeLogSessionSnapshot> {
  return invoke("runtime_log_mark_exit", { workspaceId, exitCode });
}
