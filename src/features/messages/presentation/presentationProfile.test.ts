import { describe, expect, it } from "vitest";
import { resolvePresentationProfile } from "./presentationProfile";

describe("presentationProfile", () => {
  it("resolves codex profile with codex-only visual hints", () => {
    const profile = resolvePresentationProfile("codex");
    expect(profile).toEqual({
      engine: "codex",
      preferCommandSummary: true,
      codexCanvasMarkdown: true,
      showReasoningLiveDot: true,
      heartbeatWaitingHint: false,
    });
  });

  it("keeps claude profile without codex or heartbeat-specific hints", () => {
    const profile = resolvePresentationProfile("claude");
    expect(profile).toEqual({
      engine: "claude",
      preferCommandSummary: false,
      codexCanvasMarkdown: false,
      showReasoningLiveDot: false,
      heartbeatWaitingHint: false,
    });
  });

  it("enables heartbeat waiting hint only for opencode profile", () => {
    const profile = resolvePresentationProfile("opencode");
    expect(profile).toEqual({
      engine: "opencode",
      preferCommandSummary: false,
      codexCanvasMarkdown: false,
      showReasoningLiveDot: false,
      heartbeatWaitingHint: true,
    });
  });
});
