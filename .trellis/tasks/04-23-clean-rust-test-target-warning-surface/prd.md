# Clean Rust test-target warning surface

## Goal

清理 `cargo test --manifest-path src-tauri/Cargo.toml --message-format short` 当前剩余的 `8` 条 test-target warnings，让 Rust 测试门禁恢复干净信号。

## Requirements

- 必须有独立 OpenSpec change：`clean-rust-test-target-warning-surface`
- 必须先记录 `lib test` 与 `bin "cc_gui_daemon" test` 的 warning baseline
- 清理优先使用删除未用 import / 收窄 dead code compile boundary
- 验证必须包含：
  - `cargo test --manifest-path src-tauri/Cargo.toml --message-format short`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

## Acceptance Criteria

- [x] `lib test 6 + daemon test 2` baseline 已建档
- [x] warning cleanup 不引入 Rust 测试失败
- [x] change artifacts 与实现保持一致

## Technical Notes

- 当前 warning 集中在：
  - `src-tauri/src/client_storage.rs`
  - `src-tauri/src/shared/thread_titles_core.rs`
  - `src-tauri/src/startup_guard.rs`
  - `src-tauri/src/window.rs`
  - `src-tauri/src/workspaces/settings.rs`
- 这是 test-target cleanup，不是 runtime warning cleanup。 
