## Why

当前仓库的主运行面 warning 已经基本清干净，但 `cargo test --manifest-path src-tauri/Cargo.toml --message-format short` 仍然会产出 `8` 条 test-target warnings：`lib test 6`、`bin "cc_gui_daemon" test 2`。这些 warning 不影响运行时功能，但会持续污染 Rust 测试信号，掩盖真正的新回归。

这件事现在适合单独收尾，因为 warning 数量已经很小、边界很集中，不需要再开大范围治理。把这层噪音清掉之后，`cargo test` 才能重新变成可依赖的质量门禁。

## 目标与边界

- 目标：清理 `cargo test` 当前暴露的 `8` 条 test-target warnings。
- 目标：区分 `lib test` 与 `cc_gui_daemon test` 两条测试目标，避免把 runtime warning 治理和 test-only warning 混在一起。
- 目标：优先删除未用 import / 未用 helper / 未接线常量，而不是对 test target 整体加 blanket allow。
- 边界：本轮只处理 Rust test-target warning，不修改 frontend，不触碰 Tauri command contract，不改产品行为。

## 非目标

- 不把所有 Rust target 升级成 `deny(warnings)`。
- 不顺手做 runtime / startup_guard / window 架构重构。
- 不修改 GUI `tauri dev` 启动链。

## What Changes

- 新建一条专门治理 Rust test-target warning surface 的 OpenSpec change。
- 清理 `lib test` 下的未用 import / dead code warning：
  - `client_storage.rs`
  - `shared/thread_titles_core.rs`
  - `startup_guard.rs`
  - `window.rs`
- 清理 `bin "cc_gui_daemon" test` 下的 warning：
  - `shared/thread_titles_core.rs`
  - `workspaces/settings.rs`
- 建立残留 warning policy：若某条 warning 只能通过 intentional compatibility shim 保留，必须在 change 中解释原因。

## Capabilities

### New Capabilities

- `rust-test-target-warning-cleanliness`: 约束 Rust test-target warning 的 baseline、清理方式与 residual policy。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src-tauri/src/client_storage.rs`
  - `src-tauri/src/shared/thread_titles_core.rs`
  - `src-tauri/src/startup_guard.rs`
  - `src-tauri/src/window.rs`
  - `src-tauri/src/workspaces/settings.rs`
- Affected workflow:
  - `cargo test --manifest-path src-tauri/Cargo.toml --message-format short`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

## Acceptance Criteria

- `cargo test --manifest-path src-tauri/Cargo.toml --message-format short` 不再报告 `lib test` 与 `bin "cc_gui_daemon" test` warning summary。
- 本轮修改不引入 Rust 测试失败，也不改动运行时行为。
- 若有 residual test-target warning，必须在 design/tasks 中说明 ownership 与保留理由。

## Inventory Snapshot

### Current test-target warning baseline

- `lib test`: `6`
- `bin "cc_gui_daemon" test`: `2`

### Current warning files

- `src-tauri/src/client_storage.rs`
- `src-tauri/src/shared/thread_titles_core.rs`
- `src-tauri/src/startup_guard.rs`
- `src-tauri/src/window.rs`
- `src-tauri/src/workspaces/settings.rs`
