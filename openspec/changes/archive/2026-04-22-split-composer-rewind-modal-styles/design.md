## Context

`composer.css` 当前仍采用聚合入口 + `part1/part2` 的组织方式。  
`composer.part1.css` 末尾存在一整块以 `claude-rewind-modal-*` 为前缀的样式命名空间，覆盖 overlay、card、review layout、diff panel、responsive breakpoints 等 rewind modal 视觉结构。这块内容边界清晰，适合直接抽成独立 shard。

## Goals / Non-Goals

**Goals:**
- 让 `composer.part1.css` 脱离 retained hard debt。
- 保持 `composer.css` 为唯一聚合入口。
- 保持 rewind modal 的 selector contract、cascade 和用户可见样式稳定。

**Non-Goals:**
- 不改 modal DOM 结构或行为逻辑。
- 不重写 `claude-rewind-modal-*` 规则内容。
- 不触碰 composer 其它样式命名空间。

## Decisions

### Decision 1: 按命名空间整体抽离 rewind modal 样式

- Decision: 从 `.claude-rewind-modal` 首次出现的位置开始，整块迁出到 `composer.rewind-modal.css`。
- Rationale: 这是最完整、最清晰的命名空间边界，抽离后不会把同一个 modal 的规则撕裂到多个文件。
- Alternative considered:
  - 只抽 responsive `@media` 段：减重不足，而且会把同一命名空间分散到多个文件。
  - 按行数平均切块：能降行数，但会降低样式的可维护性。

### Decision 2: 保持 `composer.css` 单入口并在 `part1` 后立即引入新 shard

- Decision: 在 `composer.css` 中将 `composer.rewind-modal.css` 放在 `composer.part1.css` 之后、`composer.part2.css` 之前。
- Rationale: 原 rewind modal 样式位于 `part1` 尾部；把新 shard 插在相同的相对位置，能最大限度保持 cascade 等价。
- Alternative considered:
  - 直接追加到文件尾部：实现简单，但更容易改变与 `part2` 之间的覆盖顺序。

## Risks / Trade-offs

- [Risk] `part2` 中少量选择器可能依赖 `part1` 尾部的相对顺序  
  → Mitigation: 新 shard 放在 `part1` 和 `part2` 之间，尽量保持原顺序关系。

- [Risk] 后续维护者把 rewind modal 新规则继续写回 `composer.part1.css`  
  → Mitigation: 新文件名直接表明 rewind modal 归属，降低放错位置的概率。

- [Trade-off] `composer.css` import 数量增加  
  → Mitigation: 先解决 retained hard debt；后续若继续治理 composer，再考虑更高层次的样式分组。

## Migration Plan

1. 补齐本轮 Trellis PRD 与 OpenSpec artifacts。
2. 新建 `composer.rewind-modal.css` 承载 `claude-rewind-modal-*` 命名空间。
3. 从 `composer.part1.css` 中移除对应样式块，并更新 `composer.css` import 顺序。
4. 运行 large-file gate 与 baseline/watchlist 重算，确认 `composer.part1.css` 已脱离 retained hard debt。

Rollback strategy:
- 若出现视觉或 cascade 回归，直接回退 `composer.rewind-modal.css` 与 `composer.css` import 调整，不涉及 TS/组件逻辑回退。

## Open Questions

- None.
