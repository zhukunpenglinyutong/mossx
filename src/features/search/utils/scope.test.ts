import { describe, expect, it } from "vitest";
import { resolveSearchScopeOnOpen } from "./scope";

describe("resolveSearchScopeOnOpen", () => {
  it("forces global scope when no active workspace", () => {
    expect(resolveSearchScopeOnOpen("active-workspace", null)).toBe("global");
  });

  it("keeps global scope when already global", () => {
    expect(resolveSearchScopeOnOpen("global", null)).toBe("global");
  });

  it("preserves current scope when active workspace exists", () => {
    expect(resolveSearchScopeOnOpen("active-workspace", "ws-1")).toBe("active-workspace");
    expect(resolveSearchScopeOnOpen("global", "ws-1")).toBe("global");
  });
});
