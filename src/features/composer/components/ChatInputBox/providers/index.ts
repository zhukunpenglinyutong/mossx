export {
  fileReferenceProvider,
  fileToDropdownItem,
  resetFileReferenceState,
} from './fileReferenceProvider';

export {
  slashCommandProvider,
  commandToDropdownItem,
  setupSlashCommandsCallback,
  resetSlashCommandsState,
  preloadSlashCommands,
} from './slashCommandProvider';

export {
  agentProvider,
  agentToDropdownItem,
  /** @deprecated No-op – kept for backward compatibility */
  setupAgentsCallback,
  resetAgentsState,
  forceRefreshAgents,
} from './agentProvider';

export type { AgentItem } from './agentProvider';

export {
  promptProvider,
  promptToDropdownItem,
  setupPromptsCallback,
  resetPromptsState,
} from './promptProvider';

export type { PromptItem } from './promptProvider';
