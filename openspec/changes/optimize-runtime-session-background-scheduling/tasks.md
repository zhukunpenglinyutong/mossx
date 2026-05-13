## 1. Baseline And Hot Path Discovery

- [x] 1.1 [P0] Map active session switch flow; input: current session routing/store/components; output: list of activeThreadId/activeSessionId propagation paths; verification: documented source locations for session switch state, runtime stream subscription, and conversation output rendering.
- [x] 1.2 [P0] Measure running-session switch lag; input: two concurrent running sessions; output: baseline evidence for React commit cost, long tasks, stream ingress cadence, and render-heavy components; verification: performance notes include timestamps for switch start, shell visible, output restored, and main-thread long tasks.
- [x] 1.3 [P0] Identify inactive-session render amplification; input: profiler/store subscription logs; output: list of components/selectors/effects that rerender for inactive running sessions; verification: each identified path has owner component and triggering state update.

## 2. Visibility Priority Model

- [x] 2.1 [P0] Add session visibility priority derivation; input: active session identity and running session catalog; output: foreground/background/restoring priority for each runtime session; verification: unit tests cover active, inactive running, inactive completed, and rapid switch cases.
- [x] 2.2 [P0] Ensure visibility changes do not mutate runtime lifecycle; input: runtime lifecycle actions and visibility transitions; output: guard preventing disconnect/terminate/reacquire/pause on backgrounding alone; verification: tests assert background switch emits no lifecycle destructive action.
- [x] 2.3 [P1] Expose lightweight background projection; input: running session state and buffered output counters; output: metadata projection for status, last activity, buffered count, approval presence, and error summary; verification: inactive running session UI metadata updates without rendering heavy output.

## 3. Lossless Background Output Buffer

- [x] 3.1 [P0] Define buffer event keys and ordering contract; input: realtime event types for conversation output, terminal/tool output, completion, approval, error, and reconciliation; output: typed buffer contract preserving thread/turn/item/revision order; verification: type tests or reducer tests reject unordered or duplicate consumption.
- [x] 3.2 [P0] Route inactive high-frequency output through background buffer; input: visibility priority and realtime event ingestion; output: inactive running session output is buffered or throttled instead of rendered per delta; verification: tests show accepted events are consumed exactly once and metadata counters update.
- [x] 3.3 [P0] Preserve semantic boundary events; input: completion, approval, error, tool boundary, generated image boundary, and history reconciliation events; output: boundary events bypass unsafe coalescing; verification: focused tests cover boundary delivery while adjacent text deltas are buffered/coalesced safely.
- [x] 3.4 [P1] Add buffer safety limits and diagnostics; input: buffer depth/age/bytes; output: bounded metrics and safe degradation policy; verification: tests or diagnostics fixture show depth, age, and flush latency are emitted.

## 4. Staged Foreground Restore

- [x] 4.1 [P0] Implement staged hydration scheduler; input: buffered output and foreground switch event; output: shell-first restore followed by bounded output chunks; verification: tests assert shell/critical controls render before full output hydration completes.
- [x] 4.2 [P0] Add interaction preemption; input: typing, send, stop, approval, or second session switch during hydration; output: hydration yields, cancels, or resumes without stale flush; verification: tests simulate rapid switch and user action during restore.
- [x] 4.3 [P1] Prioritize viewport-near output before offscreen heavy content; input: visible output viewport and buffered chunks; output: restore policy for viewport-first content; verification: manual or component test confirms visible area is restored before distant history/tool blocks.

## 5. Heavy Surface Integration

- [x] 5.1 [P0] Integrate conversation output/markdown streaming with background render budget; input: conversation renderer and markdown streaming path; output: inactive sessions do not parse/render every delta; verification: profiler/test shows inactive markdown delta does not trigger high-cost visible render per event.
- [x] 5.2 [P1] Integrate terminal/tool output surfaces with background render budget; input: terminal and tool output components; output: inactive running output is buffered or summarized; verification: tests/manual profile show terminal/tool output does not rerender per delta while backgrounded.
- [x] 5.3 [P1] Integrate diff/file-heavy surfaces with restore budget; input: diff/file render components used by runtime output; output: heavy surfaces hydrate after shell and critical controls; verification: switch profile shows no synchronous full diff/file render during shell restore.

## 6. Diagnostics And Rollback

- [x] 6.1 [P0] Add visibility-aware realtime performance diagnostics; input: workspace/thread/engine/turn and visibility state; output: ingress cadence, buffer depth, flush duration, render cost, and long task evidence; verification: diagnostic sample includes all required dimensions.
- [x] 6.2 [P0] Add rollback flags for render gating, buffered flush, and staged hydration; input: runtime config/feature flags; output: independent rollback controls; verification: tests assert disabling each layer preserves session continuity and baseline-compatible rendering.
- [x] 6.3 [P1] Add user-facing background activity affordance if needed; input: buffered count and last activity projection; output: subtle UI indicator for background running sessions; verification: manual check confirms users can see background activity without heavy render.

## 7. Verification

- [x] 7.1 [P0] Add focused unit/component tests for lossless background buffering; input: synthetic realtime event streams; output: tests for no loss, no duplication, ordering, boundary preservation, and foreground convergence; verification: focused Vitest suite passes.
- [x] 7.2 [P0] Add lifecycle regression tests; input: visibility transitions during active runtime; output: tests proving no disconnect/terminate/reacquire/pause is triggered by backgrounding; verification: focused lifecycle tests pass.
- [x] 7.3 [P0] Run typecheck and relevant frontend tests; input: completed implementation; output: `npm run typecheck` and focused Vitest results; verification: commands pass or failures are documented with owner.
- [x] 7.4a [P1] Prepare manual performance scenario matrix; input: two or more concurrent running sessions; output: reproducible switch-lag profiling checklist; verification: checklist captures switch start, shell visible, output restored, long tasks, background continuity, and rollback comparison.
- [ ] 7.4b [P1] Run live manual performance scenario; input: interactive app with two or more real concurrent running sessions; output: before/after switch-lag profile; verification: evidence shows inactive sessions avoid per-delta heavy render and switch shell appears before heavy output hydration.
- [x] 7.5 [P1] Validate OpenSpec artifacts; input: completed change artifacts; output: strict OpenSpec validation; verification: `openspec validate --all --strict --no-interactive` passes or known unrelated failures are documented.
