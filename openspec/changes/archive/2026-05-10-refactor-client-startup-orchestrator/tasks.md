## 1. Orchestrator Core

- [x] 1.1 [P0, depends: none] Define `StartupPhase`, task descriptor, task state, fallback reason, and trace event types; output is a typed frontend module with no React dependency; verify with TypeScript compile.
- [x] 1.2 [P0, depends: 1.1] Implement a read-only startup trace spike that observes existing startup milestones and IPC labels without changing loading behavior; output is baseline trace evidence for current startup.
- [x] 1.3 [P0, depends: 1.1] Implement task scheduling by phase and priority, including `critical`, `first-paint`, `active-workspace`, `idle-prewarm`, and `on-demand`; output is a scheduler that can run deterministic unit tests.
- [x] 1.4 [P0, depends: 1.3] Implement `dedupeKey` sharing for in-flight tasks; output is one execution per duplicate key; verify with unit tests that concurrent callers receive the same result.
- [x] 1.5 [P0, depends: 1.3] Implement `concurrencyKey`, per-phase caps, per-heavy-command caps, and idle slice budget; output is bounded parallelism; verify queued tasks do not exceed caps.
- [x] 1.6 [P0, depends: 1.3] Implement timeout and fallback settlement; output is a task lifecycle that records timeout and returns degraded data; verify with fake timers.
- [x] 1.7 [P0, depends: 1.3] Implement workspace-scoped cancellation modes: soft-ignore, yield-only, cooperative-abort, and hard-abort; output is ignored stale hydration for unsupported hard cancel paths; verify by switching workspace during a running task.

## 2. Startup Trace And Diagnostics

- [x] 2.1 [P0, depends: 1.1] Add bounded startup trace store with queued, started, completed, failed, timed out, cancelled, and degraded events; output is an inspectable in-memory ring buffer; verify event ordering in unit tests.
- [x] 2.2 [P0, depends: 2.1] Record `shell-ready`, `input-ready`, and `active-workspace-ready` milestones; output is milestone timing linked to preceding task events.
- [x] 2.3 [P1, depends: 2.1] Add trace labels around heavy frontend task wrappers for thread/session, file, git, engine/model, command catalog, and dictation paths; output is attributable task duration evidence.
- [x] 2.4 [P1, depends: 2.1] Add backend command duration labels or diagnostics for startup-invoked heavy commands without changing command return contracts; output is command class attribution in logs or diagnostics.
- [x] 2.5 [P2, depends: 2.1] Add a developer diagnostics surface or exported debug accessor for startup trace; output is a way to answer which startup task blocked or degraded.

## 3. Bootstrap And AppShell Boundary

- [x] 3.1 [P0, depends: 1.3, 2.1] Wire bootstrap and AppShell startup entry points into the orchestrator while preserving current first render behavior; output is traced critical and first-paint phases.
- [x] 3.2 [P0, depends: 3.1] Keep critical path limited to client stores, app settings, workspace list, shell render readiness, and active workspace minimal state; verify heavy tasks do not run before first paint.
- [x] 3.3 [P1, depends: 3.1] Add cached/sidebar skeleton degraded state for delayed startup tasks; output is an interactive shell while idle/on-demand hydration continues.
- [x] 3.4 [P0, depends: 3.1] Expose orchestrator state to React through stable store selectors instead of broad component state setters; verify trace-only events do not rerender AppShell.

## 4. Low-Risk Idle And On-Demand Migration

- [x] 4.0 [P0, depends: 1.2] Audit legacy startup side effects for dictation, skills, prompts, commands, collaboration modes, agents, and engine/model catalog; output is an owner map of legacy hook vs orchestrator task.
- [x] 4.1 [P1, depends: 3.1] Move dictation model status from unconditional startup to enabled-setting or on-demand loading; verify disabled dictation does not call status on launch.
- [x] 4.2 [P1, depends: 3.1] Move skills, prompts, commands, collaboration modes, and agent catalogs to `idle-prewarm` or explicit UI demand; verify shell and active workspace hydration are not blocked.
- [x] 4.3 [P1, depends: 4.2] Preserve command catalog fallback/retry semantics under orchestrator dedupe; verify empty workspace retry and global fallback do not duplicate IPC.
- [x] 4.4 [P1, depends: 3.1] Move engine model catalog prewarm out of first paint while preserving current engine/model selection display; verify active workspace still shows usable selection state.

## 5. Thread And Session Hydration Migration

