import { invoke } from "@tauri-apps/api/core";
import type {
  AgentConfig,
  AgentImportApplyResult,
  AgentImportPreviewResult,
} from "../../types";

export async function listAgentConfigs(): Promise<AgentConfig[]> {
  return invoke<AgentConfig[]>("agent_list");
}

export async function addAgentConfig(agent: AgentConfig): Promise<void> {
  return invoke("agent_add", { agent });
}

export async function updateAgentConfig(
  id: string,
  updates: Partial<Pick<AgentConfig, "name" | "prompt" | "icon">>,
): Promise<void> {
  return invoke("agent_update", { id, updates });
}

export async function deleteAgentConfig(id: string): Promise<boolean> {
  return invoke<boolean>("agent_delete", { id });
}

export async function getSelectedAgentConfig(): Promise<{
  selectedAgentId: string | null;
  agent: AgentConfig | null;
}> {
  return invoke<{ selectedAgentId: string | null; agent: AgentConfig | null }>(
    "agent_get_selected",
  );
}

export async function setSelectedAgentConfig(agentId: string | null): Promise<{
  success: boolean;
  agent: AgentConfig | null;
}> {
  return invoke<{ success: boolean; agent: AgentConfig | null }>(
    "agent_set_selected",
    {
      agentId,
    },
  );
}

export async function exportAgentConfigs(
  agentIds: string[],
  path: string,
): Promise<void> {
  return invoke("agent_export", { agentIds, path });
}

export async function previewImportAgentConfigs(
  path: string,
): Promise<AgentImportPreviewResult> {
  return invoke<AgentImportPreviewResult>("agent_import_preview", { path });
}

export async function applyImportAgentConfigs(input: {
  agents: AgentConfig[];
  strategy: "skip" | "overwrite" | "duplicate";
}): Promise<AgentImportApplyResult> {
  return invoke<AgentImportApplyResult>("agent_import_apply", {
    agents: input.agents,
    strategy: input.strategy,
  });
}
