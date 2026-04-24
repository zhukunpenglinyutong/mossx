## Context

`settings.css` 已经采用聚合入口 + 多个 shard 的组织方式，但 `settings.part1.css` 和 `settings.part2.css` 仍各自承担了过多 panel section。  
当前最安全的治理方式不是重写选择器，也不是按行数生硬切块，而是沿着现有注释边界，把已经成型的 section 整块迁到新的 shard 文件中。

## Goals / Non-Goals

**Goals:**
- 让 `settings.part1.css` 与 `settings.part2.css` 同时脱离 retained hard debt。
- 保持 `settings.css` 聚合入口稳定。
- 保持 selector contract、cascade 顺序和用户可见样式结果稳定。

**Non-Goals:**
- 不调整 settings 组件结构或 DOM className。
- 不重写 CSS 规则内容。
- 不做视觉 redesign 或 token 整理。

## Decisions

### Decision 1: 按自然 section 边界拆分，而不是按行数均摊

- Decision: 直接抽离 `settings.part1.css` 中的 `Vendor Settings` section，以及 `settings.part2.css` 中的 `Basic settings redesign` section。
- Rationale: 这两块本来就有明确注释边界，移动后最容易保证 selector 与 cascade 不漂移，也能一次性把两个文件都压到 hard gate 以下。
- Alternative considered:
  - 按行数平均切成 `part3/part4`: 能降行数，但会把同一视觉子域撕开，后续维护更差。
  - 继续堆到现有 `settings.part3.css`: 改动最少，但会污染已有 shard 语义边界。

### Decision 2: 保持 `settings.css` 为唯一聚合入口

- Decision: 新 shard 只通过 `src/styles/settings.css` 引入，不改上游样式入口。
- Rationale: 现有构建链和组件导入路径已经默认 `settings.css` 是聚合面；维持单入口能把回归面压到最小。
- Alternative considered:
  - 在组件侧直接多导入新 shard：会扩大调用面，破坏现有样式入口约定。

### Decision 3: 新 shard 的 import 位置必须与原 section 位置等价

- Decision: `settings.part1.vendor-panels.css` 紧跟在 `settings.part1.css` 之后，`settings.part2.basic-redesign.css` 紧跟在 `settings.part2.css` 之后。
- Rationale: 这样可以让拆分后的 cascade 顺序与原文件中 section 的相对位置保持等价，避免后定义规则覆盖关系漂移。
- Alternative considered:
  - 全部放到文件尾部统一引入：更省心，但更容易改变覆盖顺序。

## Risks / Trade-offs

- [Risk] 某些 selector 依赖原文件内的相对定义顺序  
  → Mitigation: 新 shard 按原 section 在聚合入口中的位置插入，保持等价 cascade。

- [Risk] 后续维护者把同一 panel 规则继续写回旧文件，重新造成漂移  
  → Mitigation: 新文件命名直接体现 section 归属，减少“找不到放哪”的概率。

- [Trade-off] `settings.css` import 数量进一步增加  
  → Mitigation: 当前目标是先压低 retained hard debt；等 settings 域彻底收敛后，再考虑更高层级的样式组织优化。

## Migration Plan

1. 补齐本轮 Trellis PRD 与 OpenSpec artifacts。
2. 新建两个 CSS shard 文件，分别承载 `Vendor Settings` 与 `Basic settings redesign` section。
3. 从原 `settings.part1.css` / `settings.part2.css` 中移除对应 section，并更新 `settings.css` import 顺序。
4. 运行 large-file gate 与 baseline/watchlist 重算，确认 retained hard debt 已下降。

Rollback strategy:
- 若发现视觉或 cascade 回归，直接回退这两个 shard 文件与 `settings.css` import 调整，不涉及组件逻辑回滚。

## Open Questions

- None.