- [x] 5.0 [P0, depends: 1.2] Audit legacy thread/session startup paths and identify all launch-time `list_*sessions`, `list_threads`, and hydration calls; output is a single-owner migration map.
- [x] 5.1 [P0, depends: 3.1] Split active workspace hydration into bounded first-page thread/session loading and deferred full catalog merge; verify first-page data loads before non-active workspace scans. Implemented with `startupHydrationMode: "first-page"` for active startup hydration and `full-catalog` idle follow-up.
- [x] 5.2 [P1, depends: 5.1] Move non-active workspace thread/session hydration to idle-prewarm with dedupe and cancellation; verify launch does not scan every workspace before idle.
- [x] 5.3 [P1, depends: 5.1] Route session radar prewarm through orchestrator without blocking AppShell; verify radar can show cached/degraded state before full feed is ready. Implemented with `thread-list:session-radar:<workspaceId>` idle-prewarm descriptor.
- [x] 5.4 [P1, depends: 5.1] Add regression tests for thread/session restore, stale workspace cancellation, and duplicate hydration requests.

## 6. File And Git Migration

- [x] 6.0 [P0, depends: 1.2] Audit legacy file/git startup paths and identify all launch-time file tree, git status, branch, and diff calls; output is a single-owner migration map.
- [x] 6.1 [P1, depends: 3.1] Gate complete file tree loading by file panel visibility, explicit user action, or idle budget; verify large workspace launch does not force full tree scan.
- [x] 6.2 [P1, depends: 6.1] Add shallow/cached/skeleton file tree state where complete tree hydration is deferred; verify file panel remains interactive.
- [x] 6.3 [P1, depends: 3.1] Gate git diff preload by Git panel visibility, explicit user action, or idle budget; verify launch with hidden Git panel does not request diffs.
- [x] 6.4 [P1, depends: 6.3] Keep active workspace git status as bounded refresh and route polling/focus refresh through dedupe; verify repeated focus events do not duplicate git status calls.

## 7. Focus And Visibility Refresh

- [x] 7.1 [P1, depends: 1.3, 3.1] Replace independent focus/visibility refresh effects with orchestrator refresh tasks; output is one coalesced refresh path.
- [x] 7.2 [P1, depends: 7.1] Add cooldown and latest-intent retention for repeated foreground events; verify rapid focus changes produce one effective refresh per dedupe window.
- [x] 7.3 [P1, depends: 7.1] Ensure active workspace refresh has priority over non-active refresh; verify non-active refresh requires idle budget or visible UI.

## 8. Validation And Rollout

- [x] 8.1 [P0, depends: 1.1-1.7] Run focused orchestrator unit tests for phase ordering, dedupe, concurrency caps, idle budget, timeout, fallback, cancellation modes, and trace lifecycle.
- [x] 8.2 [P1, depends: 4.1-7.3] Run focused frontend regression tests for migrated hooks and AppShell startup behavior.
- [x] 8.3 [P1, depends: 2.4] Run backend tests or focused diagnostics validation for touched command tracing code.
- [x] 8.4 [P0, depends: all implementation tasks] Run `openspec validate refactor-client-startup-orchestrator --strict`, `npm run typecheck`, focused Vitest suites, and relevant Rust tests.
- [x] 8.5 [P2, depends: 8.4] Capture before/after startup trace samples for a small workspace and a large workspace; output is evidence that heavy tasks moved out of first paint. Evidence recorded in `evidence/startup-trace-samples.md`.
- [x] 8.6 [P0, depends: 4.0, 5.0, 6.0] Add a migration guard test or trace assertion that fails when the same startup IPC is owned by both legacy hook and orchestrator task.
- [x] 8.7 [P0, depends: implementation tasks] Verify cross-platform-safe implementation patterns: no hardcoded path separators, no platform-specific shell assumptions, deterministic timers, stable diagnostics output, and Windows/macOS/Linux-compatible tests.
- [x] 8.8 [P0, depends: 8.7] Run large file governance sentry commands: `node --test scripts/check-large-files.test.mjs`, `npm run check:large-files:near-threshold`, and `npm run check:large-files:gate`.
- [x] 8.9 [P0, depends: 8.7] Run heavy test noise sentry commands: `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` and `npm run check:heavy-test-noise`.
- [x] 8.10 [P0, depends: 8.1-8.9] Confirm no new TypeScript, ESLint, Vitest, Node test, Rust compiler, or Rust test warnings were introduced; if baseline warnings exist, document evidence that noise did not increase.

## 9. User-Visible Runtime Notice Feedback

- [x] 9.1 [P1, depends: 2.1] Mirror startup trace task, command, and milestone events into the existing runtime notice dock; output is user-visible background loading feedback without duplicating per-hook notice logic.
- [x] 9.2 [P1, depends: 9.1] Add localized startup loading copy for task start, completion, failure, timeout, degradation, cancellation, command outcomes, and readiness milestones.
- [x] 9.3 [P1, depends: 9.1] Expand the runtime notice dock width to roughly double the desktop surface while preserving viewport-safe sizing on Windows/macOS/Linux and narrow screens.
- [x] 9.4 [P1, depends: 9.1-9.3] Add focused tests for startup trace mirroring and expanded runtime notice rendering.
- [x] 9.5 [P1, depends: 9.1] Group repeated successful startup command notices by command, project/global scope, status, and short time bucket; keep failures, different projects, and different commands separate to avoid blind merging.
