# Implementation Notes

Updated: 2026-05-12

## Ownership Gate

本 change 只修改 Runtime layer 的 lifecycle truth 与 diagnostics projection。

- Runtime owns: `runtimeState` / `runtimeGeneration` / `reasonCode` / `recoverySource` / `retryable` / `userAction`.
- Conversation consumes Runtime outcome later, but must not define runtime retry or recovery policy here.
- Composer consumes Runtime projection later, but must not infer lifecycle from raw errors.

Refers to:

- `openspec/docs/client-stability-conversation-implementation-readiness-2026-05-11.md`

## Lifecycle State Table

Runtime snapshot now has an additive `lifecycleState` projection while keeping the existing `state` field stable.

| `lifecycleState` | Derived From | User-Facing Action |
|---|---|---|
| `idle` | no current active row facts | none |
| `acquiring` | `starting=true` | `wait` |
| `active` | active session / pid / protected work | none |
| `replacing` | `hasStoppingPredecessor=true` | `wait` |
| `stopping` | `stopping=true` | `wait` |
| `recovering` | `startupState=cooldown` | `wait` |
| `quarantined` | `startupState=quarantined` | `reconnect` |
| `ended` | exit/error facts recorded | `retry` |

## Diagnostics Field Table

Runtime snapshot now exposes structured fields for frontend consumers:

| Field | Source | Notes |
|---|---|---|
| `reasonCode` | exit reason / probe failure / guard state | First cut covers `manual-shutdown`, `stale-thread-binding`, `probe-failed`, `unknown-runtime-loss`, `stopping-runtime-race`. |
| `recoverySource` | `lastRecoverySource` | Mirrors owner-layer source such as `ensure-runtime-ready` or `automatic-send-retry`. |
| `retryable` | lifecycle projection | True for `recovering`, `quarantined`, and `ended`. |
| `userAction` | lifecycle projection | First cut maps to `wait`, `reconnect`, or `retry`. |
| `runtimeGeneration` | pid + startedAt | Existing generation identity remains the late-event guard surface. |

## Runtime Helper Call Matrix

External Tauri command contracts stay unchanged. Current implementation surfaces these internal entry points:

| Operation | Current Entry | Runtime Truth Updated |
|---|---|---|
| acquire/create | `begin_runtime_acquire_or_retry`, `record_starting`, `record_ready` | `acquiring -> active`, recovery source, guard state |
| replace | `replace_workspace_session_with_source`, `begin_runtime_replacement`, `note_replacement_started` | `replacing`, replacement reason, stopping predecessor |
| stop | `stop_workspace_session_with_source`, `terminate_workspace_session_with_source` | shutdown source, active-work protection, stopping/removed |
| terminate | `terminate_workspace_session_with_source` | process termination and force-kill diagnostics |
| recover | `record_recovery_failure_with_backoff`, `record_recovery_success`, `reset_recovery_cycle` | `recovering / quarantined / active` |
| stale cleanup | `note_stale_session_rejection`, `note_probe_failure` | stale/probe reason and recovery source |
| late event guard | `record_runtime_ended_for_session` | guarded by pid + startedAt generation identity |

## Implementation Progress

Completed in this pass:

- Added additive `RuntimeLifecycleState` and structured diagnostic projection to `RuntimePoolRow`.
- Kept existing `RuntimeState` and Tauri command payload compatibility.
- Synchronized backend diagnostics bundle sanitizer and frontend `RuntimePoolRow` types.
- Added/updated Rust recovery tests for stale rejection, replacement projection, and quarantine reconnect action.

Downstream integration evidence added after Composer rollout:

- `RuntimeLifecycleState` is now consumed by `ComposerSendReadiness` as structured input for disabled reason / activity projection.
- Composer displays runtime lifecycle only as send-readiness explanation; it does not start recovery, retry sessions, or infer lifecycle from raw error text.
- Header/footer UI calibration did not modify runtime acquisition, replacement, stop, terminate, or recovery mechanics.
- TypeScript bridge types remain additive and compatible with existing Tauri payload mapping.

Refers to:

- `src/features/composer/utils/composerSendReadiness.ts`
- `src/features/composer/components/Composer.tsx`
- `src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.tsx`
- `src/types.ts`
- `src/services/tauri/workspaceRuntime.ts`

Latest downstream verification:

- `pnpm vitest run src/features/composer/components/ChatInputBox/ComposerReadinessBar.test.tsx src/features/composer/components/ChatInputBox/ChatInputBoxAdapter.test.tsx src/features/composer/components/Composer.status-panel-toggle.test.tsx`
- `npm run typecheck`
- `git diff --check`

## Review Backfill - 2026-05-12

Code review focused on boundary conditions, large-file governance, heavy-test-noise sentry compatibility, and Windows/macOS execution differences.

