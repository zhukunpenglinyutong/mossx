## Why

`Context Ledger` 的阶段一二已经解决了“当前有哪些上下文来源”和“下一轮怎么最小治理”，但用户仍然缺少最关键的第二层信任：**系统刚刚把什么改掉了**。

当前用户仍然很难回答：

- 发送前后，哪些上下文块被保留、移除或新出现？
- compaction 发生后，最近轮次到底是“被压缩了”还是只是“状态文案变了”？
- token 占用变化，是来自手动治理，还是来自 compaction / usage refresh？

如果没有“状态变化可见性”，`Context Ledger` 仍然更像静态清单，而不是可解释的治理面板。

## What Changes

- 为 `Context Ledger` 增加基于前后快照的 `transition diff` 能力。
- 在发送后对比“上一次发送准备态”和“当前准备态”，解释哪些 block：
  - added
  - removed
  - retained
  - changed
- 为 Codex compaction 增加“压缩前基线”对比，解释 compaction 后 recent turns / usage 的变化，而不是只显示一条状态块。
- 当当前上下文已基本清空，但最近一次 send / compaction 对账本造成了变化时，允许 ledger 以“变化摘要”继续可见，避免发送后面板瞬间消失。
- 让被 `Keep for next send` 保留下来的 block 在下一轮准备态中保持可辨识，而不是重新伪装成普通 selected。

## Goals

- 让用户看到 `last send -> now` 的账本变化摘要。
- 让 Codex compaction 场景具备 `pre-compaction -> now` 的解释视图。
- 让跨轮保留语义具备可见性，用户能区分“本轮手动选择”与“由上一轮保留带入”。
- 继续复用现有 `ContextLedgerProjection` 与 shared usage snapshot，不新增另一套发送协议或 runtime contract。
- 保持阶段三第一轮范围聚焦在变化可见性，不同时引入来源跳转和更复杂的跨轮策略 UI。

## Non-Goals

- 不在本次变更引入 raw prompt inspector。
- 不在本次变更重写 compaction 算法或 memory retrieval。
- 不在本次变更实现来源跳转到 memory/note/file 管理面板。
- 不在本次变更把 `keep for next send` 扩展成长期策略系统。

## Capabilities

### New Capabilities

- `context-ledger-transition-diff`: 基于前后账本快照的变化摘要与 change list。

### Modified Capabilities

- `context-ledger-surface`: surface 需要承载最近变化摘要，并在 send 后短时继续可见。
- `codex-context-auto-compaction`: compaction 需要展示相对压缩前快照的变化解释，而不是仅保留状态块。

## Acceptance Criteria

- 用户发送一轮后，若本轮上下文块发生变化，ledger MUST 能显示与“最近一次发送前快照”的对比摘要。
- 对比摘要 MUST 至少区分 added / removed / retained / changed 四类变化中的必要子集。
- 当前没有显式 memory/file/helper 选择时，若存在最近一次 send / compaction 的变化摘要，ledger MAY 继续显示该摘要，而不是完全消失。
- Codex compaction 发生后，ledger MUST 能表达“相对于压缩前快照”的 recent turns / usage 变化。
- 变化摘要与 compaction explainability MUST 继续复用 shared usage / compaction snapshot，不得引入与 dual-view 冲突的新口径。
- 被上一轮 `keep for next send` 带入当前准备态的显式 block MUST 保持可区分，不得回退成无差别的普通 selected。
