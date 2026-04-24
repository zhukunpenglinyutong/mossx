# Split runtime session lifecycle into dedicated submodule

## Goal
在不改变 runtime command contract、workspace session lifecycle 语义和外部调用面的前提下，将 `src-tauri/src/runtime/mod.rs` 中的 session lifecycle helper 抽到独立子模块，优先把主文件压回当前 `bridge-runtime-critical` policy 的 hard gate 以下。

## Requirements
- 新建 `src-tauri/src/runtime/session_lifecycle.rs` 承载 `close/evict/terminate/replace/rollback` 子域。
- 保持 `crate::runtime::replace_workspace_session`、`stop_workspace_session`、`terminate_workspace_session`、`terminate_workspace_session_process` 的可见面稳定。
- 不修改任何 `#[tauri::command]` 名称、参数、返回值或 frontend mapping。
- 抽分后 `src-tauri/src/runtime/mod.rs` 需要低于当前 `bridge-runtime-critical` policy 的 fail threshold。

## Acceptance Criteria
- [ ] 新增 backend-local lifecycle 子模块承载上述 helper。
- [ ] `src-tauri/src/runtime/mod.rs` 行数降到 `2600` 以下。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `runtime/mod.rs` 不再属于 retained hard debt。
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml runtime::tests runtime::recovery_tests` 通过。

## Technical Notes
- OpenSpec change: `split-runtime-session-lifecycle`
- 本轮只做 façade-style extraction，不改 command registry、不改 engine/runtime/frontend payload contract。
