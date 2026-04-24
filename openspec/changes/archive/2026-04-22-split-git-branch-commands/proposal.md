## Why

`src-tauri/src/git/commands.rs` 当前约 `2619` 行，已经进入 `bridge-runtime-critical` policy 的 retained hard-debt 区间。  
文件后半段从 `list_git_branches` 开始到 branch compare/worktree diff 结束，本身已经形成一整块 git branch lifecycle 子域；继续把它和其他 git command 混在一起，只会扩大 review 面和维护成本。

## 目标与边界

- 目标：
  - 将 branch lifecycle 与 branch compare 子域抽到独立子模块。
  - 保持 `git/commands.rs` 继续作为 git command façade 的一部分。
  - 在不改变 command contract 与外部调用面的前提下，让 `git/commands.rs` 回到当前 hard gate 以下。
- 边界：
  - 不修改 `#[tauri::command]` 名称、参数或返回值。
  - 不改 `command_registry.rs` 和 daemon dispatch key。
  - 不调整 branch checkout/create/delete/compare 的行为语义。

## Non-Goals

- 不重构 `git/mod.rs` shared helper 层。
- 不触碰 PR workflow、status/log/diff 这些非 branch 子域。
- 不引入新的 frontend/backend contract。

## What Changes

- 新增 `commands_branch.rs` 承载 branch lifecycle 与 branch compare 相关 command。
- `commands.rs` 改为挂载并 re-export branch 子模块，维持原有 outward surface。
- 保持外部调用方仍通过 `crate::git::*` 使用既有 branch command。
- 通过 typecheck、Rust tests 和 large-file gate 验证抽离没有破坏 contract。

## Capabilities

### New Capabilities
- `git-branch-command-extraction-compatibility`: 约束 git branch command 抽离后仍保持稳定 command contract、daemon dispatch key 与行为语义。

### Modified Capabilities
- None.

## Acceptance Criteria

- `src-tauri/src/git/commands.rs` 低于当前 `bridge-runtime-critical` policy 的 fail threshold。
- `crate::git::*` outward surface 中的 branch commands 保持不变。
- `command_registry.rs` 与 daemon dispatch key 不需要迁移。
- `npm run check:large-files:gate` 通过。

## Impact

- Affected code:
  - `src-tauri/src/git/commands.rs`
  - `src-tauri/src/git/commands_branch.rs`
  - `src-tauri/src/command_registry.rs`
  - `src-tauri/src/bin/cc_gui_daemon.rs`
  - `src-tauri/src/bin/cc_gui_daemon/git.rs`
- Verification:
  - `npm run typecheck`
  - `npm run check:large-files:gate`
  - `cargo test --manifest-path src-tauri/Cargo.toml git::`
