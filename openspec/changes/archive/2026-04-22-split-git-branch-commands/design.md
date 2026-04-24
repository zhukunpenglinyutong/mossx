## Context

`git/mod.rs` 当前承载 shared helper，`git/commands.rs` 承载 command surface。  
在 `commands.rs` 内部，从 `list_git_branches` 开始到 `get_git_worktree_file_diff_against_branch` 结束的整段逻辑，围绕同一个子域展开：branch list、checkout、create/delete/rename、merge/rebase，以及 branch compare/worktree diff。这个子域已经足够清晰，适合抽到 `commands_branch.rs`。

## Goals / Non-Goals

**Goals:**
- 让 `git/commands.rs` 脱离 retained hard debt。
- 把 branch lifecycle + compare command 聚拢到独立子模块。
- 保持 `crate::git::*` 的 outward surface、command registry、daemon dispatch key 稳定。

**Non-Goals:**
- 不改 `git/mod.rs` shared helper 布局。
- 不重写 branch command 的实现逻辑。
- 不调整 frontend/backend payload。

## Decisions

### Decision 1: 按 branch lifecycle + compare 子域整体抽离

- Decision: 将 `list_git_branches` 到 `get_git_worktree_file_diff_against_branch` 的整段逻辑迁到 `commands_branch.rs`。
- Rationale: 这是最完整的业务边界；它不仅能解决当前超阈值问题，还能让 `commands.rs` 更专注于非 branch command。
- Alternative considered:
  - 只抽一两个 checkout helper：可以过线，但会留下混杂的子域边界。
  - 先拆 `git/mod.rs`：会扩大 shared helper 回归面，不划算。

### Decision 2: 在 `commands.rs` 内嵌 branch 子模块并 re-export

- Decision: `commands.rs` 通过 `mod commands_branch; pub(crate) use commands_branch::*;` 接入子模块。
- Rationale: `git/mod.rs` 已经通过 `pub(crate) use commands::*;` 暴露 command surface；在 `commands.rs` 内部继续做 façade，可以把改动面压到最小。
- Alternative considered:
  - 在 `git/mod.rs` 直接并行挂新模块：也可行，但会让 shared helper 面和 command surface 面混在一起。

### Decision 3: 依赖现有 shared helper，不复制定义

- Decision: branch 子模块继续复用 `git/mod.rs` 里的 shared helper，如 `run_git_command`、`parse_patch_diff_entries`、`normalize_local_branch_ref`、`parse_remote_branch`。
- Rationale: 这些 helper 已经是稳定共享逻辑，复制只会制造 drift。
- Alternative considered:
  - 把 helper 一起搬进 branch 子模块：会扩大本轮变更，不符合 YAGNI。

## Risks / Trade-offs

- [Risk] 子模块层级变化后 `super::*` 可见性接线出错  
  → Mitigation: 保持 branch 子模块只依赖父模块已导入的 shared helper，并用 typecheck + Rust tests 验证。

- [Risk] branch compare 命令迁移后 daemon/registry 某个名字对不上  
  → Mitigation: 保持 outward function names 不变，不碰 registry 条目与 dispatch key。

- [Trade-off] `commands.rs` 仍然偏大  
  → Mitigation: 本轮目标是先脱离 hard debt；后续再评估是否把 PR/GitHub 子域单独抽走。

## Migration Plan

1. 补齐本轮 Trellis PRD 与 OpenSpec artifacts。
2. 新建 `commands_branch.rs`，迁移 branch lifecycle + compare 子域。
3. 在 `commands.rs` 中挂载并 re-export 子模块。
4. 执行 typecheck、Rust git tests 与 large-file gate。
5. 重算 baseline/watchlist。

Rollback strategy:
- 若出现编译或行为回归，直接回退 `commands_branch.rs` 与 `commands.rs` 接线，不触碰 `git/mod.rs` 和 shared helper。

## Open Questions

- None.
