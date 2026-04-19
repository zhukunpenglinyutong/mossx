import { describe, expect, it } from "vitest";
import { shouldSkipWorkspaceThreadListLoad } from "./workspaceThreadListLoadGuard";

describe("shouldSkipWorkspaceThreadListLoad", () => {
  it("skips auto reload after the workspace thread list has already hydrated", () => {
    expect(
      shouldSkipWorkspaceThreadListLoad({
        isLoading: false,
        hasHydratedThreadList: true,
      }),
    ).toBe(true);
  });

  it("still blocks duplicate in-flight loads", () => {
    expect(
      shouldSkipWorkspaceThreadListLoad({
        isLoading: true,
        hasHydratedThreadList: false,
      }),
    ).toBe(true);
  });

  it("allows force reload even after hydration", () => {
    expect(
      shouldSkipWorkspaceThreadListLoad({
        force: true,
        isLoading: false,
        hasHydratedThreadList: true,
      }),
    ).toBe(false);
  });
});