Findings from the first review backfill:

- `tasks.md` previously marked full lifecycle coordinator, Codex create/shutdown race, stale thread recovery, and dedicated recovery UI as complete before every implementation pass had landed.
- At that point, code only implemented the initial foundation checkpoint: additive lifecycle projection, generation guard, diagnostics fields, reconnect evidence, and Composer consumption.
- Later backend coordinator, frontend classification, and manual recovery action passes closed the open gaps. Current tasks are intentionally `24/24` complete.

Validation notes:

- `openspec validate stabilize-runtime-session-lifecycle --type change --strict` is the valid single-change command in the current CLI.
- `openspec validate --change ... --strict` is not valid in this workspace; the CLI reports `unknown option '--change'`.
- Cargo accepts one test filter per command. The review used separate commands for `runtime::tests` and `runtime::recovery_tests`.

Latest review verification:

- `openspec validate stabilize-runtime-session-lifecycle --type change --strict`
- `npm run typecheck`
- `node --test scripts/check-large-files.test.mjs`
- `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs`
- `npm run check:large-files:gate`
- `npm run check:large-files:near-threshold` (warnings only; no hard gate failure)
- `pnpm vitest run src/features/composer/utils/composerSendReadiness.test.ts src/features/composer/components/ChatInputBox/MessageQueue.test.tsx src/features/threads/contracts/conversationFactContract.test.ts src/features/threads/assembly/conversationNormalization.test.ts src/features/threads/loaders/historyLoaders.test.ts`
- `cargo test --manifest-path src-tauri/Cargo.toml runtime::tests`
- `cargo test --manifest-path src-tauri/Cargo.toml runtime::recovery_tests`

Large-file governance:

- `.github/workflows/large-file-governance.yml` runs parser tests, near-threshold watch, and hard-debt gate on Ubuntu, macOS, and Windows.
- Hard gate passed.
- Near-threshold watch still flags `src-tauri/src/runtime/mod.rs` as P0 watch, but not hard debt. The correct next split point is the future coordinator extraction, not an artificial split in this foundation pass.

## Implementation Update - 2026-05-12 Backend Coordinator Pass

Fixed findings:

- `RuntimeManager` exposed lifecycle primitives but did not provide a coordinator boundary; acquire/recover/stop/ready calls were still wired directly at high-risk call sites.
- Codex `thread/start` handled stopping-runtime races with a bounded retry, but the retry did not consult recovery quarantine before reacquiring and retrying.
- Hook-safe fallback reused the retry helper, so it needed the same stopping-race recovery probe to avoid a fallback-only bypass.

Implementation:

- Added `RuntimeLifecycleCoordinator` as a lightweight internal facade over existing `RuntimeManager` truth operations: `acquire_or_retry`, `record_acquiring`, `record_active`, `record_stopping`, `record_recovering_failure`, `record_recovered`, `record_quarantine_probe`, and `finish_acquire`.
- Routed Codex ensure-session acquire/recovery bookkeeping through the coordinator without changing external Tauri command payloads.
- Routed `session_lifecycle` stop/ready writes through the coordinator while keeping process termination and shutdown attribution logic unchanged.
- Added `run_start_thread_with_retry_and_recovery_probe` and connected real `start_thread_with_runtime_retry` to coordinator quarantine checks before bounded retry.
- Applied the same recovery probe to hook-safe fallback so primary and fallback create-session paths share the same race handling.

Boundary conditions covered:

- Recovery quarantine now blocks automatic reacquire before a second `thread/start` is attempted.
- Persistent stopping-runtime race still returns the stable `[SESSION_CREATE_RUNTIME_RECOVERING]` error after one retry.
- Non-runtime errors still do not retry.
- Fallback create-session stopping race honors the same quarantine probe and does not create a retry storm.
- Implementation uses Rust `Path`/workspace ids already present in runtime code and does not introduce shell commands, OS-specific separators, case-sensitive file assumptions, or newline-dependent parsing.

Additional verification:

- `cargo test --manifest-path src-tauri/Cargo.toml start_thread_retry -- --nocapture`
- `cargo test --manifest-path src-tauri/Cargo.toml hook_safe_fallback_stopping -- --nocapture`
- `cargo test --manifest-path src-tauri/Cargo.toml lifecycle_coordinator_blocks_quarantined_automatic_acquire -- --nocapture`
- `cargo test --manifest-path src-tauri/Cargo.toml runtime::recovery_tests`
- `cargo test --manifest-path src-tauri/Cargo.toml runtime::tests`

Then-open scope, resolved by later frontend passes:

- Frontend stale recovery, WebService reconnect refresh, and dedicated recovery action UI outside Composer.

