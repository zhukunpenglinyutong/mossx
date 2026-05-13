## Context

The realtime conversation client already batches delta updates and uses React scheduling to reduce foreground render pressure. That improved switching responsiveness, but it also exposed a lifecycle race: a turn can reach terminal settlement while older realtime work is still buffered in timer queues or already queued through `startTransition`.

Before this change, `flushPendingRealtimeEvents()` reduced the local batching window before terminal settlement, but it did not protect execution that had already been scheduled. It also did not guarantee that legacy/fallback event routing preserved `turnId` to the final handlers. The result was a possible contradiction: final assistant output was visible and terminal settlement had run, but late delta/snapshot work could still re-open `processing` or append to a completed turn.

The implementation remains frontend-only. It preserves provider/runtime protocol semantics and treats backend terminal events as authoritative lifecycle signals.

## Goals / Non-Goals

**Goals:**

- Prevent stale realtime work from mutating live state after the same turn has reached `completed`, `error`, or `stalled`.
- Preserve `turnId` across normalized and legacy fallback paths so terminal filtering works for agent completion, reasoning, command output, terminal interaction, and file-change output.
- Apply terminal filtering both at the event-handler boundary and at the actual state-mutation execution point.
- Keep normal newer-turn streaming unaffected when an older turn settles late.
- Provide a conservative settlement fallback when final assistant output is visible, normal completion settlement is rejected, and no newer active turn exists.
- Cover the behavior with focused hook tests and one `useThreads` integration regression.

**Non-Goals:**

- Do not change backend provider protocols or introduce a new terminal event type.
- Do not remove existing `activeTurnId` guards in `useThreadTurnEvents`.
- Do not treat arbitrary `item/completed` as turn terminal.
- Do not reuse this change to implement background render buffering or session visibility scheduling.

## Decisions

### Decision: Keep the terminal fence local to realtime item/event handling

`useThreadItemEvents` owns the per-thread realtime fence:

- `noteRealtimeTurnStarted(threadId, turnId)` records the active realtime turn.
- `markRealtimeTurnTerminal(threadId, turnId)` records a bounded set of recently terminal turn ids.
- `isRealtimeTurnTerminalExact(threadId, turnId)` exposes exact turn matching to the outer event handler.

This keeps the fence close to the high-frequency paths it protects: batched delta operations, normalized realtime operations, raw item snapshots, and queued transition dispatch.

Alternative considered: storing terminal turn ids in the global reducer state. That would make diagnostics easier to inspect, but it would also increase reducer churn on terminal events and expose an implementation detail that only the realtime routing layer needs.

### Decision: Filter twice, once at handler entry and once at execution

`useThreadEventHandlers` performs an early exact-turn check before invoking downstream item/realtime handlers. `useThreadItemEvents` still checks again when buffered or scheduled work actually executes.

The early check prevents legacy raw snapshots from doing side effects such as diagnostic progress recording or continuation evidence. The execution check protects work that was accepted before terminal settlement but executes later.

Alternative considered: relying only on the execution check. That was insufficient for outer-handler side effects and for call paths that can update lifecycle evidence before reaching the item hook.

### Decision: Preserve `turnId` through fallback event routing

Fallback event routing in `useAppServerEvents` must pass `turnId` through the final handler call shape. This applies to:

- agent delta and fallback assistant completion
- reasoning summary/content delta and boundary events
- command output, terminal interaction, and file-change output

Without this, the terminal fence can only fall back to the currently active turn. Exact `turnId` propagation is safer because it blocks stale work without suppressing a newer turn on the same thread.

Alternative considered: infer the turn from active thread lifecycle state. That is acceptable only as a last resort; it becomes ambiguous during turn replacement, alias resolution, or late backend delivery.

### Decision: Conservative fallback settlement stays in `useThreadEventHandlers`

When `turn/completed` settlement is rejected but final assistant output is already visible, the frontend applies fallback settlement only if no newer active turn exists for that thread. The fallback mirrors existing terminal cleanup operations: clear processing generated images, mark terminal settlement, finalize pending tool statuses, clear context compaction, settle plan state, mark processing false, clear active turn, reset agent segment, and mark the latest assistant message final.

This fallback is intentionally above `useThreadTurnEvents`; it avoids weakening the lower-level active-turn guard that protects newer turns.

Alternative considered: changing `useThreadTurnEvents` to always settle rejected completion events when final text is visible. That would blur the guard boundary and increase risk of clearing a newer active turn.

## Risks / Trade-offs

- Late events without any turn id can still only be filtered by active-turn fallback inside `useThreadItemEvents`. Mitigation: preserve `turnId` in all known normalized and legacy fallback routes.
- The terminal fence is in-memory and scoped to the frontend session. Mitigation: it protects live races; restart/replay correctness remains covered by history and lifecycle contracts.
- A bounded terminal turn set could evict a very old turn id. Mitigation: only recent live races are relevant, and the bound prevents unbounded memory growth in long sessions.
- Conservative fallback settlement could hide a backend ordering bug if overused. Mitigation: it only runs with final assistant evidence and no newer active turn, and emits forced diagnostics.

## Migration Plan

1. Deploy the frontend-only change with no backend or storage migration.
2. Validate with focused Vitest suites:
   - `src/features/app/hooks/useAppServerEvents.test.tsx`
   - `src/features/threads/hooks/useThreadItemEvents.test.ts`
   - `src/features/threads/hooks/useThreadEventHandlers.test.ts`
   - `src/features/threads/hooks/useThreadTurnEvents.test.tsx`
   - `src/features/threads/hooks/useThreads.integration.test.tsx`
3. Validate TypeScript signatures with `npm run typecheck`.
4. Roll back by reverting the frontend hook and routing changes; no persisted data or backend state requires migration.

## Open Questions

- Whether production diagnostics should expose a lightweight counter for terminal-fenced events by engine/thread to help confirm field behavior after release.
- Whether future backend events should make `turnId` mandatory for all realtime item/delta/fallback event families.
