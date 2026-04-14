import { describe, expect, it } from "vitest";
import { searchSkills } from "./skillsProvider";

describe("searchSkills", () => {
  it("returns empty results for empty query", () => {
    const results = searchSkills("", [
      { name: "wf-thinking", path: "/skills/wf-thinking", description: "thinking helper" },
    ]);

    expect(results).toEqual([]);
  });

  it("deduplicates identical skills to avoid duplicate list entries", () => {
    const results = searchSkills(
      "api",
      [
        { name: "api-fulldoc-sync", path: "/skills/api-fulldoc-sync", description: "desc-a" },
        { name: "api-fulldoc-sync", path: "/skills/api-fulldoc-sync", description: "desc-a" },
      ],
      "ws-1",
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("/api-fulldoc-sync");
  });

  it("builds unique stable ids when same skill name exists in different sources", () => {
    const results = searchSkills(
      "think",
      [
        { name: "wf-thinking", path: "/skills/wf-thinking", description: "thinking helper", source: "global" },
        { name: "wf-thinking", path: "/workspace/.skills/wf-thinking", description: "workspace helper", source: "workspace" },
      ],
      "ws-1",
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.id).not.toBe(results[1]?.id);
    expect(new Set(results.map((entry) => entry.id)).size).toBe(2);
  });

  it("normalizes windows and posix path separators for deduplication", () => {
    const results = searchSkills(
      "wf",
      [
        { name: "wf-thinking", path: "\\skills\\wf-thinking", description: "thinking helper" },
        { name: "wf-thinking", path: "/skills/wf-thinking", description: "thinking helper" },
      ],
      "ws-1",
    );

    expect(results).toHaveLength(1);
  });
});
