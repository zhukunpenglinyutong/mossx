import { beforeEach, describe, expect, it } from "vitest";
import {
  clearGlobalRuntimeNotices,
  getGlobalRuntimeNoticesSnapshot,
  pushGlobalRuntimeNotice,
  pushThreadFailureRuntimeNotice,
  subscribeGlobalRuntimeNotices,
  GLOBAL_RUNTIME_NOTICE_BUFFER_LIMIT,
} from "./globalRuntimeNotices";

describe("globalRuntimeNotices", () => {
  beforeEach(() => {
    clearGlobalRuntimeNotices();
  });

  it("replays the current snapshot to new subscribers and appends notices in order", () => {
    const snapshots: number[] = [];
    const unsubscribe = subscribeGlobalRuntimeNotices((notices) => {
      snapshots.push(notices.length);
    });

    pushGlobalRuntimeNotice({
      severity: "info",
      category: "bootstrap",
      messageKey: "runtimeNotice.bootstrap.start",
      timestampMs: 100,
    });
    pushGlobalRuntimeNotice({
      severity: "warning",
      category: "bootstrap",
      messageKey: "runtimeNotice.bootstrap.localStorageMigrationFailed",
      timestampMs: 200,
    });

    expect(snapshots).toEqual([0, 1, 2]);
    expect(getGlobalRuntimeNoticesSnapshot().map((notice) => notice.messageKey)).toEqual([
      "runtimeNotice.bootstrap.start",
      "runtimeNotice.bootstrap.localStorageMigrationFailed",
    ]);

    unsubscribe();
  });

  it("deduplicates consecutive identical notices and keeps the latest timestamp", () => {
    pushGlobalRuntimeNotice({
      severity: "warning",
      category: "runtime",
      messageKey: "runtimeNotice.runtime.suspectStale",
      messageParams: { workspace: "Repo A" },
      timestampMs: 100,
    });
    pushGlobalRuntimeNotice({
      severity: "warning",
      category: "runtime",
      messageKey: "runtimeNotice.runtime.suspectStale",
      messageParams: { workspace: "Repo A" },
      timestampMs: 180,
    });

    expect(getGlobalRuntimeNoticesSnapshot()).toEqual([
      expect.objectContaining({
        messageKey: "runtimeNotice.runtime.suspectStale",
        repeatCount: 2,
        timestampMs: 180,
      }),
    ]);
  });

  it("keeps only the newest 120 notices in the session buffer", () => {
    for (let index = 0; index < GLOBAL_RUNTIME_NOTICE_BUFFER_LIMIT + 2; index += 1) {
      pushGlobalRuntimeNotice({
        severity: "info",
        category: "bootstrap",
        messageKey: `runtimeNotice.bootstrap.step.${index}`,
        dedupeKey: `step-${index}`,
        timestampMs: index,
      });
    }

    const snapshot = getGlobalRuntimeNoticesSnapshot();
    expect(snapshot).toHaveLength(GLOBAL_RUNTIME_NOTICE_BUFFER_LIMIT);
    expect(snapshot[0]?.messageKey).toBe("runtimeNotice.bootstrap.step.2");
    expect(snapshot.at(-1)?.messageKey).toBe("runtimeNotice.bootstrap.step.121");
  });

  it("clears the feed without interrupting future pushes", () => {
    const snapshots: string[][] = [];
    const unsubscribe = subscribeGlobalRuntimeNotices((notices) => {
      snapshots.push(notices.map((notice) => notice.messageKey));
    });

    pushGlobalRuntimeNotice({
      severity: "info",
      category: "bootstrap",
      messageKey: "runtimeNotice.bootstrap.start",
    });
    clearGlobalRuntimeNotices();
    pushGlobalRuntimeNotice({
      severity: "error",
      category: "workspace",
      messageKey: "runtimeNotice.error.createSessionRecoveryRequired",
    });

    expect(snapshots).toEqual([
      [],
      ["runtimeNotice.bootstrap.start"],
      [],
      ["runtimeNotice.error.createSessionRecoveryRequired"],
    ]);

    unsubscribe();
  });

  it("normalizes thread failure notices for the runtime notice dock", () => {
    pushThreadFailureRuntimeNotice({
      workspaceId: "ws-1",
      threadId: "codex-thread-1",
      turnId: "turn-1",
      engine: "codex",
      message: "  The 'demo' model\nis not supported.  ",
      timestampMs: 300,
    });

    expect(getGlobalRuntimeNoticesSnapshot()).toEqual([
      expect.objectContaining({
        severity: "error",
        category: "user-action-error",
        messageKey: "runtimeNotice.error.threadTurnFailed",
        messageParams: {
          engine: "Codex",
          message: "The 'demo' model is not supported.",
        },
        dedupeKey:
          "thread-turn-failed|ws-1|codex-thread-1|turn-1|codex|The 'demo' model is not supported.",
        timestampMs: 300,
      }),
    ]);
  });

  it("adds classified recovery action context to thread failure notices", () => {
    pushThreadFailureRuntimeNotice({
      workspaceId: "ws-1",
      threadId: "codex-thread-1",
      engine: "codex",
      message: "[RUNTIME_ENDED] Managed runtime ended.",
      reasonCode: "runtime-ended",
      userAction: "reconnect",
      timestampMs: 400,
    });

    expect(getGlobalRuntimeNoticesSnapshot()).toEqual([
      expect.objectContaining({
        messageKey: "runtimeNotice.error.threadTurnFailed",
        messageParams: {
          engine: "Codex",
          message: "[RUNTIME_ENDED] Managed runtime ended.",
          reasonCode: "runtime-ended",
          userAction: "reconnect",
          actionHint: "Reconnect the runtime and retry.",
        },
      }),
    ]);
  });
});
