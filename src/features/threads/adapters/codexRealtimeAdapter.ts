import type { RealtimeAdapter } from "../contracts/conversationCurtainContracts";
import { mapCommonRealtimeEvent } from "./sharedRealtimeAdapter";

export const codexRealtimeAdapter: RealtimeAdapter = {
  engine: "codex",
  mapEvent(input: unknown) {
    return mapCommonRealtimeEvent("codex", input);
  },
};
