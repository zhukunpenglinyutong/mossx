import { describe, expect, it } from "vitest";
import { extractInlineSelections, mergeUniqueNames } from "./inlineSelections";

describe("mergeUniqueNames", () => {
  it("keeps existing order and appends only new names", () => {
    expect(mergeUniqueNames(["review", "debug"], ["debug", "docs", "review"])).toEqual([
      "review",
      "debug",
      "docs",
    ]);
  });
});

describe("extractInlineSelections", () => {
  it("extracts slash skills and commons", () => {
    const result = extractInlineSelections(
      "/find-skills /team-rules 帮我分析",
      [{ name: "find-skills" }],
      [{ name: "team-rules" }],
    );

    expect(result.cleanedText).toBe("帮我分析");
    expect(result.matchedSkillNames).toEqual(["find-skills"]);
    expect(result.matchedCommonsNames).toEqual(["team-rules"]);
  });

  it("extracts dollar skill aliases and keeps commons slash-only", () => {
    const result = extractInlineSelections(
      "$Code Review $team-rules /team-rules 请给建议",
      [{ name: "Code Review" }],
      [{ name: "team-rules" }],
    );

    expect(result.cleanedText).toBe("$team-rules 请给建议");
    expect(result.matchedSkillNames).toEqual(["Code Review"]);
    expect(result.matchedCommonsNames).toEqual(["team-rules"]);
  });
});
