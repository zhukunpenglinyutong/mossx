import type { ConversationEngine } from "../../threads/contracts/conversationCurtainContracts";

export type PresentationProfile = {
  engine: ConversationEngine;
  preferCommandSummary: boolean;
  codexCanvasMarkdown: boolean;
  showReasoningLiveDot: boolean;
  heartbeatWaitingHint: boolean;
};

export function resolvePresentationProfile(
  engine: ConversationEngine,
): PresentationProfile {
  if (engine === "codex") {
    return {
      engine,
      preferCommandSummary: true,
      codexCanvasMarkdown: true,
      showReasoningLiveDot: true,
      heartbeatWaitingHint: false,
    };
  }
  if (engine === "opencode") {
    return {
      engine,
      preferCommandSummary: false,
      codexCanvasMarkdown: false,
      showReasoningLiveDot: false,
      heartbeatWaitingHint: true,
    };
  }
  return {
    engine,
    preferCommandSummary: false,
    codexCanvasMarkdown: false,
    showReasoningLiveDot: false,
    heartbeatWaitingHint: false,
  };
}
