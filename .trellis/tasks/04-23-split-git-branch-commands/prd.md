# Split git branch commands into dedicated submodule

## Goal
在不改变 git command contract、frontend invoke 名称和现有 branch 行为语义的前提下，将 `src-tauri/src/git/commands.rs` 中的 branch lifecycle 与 branch compare 子域抽到独立子模块，优先把主文件压回当前 `bridge-runtime-critical` policy 的 hard gate 以下。

## Requirements
- 新建 `src-tauri/src/git/commands_branch.rs` 承载 `list/checkout/create/delete/rename/merge/rebase/branch compare` 相关 command 与局部 helper。
- 保持 `crate::git::*` 对外暴露的 branch command 名称稳定。
- 不修改 `command_registry.rs` 中的 command 名称、参数或返回值。
- 抽分后 `src-tauri/src/git/commands.rs` 需要低于当前 `bridge-runtime-critical` policy 的 fail threshold。

## Acceptance Criteria
- [ ] 新增 git branch command 子模块承载上述命令域。
- [ ] `src-tauri/src/git/commands.rs` 行数降到 `2600` 以下。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run check:large-files:gate` 通过，且 `git/commands.rs` 不再属于 retained hard debt。
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml git::` 通过。

## Technical Notes
- OpenSpec change: `split-git-branch-commands`
- 本轮只做 façade-style extraction，不改 git helper contract、不改 daemon dispatch key、不改 frontend payload mapping。
