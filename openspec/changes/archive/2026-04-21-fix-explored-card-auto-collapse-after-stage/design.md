## Context

`Messages.tsx` 当前用全局 `isThinking` 作为 Explore 卡片的自动展开条件。这个状态只表示整轮会话仍在 processing，并不能表达当前 timeline 阶段是否仍是 Explore。

因此当实时对话从 Explore 推进到 tool、reasoning 或 assistant message 时，旧 `Explored` 卡片仍会因为 `isThinking === true` 保持展开。用户看到的焦点停留在上一阶段，和实时执行的当前阶段不一致。

## Goals / Non-Goals

**Goals:**

- 保留实时 Explore 阶段的自动展开。
- 当最新可见阶段不是 Explore 时，自动折叠此前的 `Explored` 卡片。
- 将变更限制在前端消息渲染局部状态，不影响 runtime contract。
- 用回归测试锁住 `isThinking=true` 且后续阶段已非 Explore 的场景。

**Non-Goals:**

- 不改变 Explore item 的生成、合并、去重、排序规则。
- 不改变 tool/reasoning/message 的展开逻辑。
- 不新增持久化偏好、后端字段或 Tauri command。
- 不调整视觉样式。

## Decisions

### Decision 1: 在 `Messages` 中推导当前 live Explore 阶段

采用 `groupToolItems(renderedItems)` 后的最终 entry 来判断当前可见阶段。若最后一个 entry 是 `item/explore/explored`，则该 Explore id 获得 live auto-expanded 权限；否则没有 Explore 卡片因实时 processing 自动展开。

替代方案是把全量 timeline 传入 `ExploreRow`，但这会让行组件承担阶段编排职责，破坏 component 边界。

### Decision 2: 保持 `expandedItems` 作为手动展开状态

`expandedItems` 继续表示用户手动展开或其他卡片展开状态。live auto-expanded id 是一个 derived state，不写入持久状态。

当 processing 结束或最新阶段变为非 Explore 时，只从 `expandedItems` 移除 Explore ids，不移除 reasoning/tool ids，避免影响其他卡片。

### Decision 3: 不改数据层 contract

本问题可通过 UI derived state 解决，不需要给 `ConversationItem` 新增 lifecycle 字段。这样可以避免扩大到 realtime assembler、history replay 或 backend 存储。

## Risks / Trade-offs

- [Risk] `groupToolItems` 会合并连续 Explore。→ Mitigation：以合并后的 Explore item id 作为渲染 key 与 auto-expanded id，和现有 render path 保持一致。
- [Risk] 非 Explore 阶段出现时误折叠用户刚手动展开的历史 Explore。→ Mitigation：只在 processing 的阶段推进场景或 processing 结束时清理 Explore ids；这是本需求要求的自动收起边界。
- [Risk] 影响其他工具卡片。→ Mitigation：清理逻辑限定 `item.kind === "explore"`，测试覆盖非 Explore tool 仍正常展示。

## Migration Plan

1. 增加阶段级 live Explore id derive。
2. 修改 `ExploreRow` 的 `isExpanded` 输入。
3. 增加回归测试覆盖 stage advance。
4. 运行目标测试与 typecheck。

Rollback：还原 `Messages.tsx` 与 `Messages.explore.test.tsx` 的本次改动，并移除 OpenSpec/Trellis artifacts。

## Open Questions

- None.
