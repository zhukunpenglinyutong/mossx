## 1. Backend Active-Work Protection Contract

- [x] 1.1 Promote active turn and active stream tracking into an explicit renewable active-work lease in `src-tauri/src/runtime/mod.rs` and related session runtime paths. Input: turn started/completed/error events plus stream activity. Output: active runtime protection that persists for the full in-flight task, including quiet phases. Validation: Rust tests for lease acquire, renew, and release semantics.
- [x] 1.2 Tighten reconcile, budget, and cooling/release behavior so active-work lease becomes a hard no-evict boundary. Input: `reconcile_pool()` candidate selection, budget enforcement, manual release-to-cold paths. Output: TTL and budget only affect idle runtimes. Validation: Rust tests for lease-protected reconcile and release behavior.
- [x] 1.3 Persist active-work protection diagnostics in runtime snapshots. Input: runtime row state, lease sources, retention flags. Output: runtime metadata that clearly distinguishes active-work protection from warm/pinned retention. Validation: runtime manager tests plus snapshot contract assertions.

## 2. Runtime Exit Fallback Contract

- [x] 2.1 Add a child lifecycle watcher for managed Codex sessions in `src-tauri/src/backend/app_server.rs`. Input: initialized `WorkspaceSession` child/stdout/stderr lifecycle. Output: canonical `runtime/ended` event with normalized reason and exit metadata. Validation: targeted Rust tests for child exit and stdout EOF.
- [x] 2.2 Settle pending requests and background callbacks when runtime ends unexpectedly. Input: pending request map, timed-out request grace state, background thread callbacks. Output: readable runtime-ended failures without leaked pending state. Validation: targeted Rust tests for pending request failure and callback cleanup.
- [x] 2.3 Persist runtime-ended bookkeeping in `RuntimeManager`. Input: active leases, runtime row state, exit diagnostics. Output: released leases, updated diagnostics, no false active runtime after exit. Validation: runtime manager tests for active-lease release and failure diagnostics.

## 3. Frontend Long-Task UX And Recovery

- [x] 3.1 Extend runtime pool snapshot fields and UI contract for active-work protection, lease-vs-retention distinction, and exit diagnostics. Input: runtime snapshot row model and settings panel rendering. Output: diagnosable row metadata for active protection, pinned/warm state, and abnormal exit. Validation: typecheck plus focused frontend rendering tests.
- [x] 3.2 Route `runtime/ended` through `src/features/app/hooks/useAppServerEvents.ts` and ensure affected threads leave processing deterministically. Input: backend runtime-ended payload plus thread event handlers. Output: no infinite loading after runtime exit, with preserved last-good message snapshot. Validation: hook, reducer, and live-behavior tests for runtime-ended teardown.
- [x] 3.3 Update recovery UX in `RuntimeReconnectCard` and related message helpers. Input: runtime-ended reason code and nearest user message context. Output: reconnect/resend actions that reacquire runtime before retry. Validation: component tests for recover, resend, unavailable, and quarantined paths.

## 4. Verification And Apply Readiness

- [x] 4.1 Add targeted Rust coverage for active-work lease renew/release, lease-protected reconcile, child exit, stdout EOF, and pending request settlement. Input: new backend/runtime paths. Output: deterministic regression coverage for both protection and fallback. Validation: `cargo test --manifest-path src-tauri/Cargo.toml`.
- [x] 4.2 Add targeted Vitest coverage for runtime pool diagnostics rendering, `runtime/ended` routing, processing teardown, and reconnect/resend UI. Input: updated frontend hooks/components. Output: regression coverage for the user-visible long-task path. Validation: focused `vitest run` commands for touched suites.
- [x] 4.3 Run quality gates and spec validation before implementation handoff. Input: updated artifacts and code changes. Output: apply-ready change with no OpenSpec schema errors. Validation: `openspec validate harden-codex-runtime-exit-recovery --strict`, `npm run typecheck`, and the targeted test commands above.
