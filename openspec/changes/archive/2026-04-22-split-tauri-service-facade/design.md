## Context

`src/services/tauri.ts` 是 frontend 和 Tauri runtime 之间的统一 façade。  
这个入口本身是对的，但目前把过多低耦合 domain 直接堆进了同一文件，导致：

- large-file governance 把它标记为 retained hard debt
- bridge 层改动时 diff 面积过大
- 低风险 domain 改动被迫和高风险 engine/codex/git 主链共享同一冲突面

本轮拆分只针对低耦合 domain，目标是减重，不是重构所有 bridge 逻辑。

## Goals / Non-Goals

**Goals:**
- 抽离低耦合 domain 到独立 submodule。
- 保持 `src/services/tauri.ts` 继续作为单一 import façade。
- 不改变 command 名、参数结构、返回值结构和 fallback 语义。

**Non-Goals:**
- 不拆 `engine/codex/git` 等高耦合主链。
- 不引入新的 abstraction layer 或 helper framework。
- 不改调用方代码。

## Decisions

### Decision 1: 保留顶层 façade，只抽实现

- Decision: `src/services/tauri.ts` 继续作为稳定入口，新增 `export * from "./tauri/<domain>"`。
- Rationale: 这样调用方零迁移，符合 bridge compatibility 要求。
- Alternative considered:
  - 直接让调用方改 import 到 submodule：理论上更干净，但会扩大改动面且破坏 façade contract。

### Decision 2: 先拆低耦合 domain，不碰高耦合主链

- Decision: 第一轮只抽 `dictation`、`terminal/runtime-log`、`project-memory`、`vendors/agents`。
- Rationale: 这些段落几乎只依赖 `invoke` 和局部类型，最适合安全降线。
- Alternative considered:
  - 先拆 `engine/codex/git`：收益大，但 fallback 和 payload 逻辑更复杂，回归风险更高。

### Decision 3: submodule 按 domain 对齐，不做“万能 helpers”抽象

- Decision: 一个 submodule 对应一个明确 domain，避免为了复用而先造 shared helper。
- Rationale: 当前目标是降低耦合，不是把复杂度转移到新的抽象层。
- Alternative considered:
  - 先抽一层通用 invoke helpers：短期并不必要，还会引入额外迁移面。

## Risks / Trade-offs

- [Risk] re-export 或 import 漏项导致调用方编译失败  
  → Mitigation: 跑 `npm run typecheck`，并让 `src/services/tauri.ts` 继续作为唯一 façade。

- [Risk] 拆分时误改函数签名或返回类型  
  → Mitigation: 只移动实现，不修改函数名、参数和返回值。

- [Trade-off] `src/services/tauri.ts` 仍会是一个较大的 façade 文件  
  → Mitigation: 这轮先把它降到 hard gate 以下；后续再继续拆更高耦合主链。

## Migration Plan

1. 新建 submodule 文件并移动低耦合 domain 实现。
2. 在 `src/services/tauri.ts` 顶层增加 re-export。
3. 删除 façade 中已迁出的实现。
4. 跑 typecheck 与 large-file gate，确认 contract 未回退。

Rollback strategy:
- 若出现编译或 contract 回退，直接回退本轮 submodule 抽取，不影响其他 domain。
