import type { RealtimeAdapter } from "../contracts/conversationCurtainContracts";
import { mapCommonRealtimeEvent } from "./sharedRealtimeAdapter";

export const opencodeRealtimeAdapter: RealtimeAdapter = {
  engine: "opencode",
  mapEvent(input: unknown) {
    return mapCommonRealtimeEvent("opencode", input, {
      allowTextDeltaAlias: true,
    });
  },
};
