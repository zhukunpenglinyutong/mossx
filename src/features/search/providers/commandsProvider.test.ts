import { describe, expect, it } from "vitest";
import { searchCommands } from "./commandsProvider";

describe("searchCommands", () => {
  it("returns empty results for empty query", () => {
    const results = searchCommands("", [
      { name: "plan", path: "/commands/plan", content: "" },
    ]);

    expect(results).toEqual([]);
  });

  it("deduplicates identical command entries", () => {
    const results = searchCommands("plan", [
      { name: "plan", path: "/commands/plan", content: "", description: "desc" },
      { name: "plan", path: "/commands/plan", content: "", description: "desc" },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("/plan");
  });

  it("builds unique stable ids when same command name exists in different sources", () => {
    const results = searchCommands("plan", [
      { name: "plan", path: "/commands/plan", content: "", source: "workspace" },
      { name: "plan", path: "/global/commands/plan", content: "", source: "global" },
    ]);

    expect(results).toHaveLength(2);
    expect(new Set(results.map((entry) => entry.id)).size).toBe(2);
  });

  it("normalizes windows and posix path separators for deduplication", () => {
    const results = searchCommands("plan", [
      { name: "plan", path: "\\commands\\plan", content: "", description: "desc" },
      { name: "plan", path: "/commands/plan", content: "", description: "desc" },
    ]);

    expect(results).toHaveLength(1);
  });
});

