import { describe, expect, it } from "vitest";
import type { KanbanTask } from "../../kanban/types";
import type { TaskRunStoreData } from "../types";
import { beginTaskRun, beginTaskRunWithTrigger } from "./taskRunCoordinator";

function makeTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    id: "task-1",
    workspaceId: "/repo",
    panelId: "panel-1",
    title: "Task",
    description: "",
    status: "todo",
    engineType: "codex",
    modelId: null,
    branchName: "main",
    images: [],
    autoStart: false,
    sortOrder: 1,
    threadId: "thread-1",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("taskRunCoordinator", () => {
  it("creates a manual run when no active run exists", () => {
    const result = beginTaskRun({
      store: { version: 1, runs: [] },
      task: makeTask(),
      source: "manual",
      now: 100,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.run).toMatchObject({
        task: { taskId: "task-1", workspaceId: "/repo" },
        trigger: "manual",
        status: "queued",
        linkedThreadId: "thread-1",
      });
      expect(result.store.runs).toHaveLength(1);
    }
  });

  it("blocks a duplicate scheduled run when the task already has an active run", () => {
    const first = beginTaskRun({
      store: { version: 1, runs: [] },
      task: makeTask(),
      source: "manual",
      now: 100,
    });
    if (!first.ok) {
      throw new Error("expected first run");
    }

    const second = beginTaskRun({
      store: first.store,
      task: makeTask(),
      source: "scheduled",
      now: 200,
    });

    expect(second).toMatchObject({
      ok: false,
      reason: "active_run_exists",
      activeRun: first.run,
    });
  });

  it("records upstream lineage for chained downstream runs", () => {
    const upstream = beginTaskRun({
      store: { version: 1, runs: [] },
      task: makeTask({ id: "upstream" }),
      source: "manual",
      now: 100,
    });
    if (!upstream.ok) {
      throw new Error("expected upstream run");
    }
    const downstream = beginTaskRun({
      store: upstream.store,
      task: makeTask({ id: "downstream", chain: { groupId: "g", previousTaskId: "upstream" } }),
      source: "chained",
      upstreamRun: upstream.run,
      now: 200,
    });

    expect(downstream.ok).toBe(true);
    if (downstream.ok) {
      expect(downstream.run.trigger).toBe("chained");
      expect(downstream.run.upstreamRunId).toBe(upstream.run.runId);
    }
  });

  it("allows retry only for settled parent runs", () => {
    const store: TaskRunStoreData = { version: 1, runs: [] };
    const activeParent = beginTaskRun({
      store,
      task: makeTask(),
      source: "manual",
      now: 100,
    });
    if (!activeParent.ok) {
      throw new Error("expected active parent");
    }

    const rejected = beginTaskRunWithTrigger({
      store: { version: 1, runs: [] },
      task: makeTask({ id: "retry-task" }),
      trigger: "retry",
      parentRun: activeParent.run,
      now: 200,
    });
    expect(rejected).toMatchObject({ ok: false, reason: "parent_not_settled" });

    const settledParent = {
      ...activeParent.run,
      status: "failed" as const,
      finishedAt: 150,
      updatedAt: 150,
    };
    const accepted = beginTaskRunWithTrigger({
      store: { version: 1, runs: [settledParent] },
      task: makeTask({ id: "retry-task" }),
      trigger: "retry",
      parentRun: settledParent,
      now: 200,
    });

    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.run.parentRunId).toBe(settledParent.runId);
    }
  });

  it("rejects unsupported engines instead of creating fake runs", () => {
    const result = beginTaskRun({
      store: { version: 1, runs: [] },
      task: makeTask({ engineType: "opencode" }),
      source: "manual",
      now: 100,
    });

    expect(result).toMatchObject({ ok: false, reason: "unsupported_engine" });
  });
});
