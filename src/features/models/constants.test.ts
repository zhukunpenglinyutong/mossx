// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyModelMapping } from "./constants";

describe("model mapping", () => {
  it("maps sonnet and haiku families", () => {
    expect(
      applyModelMapping("Sonnet 4.5", "claude-sonnet-4-5-20250929", {
        sonnet: "glm-4.7",
      }),
    ).toBe("glm-4.7");

    expect(
      applyModelMapping("Haiku 4.5", "claude-haiku-4-5", {
        haiku: "glm-4.7-air",
      }),
    ).toBe("glm-4.7-air");
  });

  it("maps opus 4.5 but keeps opus 4.6 variants unchanged", () => {
    expect(
      applyModelMapping("Opus 4.5", "claude-opus-4-5-20251101", {
        opus: "glm-4.7",
      }),
    ).toBe("glm-4.7");

    expect(
      applyModelMapping("Opus 4.6", "claude-opus-4-6", {
        opus: "glm-4.7",
      }),
    ).toBe("Opus 4.6");

    expect(
      applyModelMapping("Opus (1M context)", "claude-opus-4-6-1m", {
        opus: "glm-4.7",
      }),
    ).toBe("Opus (1M context)");
  });
});

