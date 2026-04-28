## 1. Evidence And Test Seams

- [x] 1.1 [P0][depends: none][verify: cargo test targeted] Add a Rust test seam around the Claude event forwarder so fake slow turn-start sync and per-delta runtime sync can be injected; output is a failing regression test proving stream emit currently waits for slow sync.
- [x] 1.2 [P0][depends: 1.1][verify: cargo test targeted] Add a regression test asserting slow `TurnStarted` bookkeeping does not delay forwarding the first subsequent realtime delta.
- [x] 1.3 [P0][depends: 1.1][verify: cargo test targeted] Add a regression test asserting `TextDelta`, `ReasoningDelta`, and `ToolOutputDelta` app events are emitted before slow runtime diagnostics complete.
- [x] 1.4 [P0][depends: none][verify: test fixture assertion] Capture the expected video symptom as a backend timeline fixture: long pre-emit gap, burst flush count, and terminal final text parity.

## 2. Claude Stream Hot Path

- [x] 2.1 [P0][depends: 1.1][verify: Rust unit test] Add a lightweight Claude stream activity touch that renews in-memory active-work protection without process diagnostics or per-delta ledger persistence.
- [x] 2.2 [P0][depends: 2.1][verify: Rust unit test] Reorder `src-tauri/src/engine/commands.rs` Claude forwarder so realtime deltas are emitted before runtime sync / diagnostics refresh.
- [x] 2.3 [P0][depends: 2.2][verify: Rust unit test] Move `sync_claude_runtime()` calls to bounded checkpoints: turn start background refresh, heartbeat, and terminal reconciliation.
- [x] 2.4 [P0][depends: 2.3][verify: Rust unit test] Guard delayed background sync so stale results cannot clear newer turn / stream active-work protection.
- [x] 2.5 [P0][depends: 2.1][verify: runtime ledger test] Keep ledger persistence at bounded checkpoints and prove repeated deltas in one turn do not trigger one ledger write per delta.

## 3. Windows Process Diagnostics

- [x] 3.1 [P0][depends: 2.3][verify: Rust unit test] Add TTL cache for Windows process rows or equivalent diagnostics snapshot so repeated refreshes reuse bounded work.
- [x] 3.2 [P0][depends: 3.1][verify: Rust unit test] Add singleflight behavior so concurrent diagnostics refreshes join one in-flight Windows snapshot instead of spawning repeated PowerShell/CIM queries.
- [x] 3.3 [P0][depends: 3.1][verify: Rust unit test] Add timeout / stale fallback for Windows diagnostics and record a traceable degraded reason when snapshot work exceeds budget.
- [x] 3.4 [P1][depends: 3.1][verify: runtime pool console smoke] Surface diagnostics freshness or stale reason through runtime diagnostics logs/state without forcing synchronous refresh from stream hot path.

## 4. Stream Latency Diagnostics And Frontend Parity

- [x] 4.1 [P0][depends: 2.2][verify: Rust/backend diagnostics test] Record backend forwarding timing evidence: engine event ingress, app event emit, runtime sync queued/completed/timed out, max forwarding gap, and burst delta count.
- [x] 4.2 [P0][depends: 4.1][verify: Vitest targeted] Extend `conversation-stream-latency-diagnostics` consumption only for backend evidence surfaced through existing diagnostics channels; keep log-only backend evidence out of frontend primary classification.
- [x] 4.3 [P0][depends: 2.2][verify: Vitest targeted] Confirm frontend final completion reconciles with streamed text and does not replace already-visible streamed content as the first meaningful output.
- [x] 4.4 [P1][depends: 4.1][verify: manual diagnostics review] Expose operator-facing `.cmd` wrapper / hidden console evidence when already available from launch or runtime metadata: resolved binary, wrapper kind, and launch path classification; do not add synchronous stream-path probing just to fill this metadata. 2026-04-27 code evidence: `resolve_codex_launch_context()` records `resolved_bin` and `wrapper_kind`, `RuntimePoolRow` exposes `resolvedBin` / `wrapperKind`, and `RuntimePoolSection` renders both without adding stream-path probing.

## 5. Validation Matrix

- [x] 5.1 [P0][depends: 1-4][verify: cargo test] Run targeted Rust tests for Claude forwarder, runtime manager fast touch, ledger persistence cadence, and Windows diagnostics cache/singleflight/timeout.
- [x] 5.2 [P0][depends: 4.2][verify: npm run test -- targeted files] Run targeted Vitest suites for stream latency diagnostics and Claude message final parity.
- [x] 5.3 [P0][depends: 5.1,5.2][verify: manual Windows matrix] Manually test Windows native Claude Code: first turn, second turn, first visible delta latency, delta cadence before terminal, final text parity. 2026-04-27 human Windows native Claude Code conversation smoke passed: ordinary dialogue now streams normally and no longer reproduces final-only / burst-flush output. Tool-heavy prompt latency numbers were not separately captured in this note.
- [x] 5.4 [P1][depends: 5.3][verify: manual non-regression] Smoke test macOS Claude and one non-Claude engine to confirm baseline streaming behavior is unchanged.
- [x] 5.5 [P0][depends: 5.1,5.2][verify: standard quality gates] Run `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run test`, and any affected runtime contract checks before verify/archive.
