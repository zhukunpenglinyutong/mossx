export type RuntimeSessionVisibilityPriority =
  | "foreground"
  | "background"
  | "restoring";

export type RuntimeLifecycleMutationForVisibilityChange =
  | "disconnect"
  | "terminate"
  | "pause"
  | "reacquire"
  | "restart";

export type RuntimeSessionLifecycleLike = {
  isProcessing?: boolean;
  isReviewing?: boolean;
  isContextCompacting?: boolean;
};

export type ResolveRuntimeSessionPriorityInput = {
  threadId: string;
  activeThreadId: string | null;
  status?: RuntimeSessionLifecycleLike | null;
  restoringThreadIds?: ReadonlySet<string> | null;
};

export function resolveRuntimeSessionVisibilityPriority({
  threadId,
  activeThreadId,
  status,
  restoringThreadIds,
}: ResolveRuntimeSessionPriorityInput): RuntimeSessionVisibilityPriority {
  if (threadId && restoringThreadIds?.has(threadId)) {
    return "restoring";
  }
  if (threadId && activeThreadId === threadId) {
    return "foreground";
  }
  if (
    status?.isProcessing ||
    status?.isReviewing ||
    status?.isContextCompacting
  ) {
    return "background";
  }
  return "background";
}

export function resolveRuntimeLifecycleMutationForVisibilityChange(
  _previous: RuntimeSessionVisibilityPriority,
  _next: RuntimeSessionVisibilityPriority,
): RuntimeLifecycleMutationForVisibilityChange | null {
  return null;
}

export type RuntimeOutputBufferEventKind =
  | "delta"
  | "completion"
  | "approval"
  | "error"
  | "toolBoundary"
  | "generatedImageBoundary"
  | "historyReconciliation";

export type RuntimeOutputBufferEvent = {
  id: string;
  workspaceId: string;
  threadId: string;
  turnId: string | null;
  itemId: string;
  revision: number;
  kind: RuntimeOutputBufferEventKind;
  payload: unknown;
  acceptedAtMs: number;
};

export type RuntimeOutputBufferState = {
  events: RuntimeOutputBufferEvent[];
  consumedEventIds: ReadonlySet<string>;
};

export type RuntimeOutputBufferSnapshot = {
  events: RuntimeOutputBufferEvent[];
  bufferedCount: number;
  oldestAcceptedAtMs: number | null;
  newestAcceptedAtMs: number | null;
  estimatedBytes: number;
  oldestAgeMs: number | null;
};

export type RuntimeOutputBufferLimits = {
  maxEvents: number;
  maxEstimatedBytes: number;
};

export type RuntimeOutputBufferLimitDiagnostic = {
  droppedEventIds: string[];
  bufferedCount: number;
  estimatedBytes: number;
  limitReason: "event-count" | "estimated-bytes" | null;
  requiresCanonicalSnapshot: boolean;
};

export type RuntimeOutputRenderRoute =
  | "render-now"
  | "buffer-output"
  | "deliver-boundary";

export type ResolveRuntimeOutputRenderRouteInput = {
  visibility: RuntimeSessionVisibilityPriority;
  event: Pick<RuntimeOutputBufferEvent, "kind">;
  backgroundRenderGatingEnabled: boolean;
  backgroundBufferedFlushEnabled: boolean;
};

export type RuntimeOutputHydrationPreemptionReason =
  | "typing"
  | "send"
  | "stop"
  | "approval"
  | "session-switch";

export type RuntimeOutputViewportPriority = {
  eventId: string;
  isVisible: boolean;
  distanceFromViewport: number | null;
  estimatedRenderCost: number | null;
};

export const emptyRuntimeOutputBufferState: RuntimeOutputBufferState = {
  events: [],
  consumedEventIds: new Set<string>(),
};

export function createRuntimeOutputBufferState(
  events: RuntimeOutputBufferEvent[] = [],
): RuntimeOutputBufferState {
  return {
    events: sortRuntimeOutputBufferEvents(events),
    consumedEventIds: new Set<string>(),
  };
}

export function enqueueRuntimeOutputBufferEvent(
  state: RuntimeOutputBufferState,
  event: RuntimeOutputBufferEvent,
): RuntimeOutputBufferState {
  if (state.consumedEventIds.has(event.id)) {
    return state;
  }
  if (state.events.some((candidate) => candidate.id === event.id)) {
    return state;
  }
  return {
    ...state,
    events: sortRuntimeOutputBufferEvents([...state.events, event]),
  };
}

