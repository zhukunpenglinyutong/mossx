import { describe, expect, it, vi } from "vitest";
import {
  isClaudeThreadId,
  resolveClaudeContinuationThreadId,
  shouldShowHistoryLoadingForSelectionThread,
} from "./claudeThreadContinuity";

describe("claudeThreadContinuity", () => {
  it("recognizes Claude native and pending thread ids", () => {
    expect(isClaudeThreadId("claude:session-1")).toBe(true);
    expect(isClaudeThreadId("claude-pending-1")).toBe(true);
    expect(isClaudeThreadId("thread-1")).toBe(false);
  });

  it("shows history loading for Claude history selections but not pending threads", () => {
    expect(shouldShowHistoryLoadingForSelectionThread("claude:session-1")).toBe(
      true,
    );
    expect(
      shouldShowHistoryLoadingForSelectionThread("claude-pending-1"),
    ).toBe(false);
    expect(shouldShowHistoryLoadingForSelectionThread("shared:session-1")).toBe(
      false,
    );
  });

  it("prefers persisted canonical aliases for Claude continuation", () => {
    expect(
      resolveClaudeContinuationThreadId({
        workspaceId: "ws-1",
        threadId: "claude:stale",
        turnId: "turn-1",
        resolveCanonicalThreadId: (threadId) =>
          threadId === "claude:stale" ? "claude:canonical" : threadId,
      }),
    ).toBe("claude:canonical");
  });

  it("falls back to the anchored Claude pending thread when the turn matches", () => {
    const resolvePendingThreadForSession = vi
      .fn()
      .mockReturnValue("claude-pending-1");
    const getActiveTurnIdForThread = vi
      .fn()
      .mockImplementation((threadId: string) =>
        threadId === "claude-pending-1" ? "turn-1" : null,
      );

    expect(
      resolveClaudeContinuationThreadId({
        workspaceId: "ws-1",
        threadId: "claude:session-1",
        turnId: "turn-1",
        resolveCanonicalThreadId: (threadId) => threadId,
        resolvePendingThreadForSession,
        getActiveTurnIdForThread,
      }),
    ).toBe("claude-pending-1");
  });

  it("does not guess a replacement Claude thread when turn evidence is missing", () => {
    expect(
      resolveClaudeContinuationThreadId({
        workspaceId: "ws-1",
        threadId: "claude:session-1",
        turnId: "turn-1",
        resolveCanonicalThreadId: (threadId) => threadId,
        resolvePendingThreadForSession: () => "claude-pending-1",
        getActiveTurnIdForThread: () => "turn-other",
      }),
    ).toBe("claude:session-1");
  });
});
