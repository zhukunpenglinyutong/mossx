## Context

`runtime/mod.rs` 现在同时承担 runtime state、ledger、event parsing、reconcile、Tauri commands，以及 workspace session lifecycle helper。  
其中从 `close_runtime` 到 `evict_workspace_session` 这一段逻辑围绕同一个主题展开：runtime close/evict/terminate/replace/rollback。这个子域已经足够独立，适合抽到 `session_lifecycle.rs`，而不需要先动 command 层或 frontend contract。

## Goals / Non-Goals

**Goals:**
- 让 `runtime/mod.rs` 脱离 retained hard debt。
- 把 workspace session lifecycle helper 聚拢到独立 backend-local 模块。
- 保持 `crate::runtime::*` 的既有可见面和 runtime command 语义稳定。

**Non-Goals:**
- 不改 `#[tauri::command]` contract。
- 不重构 runtime manager 内部状态机。
- 不拆 process diagnostics / ledger / reconcile / event parsing 子域。

## Decisions

### Decision 1: 按 workspace session lifecycle 子域抽离

- Decision: 将 `close/evict/stop/terminate/replace/rollback` 相关 helper 迁到 `session_lifecycle.rs`。
- Rationale: 这些函数围绕同一生命周期主题，并共享 `WorkspaceSession`、`RuntimeManager`、replacement gate 等依赖，聚合到一起最自然。
- Alternative considered:
  - 先拆 `engine/commands.rs` 或 `git/commands.rs`：能降别的热点，但不能解决 `runtime/mod.rs` 的当前 hard debt。
  - 只抽 `replace_workspace_session_with_terminator`：减重有限，而且会把强耦合 helper 撕开。

### Decision 2: 保持 `runtime/mod.rs` 为 façade，并重导出稳定 helper

- Decision: `runtime/mod.rs` 通过 `use` / `pub(crate) use` 接入 `session_lifecycle.rs`，维持现有调用方的导入路径不变。
- Rationale: `settings/mod.rs`、`shared/workspaces_core.rs`、`codex/session_runtime.rs`、`engine/opencode.rs`、runtime tests 已依赖 `crate::runtime::*`，保持 façade 能把迁移面压到最小。
- Alternative considered:
  - 让调用方直接改成 `crate::runtime::session_lifecycle::*`：结构更纯，但会扩大改动范围。

### Decision 3: 不触碰 command payload 和 frontend mapping

- Decision: 本轮只做 backend-local extraction，不改变 Tauri commands、payload、String error contract。
- Rationale: 当前收益来自降低文件复杂度，不需要冒 cross-layer contract 风险。
- Alternative considered:
  - 顺手重构 command surface：收益不成比例，且需要 frontend 同步验证。

## Risks / Trade-offs

- [Risk] helper 迁移后可见性设置错误，导致外部调用或测试断裂  
  → Mitigation: 保持 `crate::runtime::*` outward surface 稳定，并用 typecheck + runtime tests 验证。

- [Risk] 生命周期 helper 移出后遗漏对私有父模块类型或常量的访问  
  → Mitigation: 通过 `super::` 精确引入现有类型/常量，不复制定义。

- [Trade-off] `runtime/mod.rs` 仍然不算小  
  → Mitigation: 本轮目标是先脱离 hard debt；后续再评估 reconcile 或 event parsing 子域是否值得继续拆。

## Migration Plan

1. 补齐本轮 Trellis PRD 与 OpenSpec artifacts。
2. 新建 `session_lifecycle.rs`，迁移 lifecycle helper。
3. 在 `runtime/mod.rs` 中增加子模块声明与稳定 re-export。
4. 执行 `typecheck`、Rust runtime tests 和 large-file gate。
5. 重算 baseline/watchlist。

Rollback strategy:
- 若出现行为或编译回归，直接回退 `session_lifecycle.rs` 与 `runtime/mod.rs` 接线，不触碰其他 runtime 逻辑。

## Open Questions

- None.
