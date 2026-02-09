import { describe, expect, it } from "vitest";
import { resolveKanbanThreadCreationStrategy } from "./contextMode";

describe("resolveKanbanThreadCreationStrategy", () => {
  it("returns new by default", () => {
    expect(
      resolveKanbanThreadCreationStrategy({
        mode: "new",
        engine: "codex",
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-1",
        isActiveThreadInWorkspace: true,
      }),
    ).toBe("new");
  });

  it("returns inherit only when all fork preconditions are satisfied", () => {
    expect(
      resolveKanbanThreadCreationStrategy({
        mode: "inherit",
        engine: "codex",
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-1",
        isActiveThreadInWorkspace: true,
      }),
    ).toBe("inherit");
  });

  it("returns inherit for claude when all fork preconditions are satisfied", () => {
    expect(
      resolveKanbanThreadCreationStrategy({
        mode: "inherit",
        engine: "claude",
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-1",
        isActiveThreadInWorkspace: true,
      }),
    ).toBe("inherit");
  });

  it("falls back to new when thread/workspace context is missing or mismatched", () => {
    expect(
      resolveKanbanThreadCreationStrategy({
        mode: "inherit",
        engine: "codex",
        activeThreadId: null,
        activeWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-1",
        isActiveThreadInWorkspace: true,
      }),
    ).toBe("new");

    expect(
      resolveKanbanThreadCreationStrategy({
        mode: "inherit",
        engine: "codex",
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-2",
        targetWorkspaceId: "ws-1",
        isActiveThreadInWorkspace: true,
      }),
    ).toBe("new");

    expect(
      resolveKanbanThreadCreationStrategy({
        mode: "inherit",
        engine: "codex",
        activeThreadId: "thread-1",
        activeWorkspaceId: "ws-1",
        targetWorkspaceId: "ws-1",
        isActiveThreadInWorkspace: false,
      }),
    ).toBe("new");
  });
});
