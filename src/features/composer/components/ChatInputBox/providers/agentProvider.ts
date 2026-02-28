import type { DropdownItemData } from "../types";
import i18n from "../../../i18n/config";
import { listAgentConfigs } from "../../../../../services/tauri";
import { debugError, debugLog, debugWarn } from "../../../utils/debug.js";

export interface AgentItem {
  id: string;
  name: string;
  prompt?: string;
}

type LoadingState = "idle" | "loading" | "success" | "failed";

const MIN_REFRESH_INTERVAL = 1000;
const LOADING_TIMEOUT = 4000;

// Module-level mutable cache: intentional singleton state shared across all
// consumers.  This avoids redundant Tauri IPC round-trips when multiple
// components request the agent list within the same refresh window.
let cachedAgents: AgentItem[] = [];
let loadingState: LoadingState = "idle";
let lastRefreshTime = 0;
let inflightLoad: Promise<void> | null = null;

function normalizeAgents(items: AgentItem[]): AgentItem[] {
  return items
    .map((item) => ({
      id: String(item.id ?? "").trim(),
      name: String(item.name ?? "").trim(),
      prompt: item.prompt?.trim() || undefined,
    }))
    .filter((item) => item.id.length > 0 && item.name.length > 0);
}

async function refreshAgents(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastRefreshTime < MIN_REFRESH_INTERVAL) {
    return;
  }
  if (inflightLoad) {
    return inflightLoad;
  }

  loadingState = "loading";
  lastRefreshTime = now;

  inflightLoad = (async () => {
    try {
      const agents = await Promise.race([
        listAgentConfigs(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error("Agent list loading timeout"));
          }, LOADING_TIMEOUT);
        }),
      ]);
      cachedAgents = normalizeAgents(
        (agents ?? []).map((agent) => ({
          id: agent.id,
          name: agent.name,
          prompt: agent.prompt ?? undefined,
        })),
      );
      loadingState = "success";
      debugLog(`[AgentProvider] Loaded ${cachedAgents.length} agents`);
    } catch (error) {
      loadingState = "failed";
      debugWarn("[AgentProvider] Failed to load agents");
      debugError("[AgentProvider] Load error:", error);
    } finally {
      inflightLoad = null;
    }
  })();

  return inflightLoad;
}

function filterAgents(agents: AgentItem[], query: string): AgentItem[] {
  if (!query.trim()) {
    return agents;
  }
  const lower = query.trim().toLowerCase();
  return agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(lower) ||
      agent.prompt?.toLowerCase().includes(lower),
  );
}

export const CREATE_NEW_AGENT_ID = "__create_new__";
export const EMPTY_STATE_ID = "__empty_state__";

export function resetAgentsState() {
  cachedAgents = [];
  loadingState = "idle";
  lastRefreshTime = 0;
  inflightLoad = null;
}

/** @deprecated No-op retained for backward compatibility; will be removed. */
export function setupAgentsCallback() {
  return;
}

export function forceRefreshAgents() {
  void refreshAgents(true);
}

export async function agentProvider(
  query: string,
  signal: AbortSignal,
): Promise<AgentItem[]> {
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (loadingState === "idle" || loadingState === "failed") {
    await refreshAgents();
  } else if (loadingState === "loading") {
    await (inflightLoad ?? Promise.resolve());
  } else if (Date.now() - lastRefreshTime >= MIN_REFRESH_INTERVAL) {
    await refreshAgents();
  }

  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const createItem: AgentItem = {
    id: CREATE_NEW_AGENT_ID,
    name: i18n.t("settings.agent.createAgent"),
    prompt: "",
  };

  const filtered = filterAgents(cachedAgents, query);
  if (filtered.length === 0) {
    return [
      {
        id: EMPTY_STATE_ID,
        name:
          loadingState === "failed"
            ? i18n.t("settings.agent.loadFailed")
            : i18n.t("settings.agent.noAgentsDropdown"),
        prompt: "",
      },
      createItem,
    ];
  }

  return [...filtered, createItem];
}

export function agentToDropdownItem(agent: AgentItem): DropdownItemData {
  if (agent.id === EMPTY_STATE_ID || agent.id === "__loading__" || agent.id === "__empty__") {
    return {
      id: agent.id,
      label: agent.name,
      description: agent.prompt,
      icon: "codicon-info",
      type: "info",
      data: { agent },
    };
  }

  if (agent.id === CREATE_NEW_AGENT_ID) {
    return {
      id: agent.id,
      label: agent.name,
      description: i18n.t("settings.agent.createAgentHint"),
      icon: "codicon-add",
      type: "agent",
      data: { agent },
    };
  }

  return {
    id: agent.id,
    label: agent.name,
    description: agent.prompt
      ? agent.prompt.length > 60
        ? `${agent.prompt.slice(0, 60)}...`
        : agent.prompt
      : undefined,
    icon: "codicon-robot",
    type: "agent",
    data: { agent },
  };
}

export default agentProvider;
