import { describe, expect, it } from "vitest";
import { composerInputFixture50 } from "./composerInputFixture50";
import { composerInputFixture100ime } from "./composerInputFixture100ime";
import { longListFixture1000 } from "./longListFixture1000";
import { longListFixture200 } from "./longListFixture200";
import { longListFixture500 } from "./longListFixture500";

describe("perf fixtures", () => {
  it("creates deterministic long-list item counts with mixed item kinds", () => {
    expect(longListFixture200).toHaveLength(200);
    expect(longListFixture500).toHaveLength(500);
    expect(longListFixture1000).toHaveLength(1000);
    expect(new Set(longListFixture200.map((item) => item.kind))).toEqual(
      new Set(["message", "reasoning", "tool"]),
    );
  });

  it("creates deterministic composer input patterns", () => {
    expect(composerInputFixture50.filter((step) => step.kind === "input")).toHaveLength(50);
    expect(composerInputFixture100ime.filter((step) => step.kind === "composition-end")).toHaveLength(10);
  });
});
