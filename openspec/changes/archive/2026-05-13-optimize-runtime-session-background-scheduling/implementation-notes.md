## Source Map

- Active thread selection:
  - `src/features/threads/hooks/useThreads.ts`
  - `src/features/threads/hooks/useThreadSelectors.ts`
  - State source: `ThreadState.activeThreadIdByWorkspace`
- Realtime event ingestion:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - Normalized event routing enters thread handlers through `onNormalizedRealtimeEvent`, `onAgentMessageDelta`, `onReasoningSummaryDelta`, `onReasoningTextDelta`, `onCommandOutputDelta`, and `onFileChangeOutputDelta`.
- Canonical conversation state:
  - `src/features/threads/hooks/useThreadsReducer.ts`
  - State source: `ThreadState.itemsByThread`, `ThreadState.threadStatusById`, `ThreadState.activeTurnIdByThread`
- Visible conversation render:
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
  - Existing streaming guard: `Messages Streaming Render Contract`

## Hot Path Findings

- `useThreadSelectors` previously memoized `activeItems` with `[activeThreadId, itemsByThread]`.
- Every realtime update to any thread replaces `itemsByThread`, so inactive running session deltas could invalidate active selection even when the active thread item array did not change.
- This is a low-level render amplification point because `activeItems` is consumed by app-shell layout, sidebar projection, composer/search/radar sections, and `Messages`.
- The first implementation narrows `activeItems` dependency to the active thread item array reference, so background thread item updates no longer change the selector result object.

## Current Implementation Boundary

- Runtime event ingestion remains lossless and unchanged.
- Runtime lifecycle actions remain unchanged.
- The production mitigation is intentionally applied at the render/projection boundary, not by delaying canonical reducer ingestion. This preserves background task continuity, storage convergence, search/history correctness, and late-event ordering.
- Inactive high-frequency output is routed away from foreground render pressure through selector isolation plus deferred consumers in app-shell layout, status panel, workspace activity, radar, and search. When `ccgui.perf.backgroundRenderGating=off|false|0`, those consumers fall back to baseline latest-object rendering.
- Search no longer receives `threadItemsByThread` while the palette is closed, so hidden search indexing cannot parse every background streaming delta.
- `Messages` remains mounted only for the active thread; inactive conversation markdown/terminal/tool/diff output therefore must not be optimized by disconnecting runtime streams. Heavy global surfaces now consume deferred thread item/status snapshots instead.
- The buffer contract remains available for future surface-local queues where a mounted inactive surface is introduced. Boundary events (`completion`, `approval`, `error`, tool/image/history boundaries) are classified for immediate delivery while plain deltas are eligible for background buffering.
- Staged hydration is represented by a shell-first cursor, interaction preemption, and viewport-priority ordering. This keeps the active shell and send-critical controls ahead of offscreen heavy output.

## Verification Notes

- Focused Vitest passed for selector isolation, background buffer ordering, boundary routing, buffer limits, diagnostics, rollback flags, and search gating.
- Typecheck is part of the final gate for this change and should be rerun after every follow-up edit.
- The manual performance scenario is split into two checkpoints:
  - `7.4a` is complete: the reproducible matrix below defines the evidence required for manual profiling.
  - `7.4b` remains open until an interactive app with two real runtime sessions is profiled. This environment cannot truthfully generate that runtime profile, so no fabricated FPS, React Profiler, or Performance trace numbers are included.
- Archive gate: `7.4b` is closed for archive by the 2026-05-14 owner-approved release qualifier in `openspec/docs/phase1-release-closure-2026-05-14.md`. This is not a substitute for a real UI trace before claiming measured interactive switch-lag improvement.

## Manual Performance Matrix

| Scenario | Setup | Actions | Required Evidence | Pass Criteria |
| --- | --- | --- | --- | --- |
| Two running sessions switch | Start two real runtime sessions that are both streaming output. | Switch A -> B -> A at least 10 times while both continue running. | Performance trace with switch start, shell visible, output restored, and long-task markers. | Background session keeps running; active shell appears before heavy output hydration; no repeated per-delta heavy render from inactive session. |
| Search closed during background stream | Keep one session active and another streaming in background; keep search palette closed. | Let background output stream for at least 30 seconds. | React Profiler or component render evidence for search/radar path. | Hidden search does not consume full `threadItemsByThread` per delta. |
| Semantic boundary delivery | Background session emits completion, approval, error, or tool/image/history boundary. | Switch away before the boundary, then observe global affordance and switch back. | UI screenshot or trace showing boundary visibility and restored output. | Boundary event is visible and not swallowed; plain deltas may be deferred. |
| Interaction preemption | Switch to a busy session while hydration is in progress. | Type, send, stop, approve, or switch again during restore. | Performance trace and UI observation. | Hydration yields or cancels; input-critical controls remain responsive. |
| Rollback comparison | Set `ccgui.perf.backgroundRenderGating=off`, then repeat the two-session switch test. | Compare baseline and optimized traces. | Before/after trace pair. | Rollback returns baseline-compatible rendering without disconnecting background runtime. |
