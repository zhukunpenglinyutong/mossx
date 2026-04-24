## Context

`engine/mod.rs` 当前暴露 `commands.rs` 作为 engine command surface。  
在 `commands.rs` 内部，从 `opencode_commands_list` 到 `opencode_lsp_references` 的整段逻辑，围绕同一个 OpenCode 子域展开：commands/agents/session/provider/mcp/lsp。这个子域已经足够清晰，适合抽到 `commands_opencode.rs`。

## Goals / Non-Goals

**Goals:**
- 让 `engine/commands.rs` 脱离 retained hard debt 并低于 warn threshold。
- 把 OpenCode command surface 聚拢到独立子模块。
- 保持 `crate::engine::*`、`command_registry.rs`、workspace cleanup 的有效调用面稳定。

**Non-Goals:**
- 不改 `engine_send_message`、`engine_send_message_sync`、`engine_interrupt` 的主链逻辑。
- 不重排 `engine/mod.rs` 的 shared type 定义。
- 不引入新的 helper contract 或 frontend payload 变化。

## Decisions

### Decision 1: 按 OpenCode command surface 整体抽离

- Decision: 将 `opencode_commands_list` 到 `opencode_lsp_references` 的整段逻辑迁到 `commands_opencode.rs`。
- Rationale: 这是最完整的业务边界；它既能解决当前超阈值问题，也能让 `commands.rs` 回到只承载 engine-level orchestration 的角色。
- Alternative considered:
  - 只抽 LSP 或 provider 子域：能过线，但会留下更混杂的 OpenCode surface。
  - 先拆 `engine_send_message`：风险更高，会碰主链与事件转发。

### Decision 2: 在 `commands.rs` 内嵌 OpenCode 子模块并 re-export

- Decision: `commands.rs` 通过 `mod commands_opencode; pub use commands_opencode::*;` 接入子模块。
- Rationale: `engine/mod.rs` 已经通过 `pub use commands::*;` 暴露 command surface；在 `commands.rs` 内部继续做 façade，可以把改动面压到最小。
- Alternative considered:
  - 在 `engine/mod.rs` 直接并行挂新模块：也可行，但会把 shared type 面和 command surface 面混在一起。

### Decision 3: 复用现有 helper 和 DTO 定义，不复制 shared logic

- Decision: OpenCode 子模块继续复用 `commands.rs` 已有的 DTO、cache、parse/helper imports。
- Rationale: 本轮目标是模块化，不是第二轮 shared helper 重排；复制定义只会制造 drift。
- Alternative considered:
  - 把 DTO/cache/helper 一起搬走：会扩大变更，增加 tests 和 sibling module 的接线复杂度。

## Risks / Trade-offs

- [Risk] 子模块层级变化后 `super::*` 可见性接线出错  
  → Mitigation: 保持子模块只依赖父模块已导入的 shared helper，并用 Rust tests 验证。

- [Risk] `clear_mcp_toggle_state` 的工作区清理调用失效  
  → Mitigation: 保持该 helper 继续通过 `commands.rs` re-export 暴露给既有调用方。

- [Trade-off] OpenCode DTO 和 cache 仍留在 `commands.rs`  
  → Mitigation: 本轮先解决 retained hard debt；后续若有需要再评估二次抽离。

## Migration Plan

1. 创建本轮 Trellis PRD 与 OpenSpec artifacts。
2. 新建 `commands_opencode.rs`，迁移 OpenCode command surface。
3. 在 `commands.rs` 中挂载并 re-export 子模块。
4. 执行 Rust engine tests 与 large-file gate。
5. 重算 baseline/watchlist。

Rollback strategy:
- 若出现编译或行为回归，直接回退 `commands_opencode.rs` 与 `commands.rs` 接线，不触碰 send/interrupt 主链。

## Open Questions

- None.
