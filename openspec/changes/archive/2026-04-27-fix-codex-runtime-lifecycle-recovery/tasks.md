## 1. Backend Lifecycle Attribution

- [x] 1.1 Add source-specific Codex shutdown attribution to `WorkspaceSession`. [P0][输入: `src-tauri/src/backend/app_server.rs`, `src-tauri/src/backend/app_server_runtime_lifecycle.rs`][输出: runtime stop path can report user/manual, internal replacement, stale cleanup, idle eviction, settings restart, or app exit source][验证: Rust unit tests for default source and source-specific stale reuse reason]
- [x] 1.2 Update Codex stop/replacement/stale-cleanup call sites to pass explicit shutdown source. [P0][依赖: 1.1][输入: `src-tauri/src/runtime/session_lifecycle.rs`, `src-tauri/src/codex/session_runtime.rs`][输出: replacement and stale cleanup no longer collapse into generic manual shutdown][验证: focused Rust tests for replacement cleanup and stale cleanup attribution]
- [x] 1.3 Gate `runtime/ended` event emission by affected work while preserving pending request settlement. [P0][依赖: 1.1][输入: `handle_runtime_end`, runtime end context collection][输出: internal cleanup with no affected work does not append thread-facing reconnect diagnostics; active work still receives runtime-ended recovery][验证: Rust tests for no-work suppression and active-work emission]

## 2. Runtime Manager And EOF Diagnostics

- [x] 2.1 Preserve pin intent independently from transient runtime rows. [P1][输入: `src-tauri/src/runtime/mod.rs` RuntimeManager pin/remove/upsert paths][输出: pin survives row removal/recreation and unpin clears future hydration][验证: runtime manager tests for pin, remove, recreate, unpin]
- [x] 2.2 Correlate stdout EOF with process exit metadata inside a bounded wait. [P1][输入: `src-tauri/src/backend/app_server_runtime_lifecycle.rs` and reader task lifecycle][输出: EOF diagnostics include exit code/signal when available without blocking indefinitely][验证: helper/unit tests for EOF fallback and process-status classification]
- [x] 2.3 Preserve backward-compatible runtime ledger and snapshot fields. [P1][依赖: 2.1, 2.2][输入: existing `RuntimePoolRow` serialization and snapshot mapping][输出: existing ledger JSON remains readable and public Tauri response shape stays compatible][验证: existing runtime tests plus type/contract checks]

## 3. Frontend Compatibility And Verification

- [x] 3.1 Keep frontend reconnect-card classification unchanged unless backend diagnostics require a focused compatibility adjustment. [P2][输入: `src/features/threads/utils/stabilityDiagnostics.ts`, `RuntimeReconnectCard` behavior][输出: true runtime-ended, broken pipe, workspace-not-connected, thread-not-found, and quarantine diagnostics still recover][验证: existing or updated Vitest coverage for stability diagnostics]
- [x] 3.2 Run focused backend/frontend verification. [P0][依赖: 1.3, 2.1, 2.2, 3.1][输入: changed Rust/TS files][输出: regression evidence for lifecycle recovery][验证: `cargo test --manifest-path src-tauri/Cargo.toml runtime`, `cargo test --manifest-path src-tauri/Cargo.toml backend::app_server`, focused `vitest run` if frontend changes]
- [x] 3.3 Validate OpenSpec artifacts and mark completed tasks. [P0][依赖: all implementation tasks][输入: proposal/design/specs/tasks and implementation][输出: change ready for verify/archive flow][验证: `openspec validate fix-codex-runtime-lifecycle-recovery --strict`]
