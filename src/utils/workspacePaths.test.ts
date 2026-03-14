import { describe, expect, it } from "vitest";
import {
  resolveDiffPathFromWorkspacePath,
  resolveWorkspaceRelativePath,
} from "./workspacePaths";

describe("workspacePaths", () => {
  it("resolves Windows workspace-relative paths case-insensitively", () => {
    expect(
      resolveWorkspaceRelativePath(
        "C:/Users/Chen/Project",
        "c:/users/chen/project/src/App.tsx",
      ),
    ).toBe("src/App.tsx");
  });

  it("resolves mac-style absolute paths without changing relative behavior", () => {
    expect(
      resolveWorkspaceRelativePath(
        "/Users/chen/project",
        "/Users/chen/project/src/App.tsx",
      ),
    ).toBe("src/App.tsx");
  });

  it("matches diff paths case-insensitively for Windows tool output", () => {
    expect(
      resolveDiffPathFromWorkspacePath(
        "c:/users/chen/project/src/App.tsx",
        ["src/app.tsx", "src/other.ts"],
        "C:/Users/Chen/Project",
      ),
    ).toBe("src/app.tsx");
  });
});
