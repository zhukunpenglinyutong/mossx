import { invoke } from "@tauri-apps/api/core";
import type { ComputerUseBridgeStatus } from "../../types";

export async function getComputerUseBridgeStatus(): Promise<ComputerUseBridgeStatus> {
  return invoke<ComputerUseBridgeStatus>("get_computer_use_bridge_status");
}
