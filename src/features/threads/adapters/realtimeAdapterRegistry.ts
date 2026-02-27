import type { ConversationEngine, RealtimeAdapter } from "../contracts/conversationCurtainContracts";
import { claudeRealtimeAdapter } from "./claudeRealtimeAdapter";
import { codexRealtimeAdapter } from "./codexRealtimeAdapter";
import { opencodeRealtimeAdapter } from "./opencodeRealtimeAdapter";
import { inferEngineFromThreadId } from "./sharedRealtimeAdapter";

const ADAPTERS: Record<ConversationEngine, RealtimeAdapter> = {
  codex: codexRealtimeAdapter,
  claude: claudeRealtimeAdapter,
  opencode: opencodeRealtimeAdapter,
};

export function getRealtimeAdapterByEngine(engine: ConversationEngine): RealtimeAdapter {
  return ADAPTERS[engine];
}

export function inferRealtimeAdapterEngine(threadId: string): ConversationEngine {
  return inferEngineFromThreadId(threadId);
}
