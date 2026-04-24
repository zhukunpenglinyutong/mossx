## Why

`src-tauri/src/runtime/mod.rs` 当前约 `2655` 行，已经进入 `bridge-runtime-critical` policy 的 retained hard-debt 区间。  
其中 `close/evict/terminate/replace/rollback` 这一整段 workspace session lifecycle helper 已经形成清晰子域，继续堆在 `mod.rs` 中只会放大 review 面积，也让 runtime orchestration 主文件越来越难维护。

## 目标与边界

- 目标：
  - 将 session lifecycle helper 抽到独立子模块。
  - 保持 `runtime/mod.rs` 继续作为 runtime façade 和主入口。
  - 在不改变 command contract 与外部调用面的前提下，让 `runtime/mod.rs` 回到当前 hard gate 以下。
- 边界：
  - 不修改 `#[tauri::command]` 名称、参数或返回值。
  - 不改 frontend `src/services/tauri.ts` mapping。
  - 不调整 workspace session close/evict/replace/rollback 的行为语义。

## Non-Goals

- 不重写 runtime manager。
- 不重构 process diagnostics、reconcile、ledger、event parsing 等其他子域。
- 不引入新的 backend public API。

## What Changes

- 新增 `session_lifecycle.rs` 承载 workspace session lifecycle helper。
- `runtime/mod.rs` 改为导入/重导出 lifecycle 子模块的稳定符号。
- 保持外部调用方仍通过 `crate::runtime::*` 访问既有 helper。
- 通过 typecheck、Rust tests 和 large-file gate 验证抽离没有破坏 contract。

## Capabilities

### New Capabilities
- `runtime-session-lifecycle-extraction-compatibility`: 约束 runtime session lifecycle helper 抽离后仍保持稳定 command contract、调用面与 lifecycle 语义。

### Modified Capabilities
- None.

## Acceptance Criteria

- `src-tauri/src/runtime/mod.rs` 低于当前 `bridge-runtime-critical` policy 的 fail threshold。
- `crate::runtime::replace_workspace_session`、`stop_workspace_session`、`terminate_workspace_session`、`terminate_workspace_session_process` 的 outward contract 不变。
- 现有 runtime tests 继续通过。
- `npm run check:large-files:gate` 通过。

## Impact

- Affected code:
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/runtime/session_lifecycle.rs`
  - `src-tauri/src/runtime/tests.rs`
  - `src-tauri/src/settings/mod.rs`
  - `src-tauri/src/shared/workspaces_core.rs`
  - `src-tauri/src/codex/session_runtime.rs`
  - `src-tauri/src/engine/opencode.rs`
- Verification:
  - `npm run typecheck`
  - `npm run check:large-files:gate`
  - `cargo test --manifest-path src-tauri/Cargo.toml runtime::tests runtime::recovery_tests`
