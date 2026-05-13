import { describe, expect, it } from "vitest";
import {
  buildRuntimeOutputHydrationPlan,
  cancelRuntimeOutputHydrationCursor,
  createRuntimeOutputBufferState,
  createRuntimeOutputHydrationCursor,
  advanceRuntimeOutputHydrationCursor,
  enqueueRuntimeOutputBufferEvent,
  enqueueRuntimeOutputBufferEventWithLimits,
  flushRuntimeOutputBufferChunk,
  getRuntimeOutputBufferSnapshot,
  isRuntimeOutputSemanticBoundary,
  preemptRuntimeOutputHydrationCursor,
  prioritizeRuntimeOutputHydrationEvents,
  resolveRuntimeLifecycleMutationForVisibilityChange,
  resolveRuntimeOutputRenderRoute,
  resolveRuntimeSessionVisibilityPriority,
  type RuntimeOutputBufferEvent,
} from "./runtimeSessionScheduling";

function event(
  id: string,
  overrides: Partial<RuntimeOutputBufferEvent> = {},
): RuntimeOutputBufferEvent {
  return {
    id,
    workspaceId: "workspace-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    revision: 1,
    kind: "delta",
    payload: `payload-${id}`,
    acceptedAtMs: 1,
    ...overrides,
  };
}

