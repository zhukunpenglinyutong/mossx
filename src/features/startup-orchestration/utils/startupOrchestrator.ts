import {
  recordStartupTaskTrace,
  type StartupCancellationMode,
  type StartupFallbackReason,
  type StartupPhase,
  type StartupWorkspaceScope,
} from "./startupTrace";

export type StartupCancelPolicy =
  | "none"
  | "soft-ignore"
  | "yield-only"
  | "cooperative-abort"
  | "hard-abort";

export type StartupTaskContext = {
  signal: AbortSignal;
  generation: number;
  isStale: () => boolean;
};

export type StartupTaskDescriptor<T> = {
  id: string;
  phase: StartupPhase;
  priority: number;
  dedupeKey: string;
  concurrencyKey: string;
  timeoutMs: number;
  workspaceScope: StartupWorkspaceScope;
  cancelPolicy: StartupCancelPolicy;
  traceLabel: string;
  commandLabel?: string;
  run: (context: StartupTaskContext) => Promise<T>;
  fallback: (reason: StartupFallbackReason) => T | Promise<T>;
};

export type StartupOrchestratorOptions = {
  phaseConcurrency?: Partial<Record<StartupPhase, number>>;
  heavyCommandConcurrency?: Partial<Record<string, number>>;
  idleSliceBudgetMs?: number;
};

const DEFAULT_PHASE_CONCURRENCY: Record<StartupPhase, number> = {
  critical: 1,
  "first-paint": 1,
  "active-workspace": 2,
  "idle-prewarm": 1,
  "on-demand": 2,
};

type QueuedTask<T> = {
  descriptor: StartupTaskDescriptor<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  queuedAt: number;
  generation: number;
};

type RunningTask = {
  abortController: AbortController;
  descriptor: StartupTaskDescriptor<unknown>;
  generation: number;
  startedAt: number;
};

function nowMs() {
  return Date.now();
}

function phaseRank(phase: StartupPhase) {
  switch (phase) {
    case "critical":
      return 0;
    case "first-paint":
      return 1;
    case "active-workspace":
      return 2;
    case "idle-prewarm":
      return 3;
    case "on-demand":
      return 4;
  }
}

function toCancellationMode(policy: StartupCancelPolicy): StartupCancellationMode {
  return policy;
}

function yieldToLaterTask() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 1);
  });
}

export class StartupOrchestrator {
  private readonly phaseConcurrency: Record<StartupPhase, number>;
  private readonly heavyCommandConcurrency: Partial<Record<string, number>>;
  private readonly idleSliceBudgetMs: number;
  private readonly queue: QueuedTask<unknown>[] = [];
  private readonly inFlightByDedupeKey = new Map<string, Promise<unknown>>();
  private readonly runningByDedupeKey = new Map<string, RunningTask>();
  private readonly runningCountByPhase = new Map<StartupPhase, number>();
  private readonly runningCountByConcurrencyKey = new Map<string, number>();
  private readonly cancelledGenerations = new Set<number>();
  private lastIdleSliceStartedAt: number | null = null;
  private idleDrainResumedAfterYield = false;
  private idleResumeScheduled = false;
  private generation = 0;

  constructor(options: StartupOrchestratorOptions = {}) {
    this.phaseConcurrency = {
      ...DEFAULT_PHASE_CONCURRENCY,
      ...options.phaseConcurrency,
    };
    this.heavyCommandConcurrency = options.heavyCommandConcurrency ?? {};
    this.idleSliceBudgetMs = options.idleSliceBudgetMs ?? 16;
  }

