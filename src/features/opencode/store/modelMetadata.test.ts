import { describe, expect, it } from "vitest";
import { inferOpenCodeModelBadges } from "./modelMetadata";

describe("inferOpenCodeModelBadges", () => {
  it("returns fallback badges for empty model", () => {
    const badges = inferOpenCodeModelBadges("");
    expect(badges.map((item) => item.label)).toEqual(["Balanced", "Mid $", "std"]);
  });

  it("infers fast/low-cost for mini models", () => {
    const badges = inferOpenCodeModelBadges("openai/gpt-5.3-codex-spark");
    expect(badges[0]?.label).toBe("Fast");
    expect(badges[1]?.label).toBe("Low $");
  });

  it("infers slower/higher-cost for max models", () => {
    const badges = inferOpenCodeModelBadges("openai/gpt-5.1-codex-max");
    expect(badges[0]?.label).toBe("Slow");
    expect(badges[1]?.label).toBe("High $");
  });
});