## Implementation Update - 2026-05-12 Frontend Classification Pass

Fixed findings:

- Frontend stale/runtime recovery semantics were still split between `stabilityDiagnostics`, `threadMessagingHelpers`, `useThreadMessaging`, and runtime notices.
- `thread-not-found` / `session-not-found` / `broken-pipe` / `runtime-ended` / `recovery-quarantined` / stopping runtime race did not share one stable classified outcome.
- Runtime notice copy could surface raw backend text without a structured user action hint.

Implementation:

- Added `classifyStaleThreadRecovery()` with stable `reasonCode`, `staleReason`, `retryable`, `userAction`, and `recommendedOutcome`.
- Reused that classifier from `threadMessagingHelpers` so Codex retry decisions and diagnostics no longer drift across duplicate substring lists.
- Added classification fields to `useThreadMessaging` stale rebind/fresh fallback debug payloads.
- Added action-aware runtime notice params: `reasonCode`, `userAction`, and `actionHint`.
- Kept automatic Codex stale recovery bounded by the existing `codexInvalidThreadRetryAttempted` guard.

Boundary conditions covered:

- `thread-not-found` maps to `stale-thread-binding` / `recover-thread`.
- `session-not-found` maps to `stale-thread-binding` / `recover-thread`.
- `broken-pipe`, `runtime-ended`, `recovery-quarantined`, and stopping runtime race map to reconnect-style recovery.
- Mixed multi-line diagnostics are not treated as recoverable stale binding unless every line matches a recovery signal.
- Non-classified model/account errors continue to produce plain runtime notices without action hints.

Additional verification:

- `pnpm vitest run src/features/threads/utils/stabilityDiagnostics.test.ts src/services/globalRuntimeNotices.test.ts`
- `pnpm vitest run src/features/threads/hooks/useThreadMessaging.test.tsx --testNamePattern "retries codex send once when stale thread reports thread not found|mirrors codex turn-start rpc failures|mirrors classified runtime-ended"`
- `pnpm vitest run src/features/threads/utils/stabilityDiagnostics.test.ts src/services/globalRuntimeNotices.test.ts src/features/threads/hooks/useThreadMessaging.test.tsx`
- `npm run typecheck`

Then-open scope, resolved by the Manual Recovery Action Pass:

- Full recover-only / recover-and-resend outcome UI with explicit `rebound / fresh / failed` user flow.
- Dedicated inline recovery action UI for reconnect-and-retry / recover-thread / start-fresh-thread beyond runtime notice copy.

## Implementation Update - 2026-05-12 Manual Recovery Action Pass

Fixed findings:

- `session-not-found` was classified as stale-thread-binding but the inline recovery card only treated `thread-not-found` as thread recovery, so session-file loss could fall back to generic runtime reconnect UX.
- Manual recover-only depended on callers remembering `allowFreshThread: false`; that default was unsafe for durable local activity because a missing option could silently create a fresh thread.
- Manual recovery result kinds existed, but the source result did not carry stable `retryable` and `userAction` fields required by the OpenSpec outcome contract.

Implementation:

- `RuntimeReconnectCard` now treats both `thread-not-found` and `session-not-found` as stale thread recovery actions.
- `recoverThreadBindingForManualRecovery()` is conservative by default: verified rebind returns `rebound`, missing/failed rebind returns `failed`, and fresh continuation only happens when `allowFreshThread: true`.
- `recover-and-resend` is the explicit fresh continuation entry and passes `allowFreshThread: true`; recover-only omits the flag and cannot silently create a fresh thread.
- `ManualThreadRecoveryResult` now includes `retryable` and `userAction` on all result variants.

Boundary conditions covered:

- Empty workspace/thread ids fail before runtime calls.
- Refresh rejection preserves a user-visible failure reason in recover-only mode.
- Fresh thread creation failure returns a classified failed result with `userAction=start-fresh-thread`.
- `session-not-found` renders the same recover-only / recover-and-resend action surface as `thread-not-found`.
- Rebound resend continues suppressing duplicate optimistic user message rendering, while fresh resend keeps the prompt visible in the new thread.

Additional verification:

- `pnpm vitest run src/app-shell-parts/useAppShellLayoutNodesSection.recovery.test.ts src/features/messages/components/runtimeReconnect.test.ts src/features/messages/components/Messages.runtime-reconnect.test.tsx`
- `npm run typecheck`

## Final Consistency Review - 2026-05-12

Current status:

- `tasks.md` is complete at `24/24`.
- Earlier Phase 1 and then-open-scope notes above are historical checkpoints, not current incomplete scope.
- The proposal was updated to describe the final completed implementation state before archive.

Verification to rerun before archive:

- `openspec validate stabilize-runtime-session-lifecycle --type change --strict`
- `git diff --check`
