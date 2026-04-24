## Context

`git-history.css` 当前仍采用聚合入口 + `part1/part2` 的组织方式。  
`git-history.part1.css` 尾部存在一整块以 `git-history-branch-compare-*` 为前缀的样式命名空间，覆盖 branch compare modal、list card、commit list 与 detail panel。这块内容边界清晰，适合直接抽成独立 shard。

## Goals / Non-Goals

**Goals:**
- 让 `git-history.part1.css` 脱离 retained hard debt。
- 保持 `git-history.css` 为唯一聚合入口。
- 保持 branch compare 的 selector contract、cascade 和用户可见样式稳定。

**Non-Goals:**
- 不改 branch compare DOM 结构或行为逻辑。
- 不重写 `git-history-branch-compare-*` 规则内容。
- 不触碰 git history 其它样式命名空间。

## Decisions

### Decision 1: 按命名空间整体抽离 branch compare 样式

- Decision: 从 `.git-history-branch-compare-modal` 首次出现的位置开始，整块迁出到 `git-history.branch-compare.css`。
- Rationale: 这是最完整、最清晰的命名空间边界，抽离后不会把同一个 compare 视图的规则撕裂到多个文件。
- Alternative considered:
  - 只抽 detail panel 或 commit list 子块：减重更有限，也会把同一功能样式拆散。
  - 按行数平均切块：能降行数，但会降低维护性。

### Decision 2: 保持 `git-history.css` 单入口并在 `part1` 后立即引入新 shard

- Decision: 在 `git-history.css` 中将 `git-history.branch-compare.css` 放在 `git-history.part1.css` 之后、`git-history.part2.css` 之前。
- Rationale: 原 branch compare 样式位于 `part1` 尾部；把新 shard 插在相同的相对位置，能最大限度保持 cascade 等价。
- Alternative considered:
  - 直接追加到文件尾部：实现简单，但更容易改变与 `part2` 之间的覆盖顺序。

## Risks / Trade-offs

- [Risk] `part2` 中少量选择器可能依赖 `part1` 尾部的相对顺序  
  → Mitigation: 新 shard 放在 `part1` 和 `part2` 之间，尽量保持原顺序关系。

- [Risk] 后续维护者把 branch compare 新规则继续写回 `git-history.part1.css`  
  → Mitigation: 新文件名直接表明 branch compare 归属，降低放错位置的概率。

- [Trade-off] `git-history.css` import 数量增加  
  → Mitigation: 先解决 retained hard debt；后续若继续治理 git history，再考虑更高层次的样式分组。

## Migration Plan

1. 补齐本轮 Trellis PRD 与 OpenSpec artifacts。
2. 新建 `git-history.branch-compare.css` 承载 `git-history-branch-compare-*` 命名空间。
3. 从 `git-history.part1.css` 中移除对应样式块，并更新 `git-history.css` import 顺序。
4. 运行 large-file gate 与 baseline/watchlist 重算，确认 `git-history.part1.css` 已脱离 retained hard debt。

Rollback strategy:
- 若出现视觉或 cascade 回归，直接回退 `git-history.branch-compare.css` 与 `git-history.css` import 调整，不涉及 TS/组件逻辑回退。

## Open Questions

- None.
