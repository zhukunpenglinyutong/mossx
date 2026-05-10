import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartupOrchestrator } from "./startupOrchestrator";
import {
  getStartupTraceSnapshot,
  resetStartupTraceForTests,
} from "./startupTrace";

function createTask(overrides: Partial<Parameters<StartupOrchestrator["run"]>[0]> = {}) {
  return {
    id: "task",
    phase: "active-workspace" as const,
    priority: 1,
    dedupeKey: "task",
    concurrencyKey: "default",
    timeoutMs: 1_000,
    workspaceScope: "global" as const,
    cancelPolicy: "soft-ignore" as const,
    traceLabel: "Task",
    run: vi.fn(async () => "ok"),
    fallback: vi.fn(async () => "fallback"),
    ...overrides,
  };
}

describe("StartupOrchestrator", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetStartupTraceForTests();
  });

  it("deduplicates in-flight tasks by dedupeKey", async () => {
    let resolveTask: (value: string) => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveTask = resolve;
        }),
    );
    const orchestrator = new StartupOrchestrator();
    const task = createTask({ run });

    const first = orchestrator.run(task);
    const second = orchestrator.run(task);
    resolveTask("done");

    await expect(first).resolves.toBe("done");
    await expect(second).resolves.toBe("done");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("respects phase and heavy command concurrency caps", async () => {
    const starts: string[] = [];
    const releases = new Map<string, (value: string) => void>();
    const orchestrator = new StartupOrchestrator({
      phaseConcurrency: { "active-workspace": 2 },
      heavyCommandConcurrency: { git: 1 },
    });
    const makeRunningTask = (id: string) =>
      createTask({
        id,
        dedupeKey: id,
        concurrencyKey: "git",
        run: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              starts.push(id);
              releases.set(id, resolve);
            }),
        ),
      });

    const first = orchestrator.run(makeRunningTask("first"));
    const second = orchestrator.run(makeRunningTask("second"));

    expect(starts).toEqual(["first"]);
    expect(orchestrator.getQueuedTaskCount()).toBe(1);

    releases.get("first")?.("first-result");
    await expect(first).resolves.toBe("first-result");
    expect(starts).toEqual(["first", "second"]);

    releases.get("second")?.("second-result");
    await expect(second).resolves.toBe("second-result");
  });

  it("settles timed-out tasks through fallback and trace", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const orchestrator = new StartupOrchestrator();
    const task = createTask({
      timeoutMs: 25,
      run: vi.fn(() => new Promise<string>(() => {})),
      fallback: vi.fn(async (reason) => `fallback:${reason}`),
    });

    const result = orchestrator.run(task);
    await vi.advanceTimersByTimeAsync(25);

    await expect(result).resolves.toBe("fallback:timeout");
    const states = getStartupTraceSnapshot().events
      .filter((event) => event.type === "task")
      .map((event) => event.lifecycleState);
    expect(states).toContain("timed-out");
    expect(states).toContain("degraded");
  });

  it("yields idle-prewarm queue work after the configured idle slice budget", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const starts: string[] = [];
    const orchestrator = new StartupOrchestrator({
      phaseConcurrency: { "idle-prewarm": 3 },
      idleSliceBudgetMs: 0,
    });
    const createIdleTask = (id: string) =>
      createTask({
        id,
        phase: "idle-prewarm",
        dedupeKey: id,
        run: vi.fn(async () => {
          starts.push(id);
          return id;
        }),
      });

    const first = orchestrator.run(createIdleTask("first"));
    const second = orchestrator.run(createIdleTask("second"));
    const third = orchestrator.run(createIdleTask("third"));

    await expect(first).resolves.toBe("first");
    expect(starts).toEqual(["first"]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toBe("second");
    expect(starts).toEqual(["first", "second"]);
    await vi.advanceTimersByTimeAsync(1);
    await expect(third).resolves.toBe("third");
    expect(starts).toEqual(["first", "second", "third"]);
  });

  it("records soft cancellation for queued workspace tasks", async () => {
    const releases = new Map<string, (value: string) => void>();
    const orchestrator = new StartupOrchestrator({
      phaseConcurrency: { "active-workspace": 1 },
    });
    const first = orchestrator.run(
      createTask({
        id: "first",
        dedupeKey: "first",
        workspaceScope: { workspaceId: "workspace-b" },
        run: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              releases.set("first", resolve);
            }),
        ),
      }),
    );
    const second = orchestrator.run(
      createTask({
        id: "second",
        dedupeKey: "second",
        workspaceScope: { workspaceId: "workspace-a" },
        fallback: vi.fn(async (reason) => `fallback:${reason}`),
      }),
    );

    orchestrator.cancelWorkspaceTasks("workspace-a");
    releases.get("first")?.("first-result");

    await expect(first).resolves.toBe("first-result");
    await expect(second).resolves.toBe("fallback:stale");
    const cancelled = getStartupTraceSnapshot().events.find(
      (event) => event.type === "task" && event.lifecycleState === "cancelled",
    );
    expect(cancelled).toBeTruthy();
  });

  it("settles running soft-cancelled workspace tasks through stale fallback", async () => {
    let releaseRunningTask: (value: string) => void = () => {};
    const orchestrator = new StartupOrchestrator();
    const task = createTask({
      id: "running",
      dedupeKey: "running",
      workspaceScope: { workspaceId: "workspace-a" },
      run: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            releaseRunningTask = resolve;
          }),
      ),
      fallback: vi.fn(async (reason) => `fallback:${reason}`),
    });

    const result = orchestrator.run(task);
    orchestrator.cancelWorkspaceTasks("workspace-a");
    releaseRunningTask("stale-result");

    await expect(result).resolves.toBe("fallback:stale");
    const lifecycleStates = getStartupTraceSnapshot().events
      .filter((event) => event.type === "task")
      .map((event) => event.lifecycleState);
    expect(lifecycleStates).toContain("cancelled");
    expect(lifecycleStates).not.toContain("completed");
  });

  it("settles hard-aborted workspace tasks through stale fallback instead of failure", async () => {
    const orchestrator = new StartupOrchestrator();
    const task = createTask({
      id: "hard-abort",
      dedupeKey: "hard-abort",
      workspaceScope: { workspaceId: "workspace-a" },
      cancelPolicy: "hard-abort",
      run: vi.fn(
        ({ signal }) =>
          new Promise<string>((resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
            setTimeout(() => resolve("late-result"), 1_000);
          }),
      ),
      fallback: vi.fn(async (reason) => `fallback:${reason}`),
    });

    const result = orchestrator.run(task);
    orchestrator.cancelWorkspaceTasks("workspace-a");

    await expect(result).resolves.toBe("fallback:stale");
    const lifecycleStates = getStartupTraceSnapshot().events
      .filter((event) => event.type === "task")
      .map((event) => event.lifecycleState);
    expect(lifecycleStates).toContain("cancelled");
    expect(lifecycleStates).not.toContain("failed");
  });
});
