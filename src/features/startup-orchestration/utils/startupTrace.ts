export type StartupPhase =
  | "critical"
  | "first-paint"
  | "active-workspace"
  | "idle-prewarm"
  | "on-demand";

export type StartupTaskLifecycleState =
  | "queued"
  | "started"
  | "completed"
  | "failed"
  | "timed-out"
  | "cancelled"
  | "degraded";

export type StartupCancellationMode =
  | "none"
  | "soft-ignore"
  | "yield-only"
  | "cooperative-abort"
  | "hard-abort";

export type StartupFallbackReason = "timeout" | "failure" | "cancelled" | "stale";

export type StartupMilestoneName =
  | "shell-ready"
  | "input-ready"
  | "active-workspace-ready";

export type StartupWorkspaceScope = "global" | { workspaceId: string };

export type StartupTraceEvent =
  | {
      type: "task";
      sequence: number;
      timestamp: number;
      taskId: string;
      phase: StartupPhase;
      traceLabel: string;
      workspaceScope: StartupWorkspaceScope;
      lifecycleState: StartupTaskLifecycleState;
      durationMs: number | null;
      fallbackReason: StartupFallbackReason | null;
      cancellationMode: StartupCancellationMode | null;
      commandLabel: string | null;
    }
  | {
      type: "milestone";
      sequence: number;
      timestamp: number;
      milestone: StartupMilestoneName;
      taskSequences: number[];
    }
  | {
      type: "command";
      sequence: number;
      timestamp: number;
      commandLabel: string;
      workspaceScope: StartupWorkspaceScope;
      durationMs: number;
      status: "completed" | "failed";
    };

export type StartupTraceSnapshot = {
  events: StartupTraceEvent[];
  milestones: Partial<Record<StartupMilestoneName, StartupTraceEvent>>;
};

type StartupTraceEventInput =
  | Omit<Extract<StartupTraceEvent, { type: "task" }>, "sequence" | "timestamp">
  | Omit<Extract<StartupTraceEvent, { type: "milestone" }>, "sequence" | "timestamp">
  | Omit<Extract<StartupTraceEvent, { type: "command" }>, "sequence" | "timestamp">;

const DEFAULT_TRACE_LIMIT = 400;

let traceLimit = DEFAULT_TRACE_LIMIT;
let traceSequence = 0;
let traceEvents: StartupTraceEvent[] = [];
let traceSnapshot: StartupTraceSnapshot = {
  events: traceEvents,
  milestones: {},
};
const traceListeners = new Set<() => void>();

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function emitTraceEvent(event: StartupTraceEventInput) {
  const nextEvent = {
    ...event,
    sequence: ++traceSequence,
    timestamp: nowMs(),
  } as StartupTraceEvent;
  traceEvents = [...traceEvents, nextEvent].slice(-traceLimit);
  rebuildTraceSnapshot();
  traceListeners.forEach((listener) => {
    listener();
  });
  return nextEvent;
}

function rebuildTraceSnapshot() {
  const milestones: Partial<Record<StartupMilestoneName, StartupTraceEvent>> = {};
  for (const event of traceEvents) {
    if (event.type === "milestone") {
      milestones[event.milestone] = event;
    }
  }
  traceSnapshot = {
    events: traceEvents,
    milestones,
  };
}

export function configureStartupTraceForTests(limit = DEFAULT_TRACE_LIMIT) {
  traceLimit = Math.max(1, Math.floor(limit));
}

export function resetStartupTraceForTests() {
  traceSequence = 0;
  traceEvents = [];
  traceLimit = DEFAULT_TRACE_LIMIT;
  rebuildTraceSnapshot();
  traceListeners.forEach((listener) => {
    listener();
  });
}

export function subscribeStartupTrace(listener: () => void) {
  traceListeners.add(listener);
  return () => {
    traceListeners.delete(listener);
  };
}

export function getStartupTraceSnapshot(): StartupTraceSnapshot {
  return traceSnapshot;
}

export function recordStartupTaskTrace(
  event: Omit<Extract<StartupTraceEvent, { type: "task" }>, "sequence" | "timestamp">,
) {
  return emitTraceEvent(event);
}

export function recordStartupCommandTrace(
  event: Omit<Extract<StartupTraceEvent, { type: "command" }>, "sequence" | "timestamp">,
) {
  return emitTraceEvent(event);
}

export function recordStartupMilestone(milestone: StartupMilestoneName) {
  const taskSequences = traceEvents
    .filter((event) => event.type === "task")
    .map((event) => event.sequence);
  return emitTraceEvent({
    type: "milestone",
    milestone,
    taskSequences,
  });
}

export async function traceStartupCommand<T>(
  commandLabel: string,
  workspaceScope: StartupWorkspaceScope,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = nowMs();
  try {
    const result = await run();
    recordStartupCommandTrace({
      type: "command",
      commandLabel,
      workspaceScope,
      durationMs: nowMs() - startedAt,
      status: "completed",
    });
    return result;
  } catch (error) {
    recordStartupCommandTrace({
      type: "command",
      commandLabel,
      workspaceScope,
      durationMs: nowMs() - startedAt,
      status: "failed",
    });
    throw error;
  }
}
