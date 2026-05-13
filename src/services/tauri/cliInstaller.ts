import { invoke } from "@tauri-apps/api/core";
import type {
  CliInstallAction,
  CliInstallEngine,
  CliInstallPlan,
  CliInstallResult,
  CliInstallStrategy,
} from "../../types";

export async function getCliInstallPlan(
  engine: CliInstallEngine,
  action: CliInstallAction,
  strategy: CliInstallStrategy = "npmGlobal",
): Promise<CliInstallPlan> {
  return invoke<CliInstallPlan>("cli_install_plan", {
    engine,
    action,
    strategy,
  });
}

export async function runCliInstaller(
  engine: CliInstallEngine,
  action: CliInstallAction,
  strategy: CliInstallStrategy = "npmGlobal",
  runId?: string,
): Promise<CliInstallResult> {
  return invoke<CliInstallResult>("cli_install_run", {
    engine,
    action,
    strategy,
    runId,
  });
}
