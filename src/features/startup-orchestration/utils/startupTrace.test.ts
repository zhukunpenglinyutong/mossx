import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureStartupTraceForTests,
  getStartupTraceSnapshot,
  recordStartupMilestone,
  recordStartupTaskTrace,
  resetStartupTraceForTests,
  subscribeStartupTrace,
  traceStartupCommand,
} from "./startupTrace";

describe("startupTrace", () => {
  beforeEach(() => {
    resetStartupTraceForTests();
  });

  it("keeps a bounded trace buffer", () => {
    configureStartupTraceForTests(2);
    for (const taskId of ["one", "two", "three"]) {
      recordStartupTaskTrace({
        type: "task",
        taskId,
        phase: "critical",
        traceLabel: taskId,
        workspaceScope: "global",
        lifecycleState: "queued",
        durationMs: null,
        fallbackReason: null,
        cancellationMode: null,
        commandLabel: null,
      });
    }

    expect(getStartupTraceSnapshot().events.map((event) => event.sequence)).toEqual([2, 3]);
  });

  it("keeps snapshot identity stable until a trace event changes it", () => {
    const initialSnapshot = getStartupTraceSnapshot();

    expect(getStartupTraceSnapshot()).toBe(initialSnapshot);

    recordStartupTaskTrace({
      type: "task",
      taskId: "preload",
      phase: "critical",
      traceLabel: "Preload",
      workspaceScope: "global",
      lifecycleState: "queued",
      durationMs: null,
      fallbackReason: null,
      cancellationMode: null,
      commandLabel: null,
    });

    const nextSnapshot = getStartupTraceSnapshot();
    expect(nextSnapshot).not.toBe(initialSnapshot);
    expect(getStartupTraceSnapshot()).toBe(nextSnapshot);
  });

  it("links milestones to preceding task events", () => {
    recordStartupTaskTrace({
      type: "task",
      taskId: "preload",
      phase: "critical",
      traceLabel: "Preload",
      workspaceScope: "global",
      lifecycleState: "completed",
      durationMs: 5,
      fallbackReason: null,
      cancellationMode: null,
      commandLabel: null,
    });

    const milestone = recordStartupMilestone("shell-ready");

    expect(milestone.type).toBe("milestone");
    if (milestone.type === "milestone") {
      expect(milestone.taskSequences).toEqual([1]);
    }
    expect(getStartupTraceSnapshot().milestones["shell-ready"]).toBe(milestone);
  });

  it("notifies subscribers and traces command outcomes without swallowing errors", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStartupTrace(listener);

    await expect(
      traceStartupCommand("model_list", "global", async () => "ok"),
    ).resolves.toBe("ok");
    await expect(
      traceStartupCommand("get_git_status", "global", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    unsubscribe();
    const commandStatuses = getStartupTraceSnapshot().events
      .filter((event) => event.type === "command")
      .map((event) => event.status);
    expect(commandStatuses).toEqual(["completed", "failed"]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
