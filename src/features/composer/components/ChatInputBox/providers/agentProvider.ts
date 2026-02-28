import type { DropdownItemData } from '../types';
import type { AgentConfig } from '../../../types/agent';
import { sendBridgeEvent } from '../../../utils/bridge';
import i18n from '../../../i18n/config';
import { debugWarn } from '../../../utils/debug.js';
import { createBridgeProvider } from './createBridgeProvider';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AgentItem {
  id: string;
  name: string;
  prompt?: string;
}

// ============================================================================
// Bridge Provider Instance
// ============================================================================

const LOADING_TIMEOUT = 3000;

const bridge = createBridgeProvider<AgentItem>({
  name: 'AgentProvider',
  bridgeEvent: 'get_agents',
  windowCallbackKey: 'updateAgents',
  sendBridgeEvent,
  loadingTimeout: LOADING_TIMEOUT,
  minRefreshInterval: 2000,
  maxRetryCount: 2,
  maxPendingWaiters: 10,
  parseResponse: (json: string): AgentItem[] => {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((agent: AgentConfig) => ({
      id: agent.id,
      name: agent.name,
      prompt: agent.prompt,
    }));
  },
});

// ============================================================================
// Public API (delegates to bridge instance)
// ============================================================================

export function resetAgentsState() {
  bridge.reset();
}

export function setupAgentsCallback() {
  bridge.setupCallback();
}

// ============================================================================
// Business Logic
// ============================================================================

function filterAgents(agents: AgentItem[], query: string): AgentItem[] {
  if (!query) return agents;

  const lowerQuery = query.toLowerCase();
  return agents.filter(agent =>
    agent.name.toLowerCase().includes(lowerQuery) ||
    agent.prompt?.toLowerCase().includes(lowerQuery)
  );
}

export const CREATE_NEW_AGENT_ID = '__create_new__';
export const EMPTY_STATE_ID = '__empty_state__';

export async function agentProvider(
  query: string,
  signal: AbortSignal
): Promise<AgentItem[]> {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  bridge.setupCallback();

  const now = Date.now();

  // Create new agent item
  const createNewAgentItem: AgentItem = {
    id: CREATE_NEW_AGENT_ID,
    name: i18n.t('settings.agent.createAgent'),
    prompt: '',
  };

  const loadingState = bridge.getLoadingState();

  if (loadingState === 'idle' || loadingState === 'failed') {
    bridge.requestRefresh();
  } else if (loadingState === 'loading' && now - bridge.getLastRefreshTime() > LOADING_TIMEOUT) {
    debugWarn('[AgentProvider] Loading timeout');
    bridge.setLoadingState('failed');
    bridge.requestRefresh();
  }

  if (bridge.getLoadingState() !== 'success') {
    await bridge.waitForData(signal, LOADING_TIMEOUT).catch(() => {});
  }

  if (bridge.getLoadingState() !== 'success') {
    const retryCount = bridge.getRetryCount();
    const maxRetryCount = bridge.getMaxRetryCount();
    return [{
      id: EMPTY_STATE_ID,
      name: retryCount >= maxRetryCount ? i18n.t('settings.agent.loadFailed') : i18n.t('settings.agent.noAgentsDropdown'),
      prompt: '',
    }, createNewAgentItem];
  }

  const cachedAgents = bridge.getCached();
  const filtered = cachedAgents.length > 0 ? filterAgents(cachedAgents, query) : [];

  if (filtered.length === 0) {
    return [{
      id: EMPTY_STATE_ID,
      name: i18n.t('settings.agent.noAgentsDropdown'),
      prompt: '',
    }, createNewAgentItem];
  }

  return [...filtered, createNewAgentItem];
}

export function agentToDropdownItem(agent: AgentItem): DropdownItemData {
  // Special handling for loading and empty states
  if (agent.id === '__loading__' || agent.id === '__empty__' || agent.id === EMPTY_STATE_ID) {
    return {
      id: agent.id,
      label: agent.name,
      description: agent.prompt,
      icon: agent.id === EMPTY_STATE_ID ? 'codicon-info' : 'codicon-robot',
      type: 'info',
      data: { agent },
    };
  }

  // Special handling for create agent item
  if (agent.id === CREATE_NEW_AGENT_ID) {
    return {
      id: agent.id,
      label: agent.name,
      description: i18n.t('settings.agent.createAgentHint'),
      icon: 'codicon-add',
      type: 'agent',
      data: { agent },
    };
  }

  return {
    id: agent.id,
    label: agent.name,
    description: agent.prompt ?
      (agent.prompt.length > 60 ? agent.prompt.substring(0, 60) + '...' : agent.prompt) :
      undefined,
    icon: 'codicon-robot',
    type: 'agent',
    data: { agent },
  };
}

export function forceRefreshAgents(): void {
  bridge.forceRefresh();
}

export default agentProvider;