  run<T>(descriptor: StartupTaskDescriptor<T>): Promise<T> {
    const existing = this.inFlightByDedupeKey.get(descriptor.dedupeKey);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        descriptor,
        resolve: (value: unknown) => resolve(value as T),
        reject,
        queuedAt: nowMs(),
        generation: ++this.generation,
      });
      recordStartupTaskTrace({
        type: "task",
        taskId: descriptor.id,
        phase: descriptor.phase,
        traceLabel: descriptor.traceLabel,
        workspaceScope: descriptor.workspaceScope,
        lifecycleState: "queued",
        durationMs: null,
        fallbackReason: null,
        cancellationMode: null,
        commandLabel: descriptor.commandLabel ?? null,
      });
      this.drainQueue();
    });

    this.inFlightByDedupeKey.set(descriptor.dedupeKey, promise);
    promise.then(
      () => {
        this.inFlightByDedupeKey.delete(descriptor.dedupeKey);
      },
      () => {
        this.inFlightByDedupeKey.delete(descriptor.dedupeKey);
      },
    );
    return promise;
  }

  cancelWorkspaceTasks(workspaceId: string, reason: StartupFallbackReason = "stale") {
    for (const queuedTask of [...this.queue]) {
      if (!this.matchesWorkspace(queuedTask.descriptor.workspaceScope, workspaceId)) {
        continue;
      }
      this.removeQueuedTask(queuedTask);
      void this.settleWithFallback(queuedTask, reason, "cancelled");
    }

    for (const runningTask of this.runningByDedupeKey.values()) {
      if (!this.matchesWorkspace(runningTask.descriptor.workspaceScope, workspaceId)) {
        continue;
      }
      if (runningTask.descriptor.cancelPolicy === "hard-abort") {
        runningTask.abortController.abort();
      }
      this.cancelledGenerations.add(runningTask.generation);
      recordStartupTaskTrace({
        type: "task",
        taskId: runningTask.descriptor.id,
        phase: runningTask.descriptor.phase,
        traceLabel: runningTask.descriptor.traceLabel,
        workspaceScope: runningTask.descriptor.workspaceScope,
        lifecycleState: "cancelled",
        durationMs: nowMs() - runningTask.startedAt,
        fallbackReason: reason,
        cancellationMode: toCancellationMode(runningTask.descriptor.cancelPolicy),
        commandLabel: runningTask.descriptor.commandLabel ?? null,
      });
    }
  }

  getQueuedTaskCount() {
    return this.queue.length;
  }

  private drainQueue() {
    this.queue.sort((left, right) => {
      const phaseDelta = phaseRank(left.descriptor.phase) - phaseRank(right.descriptor.phase);
      if (phaseDelta !== 0) {
        return phaseDelta;
      }
      const priorityDelta = right.descriptor.priority - left.descriptor.priority;
      return priorityDelta !== 0 ? priorityDelta : left.queuedAt - right.queuedAt;
    });

    for (const task of [...this.queue]) {
      if (!this.canStart(task.descriptor)) {
        continue;
      }
      if (this.shouldYieldIdleTask(task.descriptor)) {
        void this.resumeIdleDrainLater();
        return;
      }
      this.removeQueuedTask(task);
      void this.startTask(task);
    }
  }

  private canStart(descriptor: StartupTaskDescriptor<unknown>) {
    const phaseCount = this.runningCountByPhase.get(descriptor.phase) ?? 0;
    if (phaseCount >= this.phaseConcurrency[descriptor.phase]) {
      return false;
    }
    const concurrencyLimit = this.heavyCommandConcurrency[descriptor.concurrencyKey];
    if (
      typeof concurrencyLimit === "number" &&
      (this.runningCountByConcurrencyKey.get(descriptor.concurrencyKey) ?? 0) >=
        concurrencyLimit
    ) {
      return false;
    }
    return true;
  }

  private async startTask<T>(task: QueuedTask<T>) {
    const descriptor = task.descriptor;
    const abortController = new AbortController();
    const startedAt = nowMs();
    const runningTask: RunningTask = {
      abortController,
      descriptor: descriptor as StartupTaskDescriptor<unknown>,
      generation: task.generation,
      startedAt,
    };
    this.runningByDedupeKey.set(descriptor.dedupeKey, runningTask);
    this.incrementRunning(descriptor);
    recordStartupTaskTrace({
      type: "task",
      taskId: descriptor.id,
      phase: descriptor.phase,
      traceLabel: descriptor.traceLabel,
      workspaceScope: descriptor.workspaceScope,
      lifecycleState: "started",
      durationMs: null,
      fallbackReason: null,
      cancellationMode: null,
      commandLabel: descriptor.commandLabel ?? null,
    });

    try {
      const result = await this.runWithTimeout(descriptor, {
        signal: abortController.signal,
        generation: task.generation,
        isStale: () => this.cancelledGenerations.has(task.generation),
      });
      if (this.cancelledGenerations.has(task.generation)) {
        await this.settleWithFallback(task, "stale", "cancelled", startedAt);
        return;
      }
      recordStartupTaskTrace({
        type: "task",
        taskId: descriptor.id,
        phase: descriptor.phase,
        traceLabel: descriptor.traceLabel,
        workspaceScope: descriptor.workspaceScope,
        lifecycleState: "completed",
        durationMs: nowMs() - startedAt,
        fallbackReason: null,
        cancellationMode: null,
        commandLabel: descriptor.commandLabel ?? null,
      });
      task.resolve(result);
    } catch (error) {
      if (error instanceof StartupTaskTimeoutError) {
        recordStartupTaskTrace({
          type: "task",
          taskId: descriptor.id,
          phase: descriptor.phase,
          traceLabel: descriptor.traceLabel,
          workspaceScope: descriptor.workspaceScope,
          lifecycleState: "timed-out",
          durationMs: nowMs() - startedAt,
          fallbackReason: "timeout",
          cancellationMode: null,
          commandLabel: descriptor.commandLabel ?? null,
        });
        await this.settleWithFallback(task, "timeout", "degraded", startedAt);
        return;
      }
      if (this.cancelledGenerations.has(task.generation)) {
        await this.settleWithFallback(task, "stale", "cancelled", startedAt);
        return;
      }
      recordStartupTaskTrace({
        type: "task",
        taskId: descriptor.id,
        phase: descriptor.phase,
        traceLabel: descriptor.traceLabel,
        workspaceScope: descriptor.workspaceScope,
        lifecycleState: "failed",
        durationMs: nowMs() - startedAt,
        fallbackReason: "failure",
        cancellationMode: null,
        commandLabel: descriptor.commandLabel ?? null,
      });
      task.reject(error);
    } finally {
      this.runningByDedupeKey.delete(descriptor.dedupeKey);
      this.cancelledGenerations.delete(task.generation);
      this.decrementRunning(descriptor);
      this.drainQueue();
    }
  }

  private async runWithTimeout<T>(
    descriptor: StartupTaskDescriptor<T>,
    context: StartupTaskContext,
  ) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        descriptor.run(context),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new StartupTaskTimeoutError());
          }, descriptor.timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async settleWithFallback<T>(
    task: QueuedTask<T>,
    reason: StartupFallbackReason,
    lifecycleState: "cancelled" | "degraded",
    startedAt?: number,
  ) {
    try {
      const fallbackValue = await task.descriptor.fallback(reason);
      recordStartupTaskTrace({
        type: "task",
        taskId: task.descriptor.id,
        phase: task.descriptor.phase,
        traceLabel: task.descriptor.traceLabel,
        workspaceScope: task.descriptor.workspaceScope,
        lifecycleState,
        durationMs: typeof startedAt === "number" ? nowMs() - startedAt : null,
        fallbackReason: reason,
        cancellationMode:
          lifecycleState === "cancelled"
            ? toCancellationMode(task.descriptor.cancelPolicy)
            : null,
        commandLabel: task.descriptor.commandLabel ?? null,
      });
      task.resolve(fallbackValue);
    } catch (fallbackError) {
      task.reject(fallbackError);
    }
  }

  private incrementRunning(descriptor: StartupTaskDescriptor<unknown>) {
    this.runningCountByPhase.set(
      descriptor.phase,
      (this.runningCountByPhase.get(descriptor.phase) ?? 0) + 1,
    );
    this.runningCountByConcurrencyKey.set(
      descriptor.concurrencyKey,
      (this.runningCountByConcurrencyKey.get(descriptor.concurrencyKey) ?? 0) + 1,
    );
  }

  private decrementRunning(descriptor: StartupTaskDescriptor<unknown>) {
    this.runningCountByPhase.set(
      descriptor.phase,
      Math.max(0, (this.runningCountByPhase.get(descriptor.phase) ?? 0) - 1),
    );
    this.runningCountByConcurrencyKey.set(
      descriptor.concurrencyKey,
      Math.max(0, (this.runningCountByConcurrencyKey.get(descriptor.concurrencyKey) ?? 0) - 1),
    );
  }

  private removeQueuedTask(task: QueuedTask<unknown>) {
    const index = this.queue.indexOf(task);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  private matchesWorkspace(scope: StartupWorkspaceScope, workspaceId: string) {
    return typeof scope === "object" && scope.workspaceId === workspaceId;
  }

  private shouldYieldIdleTask(descriptor: StartupTaskDescriptor<unknown>) {
    if (descriptor.phase !== "idle-prewarm") {
      return false;
    }
    if (this.idleDrainResumedAfterYield) {
      this.idleDrainResumedAfterYield = false;
      this.lastIdleSliceStartedAt = nowMs();
      return false;
    }
    if (this.lastIdleSliceStartedAt === null) {
      this.lastIdleSliceStartedAt = nowMs();
      return false;
    }
    if (nowMs() - this.lastIdleSliceStartedAt < this.idleSliceBudgetMs) {
      return false;
    }
    this.lastIdleSliceStartedAt = nowMs();
    return true;
  }

  private async resumeIdleDrainLater() {
    if (this.idleResumeScheduled) {
      return;
    }
    this.idleResumeScheduled = true;
    await yieldToLaterTask();
    this.idleResumeScheduled = false;
    this.idleDrainResumedAfterYield = true;
    this.drainQueue();
  }

  getIdleSliceBudgetMs() {
    return this.idleSliceBudgetMs;
  }
}

class StartupTaskTimeoutError extends Error {
  constructor() {
    super("Startup task timed out");
    this.name = "StartupTaskTimeoutError";
  }
}

export const startupOrchestrator = new StartupOrchestrator();