export function enqueueRuntimeOutputBufferEventWithLimits(
  state: RuntimeOutputBufferState,
  event: RuntimeOutputBufferEvent,
  limits: RuntimeOutputBufferLimits,
): {
  nextState: RuntimeOutputBufferState;
  diagnostic: RuntimeOutputBufferLimitDiagnostic;
} {
  const enqueuedState = enqueueRuntimeOutputBufferEvent(state, event);
  if (enqueuedState === state) {
    return {
      nextState: state,
      diagnostic: buildRuntimeOutputBufferLimitDiagnostic(state, [], null),
    };
  }

  const safeMaxEvents = Math.max(1, Math.trunc(limits.maxEvents));
  const safeMaxEstimatedBytes = Math.max(1, Math.trunc(limits.maxEstimatedBytes));
  const nextEvents = enqueuedState.events;
  const droppedEventIds: string[] = [];
  let limitReason: RuntimeOutputBufferLimitDiagnostic["limitReason"] = null;

  while (nextEvents.length > safeMaxEvents) {
    const dropped = nextEvents.shift();
    if (dropped) {
      droppedEventIds.push(dropped.id);
      limitReason = "event-count";
    }
  }

  while (
    nextEvents.length > 1 &&
    estimateRuntimeOutputBufferBytes(nextEvents) > safeMaxEstimatedBytes
  ) {
    const dropped = nextEvents.shift();
    if (dropped) {
      droppedEventIds.push(dropped.id);
      limitReason = "estimated-bytes";
    }
  }

  const nextState = {
    ...enqueuedState,
    events: nextEvents,
  };
  return {
    nextState,
    diagnostic: buildRuntimeOutputBufferLimitDiagnostic(
      nextState,
      droppedEventIds,
      limitReason,
    ),
  };
}

export function flushRuntimeOutputBufferChunk(
  state: RuntimeOutputBufferState,
  maxEvents: number,
): {
  nextState: RuntimeOutputBufferState;
  flushedEvents: RuntimeOutputBufferEvent[];
} {
  const safeMaxEvents = Math.max(0, Math.trunc(maxEvents));
  if (safeMaxEvents === 0 || state.events.length === 0) {
    return { nextState: state, flushedEvents: [] };
  }
  const flushedEvents = state.events.slice(0, safeMaxEvents);
  const consumedEventIds = new Set(state.consumedEventIds);
  flushedEvents.forEach((event) => {
    consumedEventIds.add(event.id);
  });
  return {
    flushedEvents,
    nextState: {
      events: state.events.slice(flushedEvents.length),
      consumedEventIds,
    },
  };
}

export function getRuntimeOutputBufferSnapshot(
  state: RuntimeOutputBufferState,
  nowMs = Date.now(),
): RuntimeOutputBufferSnapshot {
  const firstEvent = state.events[0] ?? null;
  const lastEvent = state.events.at(-1) ?? null;
  return {
    events: state.events,
    bufferedCount: state.events.length,
    oldestAcceptedAtMs: firstEvent?.acceptedAtMs ?? null,
    newestAcceptedAtMs: lastEvent?.acceptedAtMs ?? null,
    estimatedBytes: estimateRuntimeOutputBufferBytes(state.events),
    oldestAgeMs: firstEvent
      ? Math.max(0, Math.trunc(nowMs - firstEvent.acceptedAtMs))
      : null,
  };
}

export function isRuntimeOutputSemanticBoundary(
  event: Pick<RuntimeOutputBufferEvent, "kind">,
) {
  return event.kind !== "delta";
}

export function resolveRuntimeOutputRenderRoute({
  visibility,
  event,
  backgroundRenderGatingEnabled,
  backgroundBufferedFlushEnabled,
}: ResolveRuntimeOutputRenderRouteInput): RuntimeOutputRenderRoute {
  if (!backgroundRenderGatingEnabled || !backgroundBufferedFlushEnabled) {
    return "render-now";
  }
  if (visibility === "foreground") {
    return "render-now";
  }
  if (isRuntimeOutputSemanticBoundary(event)) {
    return "deliver-boundary";
  }
  return "buffer-output";
}

export type RuntimeOutputHydrationStep = {
  kind: "shell" | "critical-controls" | "output-chunk";
  maxEvents: number;
};

export type RuntimeOutputHydrationCursor = {
  steps: RuntimeOutputHydrationStep[];
  nextStepIndex: number;
  cancelled: boolean;
};

export function buildRuntimeOutputHydrationPlan(
  bufferedCount: number,
  chunkSize: number,
): RuntimeOutputHydrationStep[] {
  const safeBufferedCount = Math.max(0, Math.trunc(bufferedCount));
  const safeChunkSize = Math.max(1, Math.trunc(chunkSize));
  const steps: RuntimeOutputHydrationStep[] = [
    { kind: "shell", maxEvents: 0 },
    { kind: "critical-controls", maxEvents: 0 },
  ];
  for (
    let remaining = safeBufferedCount;
    remaining > 0;
    remaining -= safeChunkSize
  ) {
    steps.push({
      kind: "output-chunk",
      maxEvents: Math.min(safeChunkSize, remaining),
    });
  }
  return steps;
}

export function createRuntimeOutputHydrationCursor(
  bufferedCount: number,
  chunkSize: number,
): RuntimeOutputHydrationCursor {
  return {
    steps: buildRuntimeOutputHydrationPlan(bufferedCount, chunkSize),
    nextStepIndex: 0,
    cancelled: false,
  };
}

