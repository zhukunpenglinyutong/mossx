# Clean cc_gui_daemon warning surface

## Goal

为 `cc_gui_daemon` 建立独立的 Rust warning 治理线，把当前 `137` 条 warning 按 ownership 和 warning family 拆清楚，并形成可分批执行的 cleanup 方案。

## Requirements

- 必须有单独的 OpenSpec change：`clean-cc-gui-daemon-warning-surface`。
- 必须先建立 `cargo check --bin cc_gui_daemon` 的 warning baseline，再开始实现。
- warning cleanup 默认采用 remove / reconnect / boundary split；禁止把 blanket `allow(dead_code)` 当成第一选择。
- 提案必须明确区分：
  - daemon-owned warnings
  - shared-module warning debt
  - intentional compatibility shim
- 验证至少包含：
  - `cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

## Acceptance Criteria

- [ ] OpenSpec proposal / design / specs / tasks 全部补齐。
- [ ] `137` 条 warning 的 family baseline 已记录，并有 ownership 解释。
- [ ] 任务已按 `daemon-owned`、`shared modules`、`verification` 三层拆分。
- [ ] 未触碰 GUI `tauri dev` 启动链和前端行为。

## Technical Notes

- 当前高占比 warning family：
  - `local_usage`: `53`
  - `shared engine + daemon engine bridge`: `41`
  - `runtime`: `25`
- `cc_gui_daemon` 通过 `#[path = ...]` 直接复用多个 shared modules，因此提案重点不是“逐条删 warning”，而是“恢复 target-level reachability 边界”。
- 这条治理线与之前的 `clean-tauri-dev-warning-surface` 分离；后者只负责 GUI `tauri dev` 可见的 startup warning surface。 
