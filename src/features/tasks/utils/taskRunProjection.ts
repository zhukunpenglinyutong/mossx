import type { KanbanTask, KanbanTaskExecutionSource } from "../../kanban/types";
import type {
  KanbanLatestRunSummary,
  TaskRunRecord,
  TaskRunTrigger,
} from "../types";
import { isTaskRunActive } from "./taskRunStorage";

export function buildLatestRunSummary(
  run: TaskRunRecord | null | undefined,
): KanbanLatestRunSummary | null {
  if (!run) {
    return null;
  }
  return {
    runId: run.runId,
    status: run.status,
    trigger: run.trigger,
    engine: run.engine,
    linkedThreadId: run.linkedThreadId ?? null,
    latestOutputSummary: run.latestOutputSummary ?? null,
    blockedReason: run.blockedReason ?? null,
    failureReason: run.failureReason ?? null,
    artifactCount: run.artifacts.length,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt ?? null,
  };
}

export function findLatestRunForTask(
  runs: TaskRunRecord[],
  taskId: string,
): TaskRunRecord | null {
  return [...runs]
    .filter((run) => run.task.taskId === taskId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

export function projectLatestRunSummaryToTasks(
  tasks: KanbanTask[],
  runs: TaskRunRecord[],
): KanbanTask[] {
  return tasks.map((task) => {
    const summary = buildLatestRunSummary(findLatestRunForTask(runs, task.id));
    if (!summary && !task.latestRunSummary) {
      return task;
    }
    return {
      ...task,
      latestRunSummary: summary,
    };
  });
}

export function hasActiveRunConflict(
  runs: TaskRunRecord[],
  taskId: string,
  exceptRunId?: string | null,
): boolean {
  return runs.some(
    (run) =>
      run.task.taskId === taskId &&
      run.runId !== exceptRunId &&
      isTaskRunActive(run.status),
  );
}

export function mapExecutionSourceToRunTrigger(
  source: KanbanTaskExecutionSource,
): TaskRunTrigger {
  if (source === "scheduled") {
    return "scheduled";
  }
  if (source === "chained") {
    return "chained";
  }
  return "manual";
}
