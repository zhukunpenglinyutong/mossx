# Split engine OpenCode command surface into dedicated submodule

## Goal
在不改变 engine command contract、frontend invoke 名称和现有 OpenCode 行为语义的前提下，将 `src-tauri/src/engine/commands.rs` 中的 OpenCode command surface 抽到独立子模块，优先把主文件压回当前 `bridge-runtime-critical` policy 的 warn threshold 以下。

## Requirements
- 新建 `src-tauri/src/engine/commands_opencode.rs` 承载 OpenCode command surface 与局部 helper。
- 保持 `crate::engine::*` 对外暴露的 OpenCode command 名称稳定。
- 不修改 `command_registry.rs` 中的 command 名称、参数或返回值。
- 保持 `workspaces/commands.rs` 对 `clear_mcp_toggle_state` 的清理调用有效。
- 抽分后 `src-tauri/src/engine/commands.rs` 需要低于当前 `bridge-runtime-critical` policy 的 warn threshold。

## Acceptance Criteria
- [ ] 新增 OpenCode command 子模块承载 `commands/agents/session/provider/mcp/lsp` 子域。
- [ ] `src-tauri/src/engine/commands.rs` 行数降到 `2200` 以下。
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml engine::` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `engine/commands.rs` 不再属于 retained hard debt。
- [ ] `openspec status --change split-engine-opencode-command-surface` 显示 tasks ready/done。

## Technical Notes
- OpenSpec change: `split-engine-opencode-command-surface`
- 本轮只做 façade-style extraction，不改 command registry 名称、不改 payload mapping、不改 send/interrupt 主链。
