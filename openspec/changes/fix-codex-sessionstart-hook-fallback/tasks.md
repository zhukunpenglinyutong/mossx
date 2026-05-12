# Tasks

## 1. Investigation

- [x] 1.1 [P0][depends:none][I: Codex 0.125/0.130 app-server schema and failing user evidence][O: confirmed fallback trigger taxonomy][V: code review] Confirm exact `thread/start` response shapes and hook failure signals that should trigger fallback.
- [x] 1.2 [P0][depends:none][I: Codex hook config behavior][O: selected hook-disable mechanism][V: local app-server probe] Confirm whether official Codex supports a disable-hooks option; if unavailable, use internal `CODEX_NON_INTERACTIVE=1` hook-safe mode.

## 2. Backend Fallback Contract

- [x] 2.1 [P0][depends:1.1][I: `src-tauri/src/shared/codex_core.rs`][O: backend thread id response parser][V: Rust unit tests] Move `thread/start` response validation into backend and classify missing id as `invalid_thread_start_response`.
- [x] 2.2 [P0][depends:1.2][I: `src-tauri/src/backend/app_server.rs`, `src-tauri/src/backend/app_server_cli.rs`][O: internal app-server launch mode normal/session-hooks-disabled][V: Rust unit tests] Add explicit hook-safe launch mode without changing primary launch behavior.
- [x] 2.3 [P0][depends:2.1,2.2][I: `src-tauri/src/codex/session_runtime.rs`][O: bounded hook-safe fallback path][V: Rust tests simulate primary invalid response then fallback success] Retry create-session once with hook-safe runtime when primary thread creation is hook-induced or invalid.
- [x] 2.4 [P0][depends:2.3][I: runtime manager replacement guard][O: fallback uses existing acquire/replacement coordination][V: Rust concurrency test or lifecycle test] Ensure fallback does not create unbounded restart loops or race with concurrent create-session calls.

## 3. Diagnostics And User Notice

- [x] 3.1 [P0][depends:2.3][I: runtime diagnostics / global runtime notices][O: fallback diagnostics event or runtime row evidence][V: focused tests or snapshot] Record primary failure category, fallback mode, and fallback outcome without storing full hook context.
- [x] 3.2 [P0][depends:2.3][I: frontend create-session flow][O: visible hook-skipped warning][V: Vitest] Show user-visible warning when fallback succeeds.
- [x] 3.3 [P1][depends:2.3][I: `thread/start` params schema][O: new session receives short hook-skipped context notice if supported][V: local app-server probe or Rust test] Inject a safe notice into fallback-created session so the agent knows project hook context is incomplete.

## 4. Verification

- [x] 4.1 [P0][depends:2,3][I: backend tests][O: targeted Rust tests green][V: `cargo test --manifest-path src-tauri/Cargo.toml codex` or narrower module test] Run focused backend tests.
- [x] 4.2 [P0][depends:3.2][I: frontend tests][O: targeted Vitest green][V: `npm exec vitest run <focused tests>`] Run focused frontend notice/create-session tests.
- [x] 4.3 [P0][depends:4.1,4.2][I: failing user reproduction steps][O: manual validation matrix][V: document result in change verification notes] Validate with normal hook, broken hook, slow hook, and no-hook projects.

## 5. Spec Sync

- [x] 5.1 [P0][depends:4][I: changed behavior][O: synced main specs or archive-ready deltas][V: `openspec validate --all --strict --no-interactive`] Validate OpenSpec and prepare archive/sync after implementation.
