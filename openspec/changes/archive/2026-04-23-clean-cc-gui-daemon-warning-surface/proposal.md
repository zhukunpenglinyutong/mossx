## Why

`cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short` 当前仍会产出 `137` 条 warning。它们不在 `npm run tauri dev` 的 GUI 启动面里，但会持续污染 Rust 全量检查、掩盖真正的新回归，也说明 daemon 目标对 shared modules 的引用边界已经开始失真。

这件事现在值得单独立项，因为上一轮已经把 GUI `tauri dev` 的 repo-owned warning surface 清干净了；剩下最集中的 Rust warning debt 就在 `cc_gui_daemon`。如果继续放着不管，后面任何 daemon / runtime / engine bridge 相关改动都会在高噪音里盲飞。

## 目标与边界

- 目标：为 `cc_gui_daemon` 建立独立的 warning ownership baseline，明确哪些 warning 属于 daemon 自己，哪些是 shared modules 被动暴露出来的 debt。
- 目标：把当前 `137` 条 warning 分成可执行批次，优先治理 `local_usage`、`engine bridge/shared engine`、`runtime/session_management` 这几组高占比 warning family。
- 目标：约束后续清理方式，优先 remove / reconnect / compile-boundary split，而不是用 blanket `allow(dead_code)` 把问题盖住。
- 边界：本轮只覆盖 `cc_gui_daemon` bin target，不处理 GUI `tauri dev` 默认启动链，不修改用户本机环境，不夹带 frontend feature 变更。

## 非目标

- 不把所有 Rust target 一次性升级成 `deny(warnings)`。
- 不顺手重构 `runtime` / `engine` 的业务行为。
- 不为了消 warning 而改变 daemon RPC contract 或 desktop app command contract。

## What Changes

- 新建一条专门治理 `cc_gui_daemon` warning surface 的 OpenSpec change。
- 建立 `cargo check --bin cc_gui_daemon` 的 warning inventory，并按 ownership 拆成：
  - `daemon-owned`
  - `shared-module warning debt`
  - `intentional compatibility shim`
- 将 warning family 分批治理，而不是一次性大扫除：
  - `daemon entry / engine_bridge / git helper`
  - `local_usage` shared import surface
  - `shared engine` + `runtime / session_management / workspaces_core / git_utils`
- 对 residual warnings 建立明确策略：只有确属兼容性 stub 或 intentional shim 的符号，才允许窄口 `allow(dead_code)`，并且必须有文档说明。

## Capabilities

### New Capabilities

- `cc-gui-daemon-warning-cleanliness`: 约束 `cc_gui_daemon` 的 warning baseline、ownership 拆分、分批治理和 residual-warning policy。

### Modified Capabilities

- None.

## Impact

- Affected code:
  - `src-tauri/src/bin/cc_gui_daemon.rs`
  - `src-tauri/src/bin/cc_gui_daemon/*`
  - `src-tauri/src/local_usage.rs`
  - `src-tauri/src/runtime/*`
  - `src-tauri/src/session_management.rs`
  - `src-tauri/src/shared/workspaces_core.rs`
  - `src-tauri/src/git_utils.rs`
  - `src-tauri/src/engine/*`
- Affected workflow:
  - `cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
- Potential verification additions:
  - daemon-target-specific warning inventory snapshot
  - targeted daemon smoke / bridge contract verification

## Acceptance Criteria

- 已形成 `cc_gui_daemon` warning inventory，并明确记录当前 `137` 条 warning 的 ownership 与 family 分布。
- 提案给出清晰的批次边界，至少覆盖 `local_usage`、`engine bridge/shared engine`、`runtime/session_management` 三大 warning family。
- 后续实现阶段必须优先采用 remove / reconnect / split-by-boundary；任何 `allow(dead_code)` 都需要 residual-policy justification。
- 该治理线不把 GUI `tauri dev` warning 重新混进来，也不引入 daemon RPC / desktop command 的行为回归。

## Inventory Snapshot

### Current warning baseline

- `shared-local_usage`: `53`
- `shared engine / daemon engine bridge`: `41`
- `shared-runtime`: `25`
- `shared-session_management`: `7`
- `shared-workspaces-core`: `4`
- `shared-git_utils`: `3`
- `daemon entry + daemon git helper`: `4`

### Ownership interpretation

- `daemon-owned`: 直接定义在 `src-tauri/src/bin/cc_gui_daemon.rs` 与 `src-tauri/src/bin/cc_gui_daemon/*` 的未用 symbol。
- `shared-module warning debt`: daemon 通过 `#[path = ...]` 复用 shared modules 后暴露出来、但当前 daemon target 实际未触达的 desktop-oriented helpers。
- `intentional compatibility shim`: 为了保持 shared module 在 daemon target 下可编译而保留的最小 stub；这类 warning 只有在无法安全收敛 import surface 时才允许保留。

### After cleanup

- `cargo check --manifest-path src-tauri/Cargo.toml --bin cc_gui_daemon --message-format short`：`0 warnings`
- daemon-owned orphaned helpers 已收掉：
  - `src-tauri/src/bin/cc_gui_daemon/git.rs` 的未用 upstream parser
  - `src-tauri/src/bin/cc_gui_daemon/engine_bridge.rs` 的未用 local helpers / local-only fields
  - daemon codex stub 中未被任何 reachable path 使用的 runtime retry shim
- shared-module warning debt 通过 daemon import boundary 的窄口 suppressions 收敛，没有继续把 blanket allow 扩散到 shared source files
