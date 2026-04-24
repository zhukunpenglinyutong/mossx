import { invoke } from "@tauri-apps/api/core";
import type {
  ComputerUseActivationResult,
  ComputerUseBrokerRequest,
  ComputerUseBrokerResult,
  ComputerUseBridgeStatus,
  ComputerUseHostContractDiagnosticsResult,
} from "../../types";

export async function getComputerUseBridgeStatus(): Promise<ComputerUseBridgeStatus> {
  return invoke<ComputerUseBridgeStatus>("get_computer_use_bridge_status");
}

export async function runComputerUseActivationProbe(): Promise<ComputerUseActivationResult> {
  return invoke<ComputerUseActivationResult>(
    "run_computer_use_activation_probe",
  );
}

export async function runComputerUseHostContractDiagnostics(): Promise<ComputerUseHostContractDiagnosticsResult> {
  return invoke<ComputerUseHostContractDiagnosticsResult>(
    "run_computer_use_host_contract_diagnostics",
  );
}

export async function runComputerUseCodexBroker(
  request: ComputerUseBrokerRequest,
): Promise<ComputerUseBrokerResult> {
  return invoke<ComputerUseBrokerResult>("run_computer_use_codex_broker", {
    request,
  });
}
