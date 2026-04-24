## Why

`src-tauri/src/engine/commands.rs` 当前约 `2976` 行，是仓库里最后一个 retained hard debt。  
文件前半段已经形成完整的 OpenCode command surface，包括 commands/agents/session/provider/mcp/lsp 子域；继续让它和 `engine_send_message`、`engine_interrupt` 主链混在一起，只会扩大 review 面和回归面。

## 目标与边界

- 目标：
  - 将 OpenCode command surface 抽到独立子模块。
  - 保持 `engine/commands.rs` 继续作为 engine façade 的一部分。
  - 在不改变 command contract 与外部调用面的前提下，让 `engine/commands.rs` 回到当前 warn threshold 以下。
- 边界：
  - 不修改 `#[tauri::command]` 名称、参数或返回值。
  - 不改 `command_registry.rs`。
  - 不调整 `engine_send_message` / `engine_send_message_sync` / `engine_interrupt` 主链语义。

## 非目标

- 不重构 `engine/mod.rs` shared type 布局。
- 不重写 OpenCode command 的实现逻辑。
- 不引入新的 frontend/backend contract。

## What Changes

- 新增 `src-tauri/src/engine/commands_opencode.rs` 承载 OpenCode command surface 与局部 helper。
- `commands.rs` 改为挂载并 re-export OpenCode 子模块，维持原有 outward surface。
- 保持 `workspaces/commands.rs` 继续可以清理 OpenCode MCP toggle state。
- 通过 Rust tests 和 large-file gate 验证抽离没有破坏 contract。

## Capabilities

### New Capabilities
- `engine-opencode-command-surface-compatibility`: 约束 OpenCode command extraction 后仍保持稳定 command contract、cleanup helper 和行为语义。

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `src-tauri/src/engine/commands.rs`
  - `src-tauri/src/engine/commands_opencode.rs`
  - `src-tauri/src/command_registry.rs`
  - `src-tauri/src/workspaces/commands.rs`
- Verification:
  - `cargo test --manifest-path src-tauri/Cargo.toml engine::`
  - `npm run check:large-files:gate`
  - `npm run check:large-files:baseline`
  - `npm run check:large-files:near-threshold:baseline`

## Acceptance Criteria

- `src-tauri/src/engine/commands.rs` 低于当前 `bridge-runtime-critical` policy 的 warn threshold。
- `crate::engine::*` outward surface 中的 OpenCode commands 保持不变。
- `command_registry.rs` 与 `workspaces/commands.rs` 不需要迁移调用名。
- `npm run check:large-files:gate` 通过。