export function advanceRuntimeOutputHydrationCursor(
  cursor: RuntimeOutputHydrationCursor,
): {
  nextCursor: RuntimeOutputHydrationCursor;
  step: RuntimeOutputHydrationStep | null;
} {
  if (cursor.cancelled || cursor.nextStepIndex >= cursor.steps.length) {
    return { nextCursor: cursor, step: null };
  }
  return {
    step: cursor.steps[cursor.nextStepIndex] ?? null,
    nextCursor: {
      ...cursor,
      nextStepIndex: cursor.nextStepIndex + 1,
    },
  };
}

export function cancelRuntimeOutputHydrationCursor(
  cursor: RuntimeOutputHydrationCursor,
): RuntimeOutputHydrationCursor {
  if (cursor.cancelled) {
    return cursor;
  }
  return {
    ...cursor,
    cancelled: true,
  };
}

export function preemptRuntimeOutputHydrationCursor(
  cursor: RuntimeOutputHydrationCursor,
  _reason: RuntimeOutputHydrationPreemptionReason,
): RuntimeOutputHydrationCursor {
  return cancelRuntimeOutputHydrationCursor(cursor);
}

export function prioritizeRuntimeOutputHydrationEvents(
  events: RuntimeOutputBufferEvent[],
  priorities: RuntimeOutputViewportPriority[],
): RuntimeOutputBufferEvent[] {
  if (events.length <= 1 || priorities.length === 0) {
    return events;
  }
  const priorityByEventId = new Map(
    priorities.map((priority) => [priority.eventId, priority]),
  );
  return events
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort((left, right) => {
      const leftPriority = priorityByEventId.get(left.event.id);
      const rightPriority = priorityByEventId.get(right.event.id);
      return (
        compareViewportPriority(leftPriority, rightPriority) ||
        left.originalIndex - right.originalIndex
      );
    })
    .map(({ event }) => event);
}

function sortRuntimeOutputBufferEvents(
  events: RuntimeOutputBufferEvent[],
): RuntimeOutputBufferEvent[] {
  return [...events].sort(compareRuntimeOutputBufferEvents);
}

function buildRuntimeOutputBufferLimitDiagnostic(
  state: RuntimeOutputBufferState,
  droppedEventIds: string[],
  limitReason: RuntimeOutputBufferLimitDiagnostic["limitReason"],
): RuntimeOutputBufferLimitDiagnostic {
  return {
    droppedEventIds,
    bufferedCount: state.events.length,
    estimatedBytes: estimateRuntimeOutputBufferBytes(state.events),
    limitReason,
    requiresCanonicalSnapshot: droppedEventIds.length > 0,
  };
}

function estimateRuntimeOutputBufferBytes(events: RuntimeOutputBufferEvent[]) {
  return events.reduce((total, event) => {
    const payload =
      typeof event.payload === "string"
        ? event.payload
        : safeStringifyRuntimeOutputPayload(event.payload);
    return total + event.id.length + event.itemId.length + event.threadId.length + payload.length;
  }, 0);
}

function safeStringifyRuntimeOutputPayload(payload: unknown) {
  try {
    return JSON.stringify(payload) ?? "";
  } catch {
    return String(payload);
  }
}

function compareRuntimeOutputBufferEvents(
  left: RuntimeOutputBufferEvent,
  right: RuntimeOutputBufferEvent,
) {
  return (
    compareNullableString(left.workspaceId, right.workspaceId) ||
    compareNullableString(left.threadId, right.threadId) ||
    compareNullableString(left.turnId, right.turnId) ||
    compareNullableString(left.itemId, right.itemId) ||
    left.revision - right.revision ||
    left.acceptedAtMs - right.acceptedAtMs ||
    compareRuntimeOutputEventKind(left.kind, right.kind) ||
    compareNullableString(left.id, right.id)
  );
}

function compareRuntimeOutputEventKind(
  left: RuntimeOutputBufferEventKind,
  right: RuntimeOutputBufferEventKind,
) {
  if (left === right) {
    return 0;
  }
  if (left === "delta") {
    return -1;
  }
  if (right === "delta") {
    return 1;
  }
  return left.localeCompare(right);
}

function compareNullableString(left: string | null, right: string | null) {
  return (left ?? "").localeCompare(right ?? "");
}

function compareViewportPriority(
  left: RuntimeOutputViewportPriority | undefined,
  right: RuntimeOutputViewportPriority | undefined,
) {
  const leftBucket = getViewportPriorityBucket(left);
  const rightBucket = getViewportPriorityBucket(right);
  if (leftBucket !== rightBucket) {
    return leftBucket - rightBucket;
  }
  const distanceDelta =
    normalizeViewportDistance(left?.distanceFromViewport) -
    normalizeViewportDistance(right?.distanceFromViewport);
  if (distanceDelta !== 0) {
    return distanceDelta;
  }
  return (
    normalizeRenderCost(left?.estimatedRenderCost) -
    normalizeRenderCost(right?.estimatedRenderCost)
  );
}

function getViewportPriorityBucket(
  priority: RuntimeOutputViewportPriority | undefined,
) {
  if (!priority) {
    return 2;
  }
  return priority.isVisible ? 0 : 1;
}

function normalizeViewportDistance(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : Number.MAX_SAFE_INTEGER;
}

function normalizeRenderCost(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : Number.MAX_SAFE_INTEGER;
}