describe("runtimeSessionScheduling", () => {
  it("derives foreground, background, and restoring visibility priority", () => {
    expect(
      resolveRuntimeSessionVisibilityPriority({
        threadId: "thread-1",
        activeThreadId: "thread-1",
        status: { isProcessing: true },
      }),
    ).toBe("foreground");
    expect(
      resolveRuntimeSessionVisibilityPriority({
        threadId: "thread-2",
        activeThreadId: "thread-1",
        status: { isProcessing: true },
      }),
    ).toBe("background");
    expect(
      resolveRuntimeSessionVisibilityPriority({
        threadId: "thread-2",
        activeThreadId: "thread-1",
        status: { isProcessing: true },
        restoringThreadIds: new Set(["thread-2"]),
      }),
    ).toBe("restoring");
  });

  it("keeps buffered events ordered and consumes each event once", () => {
    let state = createRuntimeOutputBufferState();
    state = enqueueRuntimeOutputBufferEvent(
      state,
      event("event-3", { revision: 3, acceptedAtMs: 3 }),
    );
    state = enqueueRuntimeOutputBufferEvent(
      state,
      event("event-1", { revision: 1, acceptedAtMs: 1 }),
    );
    state = enqueueRuntimeOutputBufferEvent(
      state,
      event("event-2", { revision: 2, acceptedAtMs: 2 }),
    );
    state = enqueueRuntimeOutputBufferEvent(
      state,
      event("event-2", { revision: 2, acceptedAtMs: 2 }),
    );

    expect(getRuntimeOutputBufferSnapshot(state).events.map((item) => item.id)).toEqual([
      "event-1",
      "event-2",
      "event-3",
    ]);

    const firstFlush = flushRuntimeOutputBufferChunk(state, 2);
    expect(firstFlush.flushedEvents.map((item) => item.id)).toEqual([
      "event-1",
      "event-2",
    ]);
    expect(
      getRuntimeOutputBufferSnapshot(firstFlush.nextState).events.map((item) => item.id),
    ).toEqual(["event-3"]);

    const duplicateAfterConsumption = enqueueRuntimeOutputBufferEvent(
      firstFlush.nextState,
      event("event-1", { revision: 1, acceptedAtMs: 1 }),
    );
    expect(duplicateAfterConsumption).toBe(firstFlush.nextState);
  });

  it("reports buffer depth, age, and estimated bytes", () => {
    const state = createRuntimeOutputBufferState([
      event("event-1", { acceptedAtMs: 100, payload: "hello" }),
    ]);

    expect(getRuntimeOutputBufferSnapshot(state, 160)).toMatchObject({
      bufferedCount: 1,
      oldestAcceptedAtMs: 100,
      newestAcceptedAtMs: 100,
      oldestAgeMs: 60,
    });
    expect(getRuntimeOutputBufferSnapshot(state, 160).estimatedBytes).toBeGreaterThan(0);
  });

  it("bounds buffered events by count and records diagnostics", () => {
    let state = createRuntimeOutputBufferState();
    state = enqueueRuntimeOutputBufferEventWithLimits(
      state,
      event("event-1", { revision: 1 }),
      { maxEvents: 2, maxEstimatedBytes: 10_000 },
    ).nextState;
    state = enqueueRuntimeOutputBufferEventWithLimits(
      state,
      event("event-2", { revision: 2 }),
      { maxEvents: 2, maxEstimatedBytes: 10_000 },
    ).nextState;
    const bounded = enqueueRuntimeOutputBufferEventWithLimits(
      state,
      event("event-3", { revision: 3 }),
      { maxEvents: 2, maxEstimatedBytes: 10_000 },
    );

    expect(bounded.nextState.events.map((item) => item.id)).toEqual([
      "event-2",
      "event-3",
    ]);
    expect(bounded.diagnostic).toMatchObject({
      droppedEventIds: ["event-1"],
      bufferedCount: 2,
      limitReason: "event-count",
      requiresCanonicalSnapshot: true,
    });
  });

  it("routes inactive deltas through background budget while delivering boundaries", () => {
    expect(
      resolveRuntimeOutputRenderRoute({
        visibility: "background",
        event: event("delta"),
        backgroundRenderGatingEnabled: true,
        backgroundBufferedFlushEnabled: true,
      }),
    ).toBe("buffer-output");
    expect(
      resolveRuntimeOutputRenderRoute({
        visibility: "background",
        event: event("approval", { kind: "approval" }),
        backgroundRenderGatingEnabled: true,
        backgroundBufferedFlushEnabled: true,
      }),
    ).toBe("deliver-boundary");
    expect(
      resolveRuntimeOutputRenderRoute({
        visibility: "background",
        event: event("delta"),
        backgroundRenderGatingEnabled: false,
        backgroundBufferedFlushEnabled: true,
      }),
    ).toBe("render-now");
  });

  it("classifies semantic boundaries separately from plain deltas", () => {
    expect(isRuntimeOutputSemanticBoundary(event("delta"))).toBe(false);
    expect(
      isRuntimeOutputSemanticBoundary(event("completion", { kind: "completion" })),
    ).toBe(true);
    expect(isRuntimeOutputSemanticBoundary(event("error", { kind: "error" }))).toBe(
      true,
    );
    expect(
      isRuntimeOutputSemanticBoundary(
        event("history", { kind: "historyReconciliation" }),
      ),
    ).toBe(true);
  });

  it("builds shell-first hydration steps before output chunks", () => {
    expect(buildRuntimeOutputHydrationPlan(5, 2)).toEqual([
      { kind: "shell", maxEvents: 0 },
      { kind: "critical-controls", maxEvents: 0 },
      { kind: "output-chunk", maxEvents: 2 },
      { kind: "output-chunk", maxEvents: 2 },
      { kind: "output-chunk", maxEvents: 1 },
    ]);
  });

  it("advances and cancels hydration cursor for interaction preemption", () => {
    let cursor = createRuntimeOutputHydrationCursor(3, 2);
    const first = advanceRuntimeOutputHydrationCursor(cursor);
    expect(first.step).toEqual({ kind: "shell", maxEvents: 0 });

    cursor = cancelRuntimeOutputHydrationCursor(first.nextCursor);
    const afterCancel = advanceRuntimeOutputHydrationCursor(cursor);
    expect(afterCancel.step).toBeNull();
    expect(afterCancel.nextCursor).toBe(cursor);
  });

  it("preempts hydration for send-critical user actions", () => {
    const cursor = createRuntimeOutputHydrationCursor(3, 2);
    const preempted = preemptRuntimeOutputHydrationCursor(cursor, "send");

    expect(preempted.cancelled).toBe(true);
    expect(advanceRuntimeOutputHydrationCursor(preempted).step).toBeNull();
  });

  it("prioritizes viewport-near output before offscreen heavy content", () => {
    const ordered = prioritizeRuntimeOutputHydrationEvents(
      [
        event("offscreen-heavy", { revision: 1 }),
        event("visible-expensive", { revision: 2 }),
        event("nearby-cheap", { revision: 3 }),
      ],
      [
        {
          eventId: "offscreen-heavy",
          isVisible: false,
          distanceFromViewport: 5000,
          estimatedRenderCost: 200,
        },
        {
          eventId: "visible-expensive",
          isVisible: true,
          distanceFromViewport: 0,
          estimatedRenderCost: 400,
        },
        {
          eventId: "nearby-cheap",
          isVisible: false,
          distanceFromViewport: 40,
          estimatedRenderCost: 10,
        },
      ],
    );

    expect(ordered.map((item) => item.id)).toEqual([
      "visible-expensive",
      "nearby-cheap",
      "offscreen-heavy",
    ]);
  });

  it("never maps visibility changes to runtime lifecycle mutations", () => {
    expect(
      resolveRuntimeLifecycleMutationForVisibilityChange(
        "foreground",
        "background",
      ),
    ).toBeNull();
    expect(
      resolveRuntimeLifecycleMutationForVisibilityChange(
        "background",
        "restoring",
      ),
    ).toBeNull();
    expect(
      resolveRuntimeLifecycleMutationForVisibilityChange(
        "restoring",
        "foreground",
      ),
    ).toBeNull();
  });
});
