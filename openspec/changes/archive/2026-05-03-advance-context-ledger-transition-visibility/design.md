## Context

阶段一二的 `Context Ledger` 已经具备：

- 统一 block projection
- composer-adjacent surface
- next-send governance
- backend helper attribution

但它仍以“当前态”为中心。阶段三的第一优先能力是把账本升级为“**当前态 + 最近变化**”。

## Decisions

### 1. 发送变化对比基于 `last send baseline`，而不是重放历史消息

- 在 `Composer` 发送时，记录一份发送前的 `ContextLedgerProjection` 作为 `last send baseline`
- 发送收敛后，当前 projection 与 baseline 做纯前端 comparison
- comparison 只解释当前账本与最近一次发送前账本的差异，不尝试重建 provider raw prompt

原因：

- 发送前 projection 已经是当前产品里最稳定的 send-preparation 真值
- 不需要额外 backend contract

### 2. compaction 解释基于 `pre-compaction baseline`

- 在 compaction lifecycle 从 `idle` 进入 `compacting` 前，缓存上一个稳定 projection 作为 `pre-compaction baseline`
- 当前 projection 与该 baseline 做 comparison
- compaction explainability 主要关心：
  - recent turns usage delta
  - compaction summary block 的进入
  - 当前仍为 `pending_sync` 还是已同步

原因：

- 用户关心“压缩到底改了什么”，不是只看一条状态 badge
- 使用 compaction 前的 projection 作为对照，语义最直接

### 3. comparison 以 summary-first 呈现，不把 removed blocks 强塞回当前 groups

- `ContextLedgerPanel` 增加独立的 comparison summary 区
- 当前 groups 仍只表达“当前态 block”
- removed blocks 不伪装成当前仍在的 block，而是在 summary 中以 changed rows 呈现

原因：

- 当前账本和历史差异是两种语义
- 强行把 removed block 混进当前 groups，会污染 block actions 与参与状态含义

### 4. send 后面板允许因 comparison 而继续可见

- 阶段一二里 `usage-only` 场景不会显示独立 ledger
- 阶段三新增例外：如果 comparison summary 存在，则 panel 可继续显示

原因：

- 否则发送后变化最明显的时刻，面板反而瞬间消失，解释链断掉

### 5. `keep for next send` 需要显式区分“将保留”和“已由上一轮保留带入”

- `pinned_next_send` 表示该 block 已被标记为下一轮继续保留
- 新增 `carried_over` 表示该 block 是因为上一轮的 keep 语义而带入当前准备态
- `carried_over` block 仍可再次执行 `keep for next send` 或 `exclude from next send`

原因：

- 如果 send 后立即把 retained block 重新降成普通 `selected`，用户无法理解它为什么还在，也无法判断它何时会自动消耗
- 这会让跨轮治理语义重新退化成“行为对，但状态不可解释”

## Data Model

建议在前端新增 comparison model：

```ts
type ContextLedgerComparisonBasis =
  | "last_send"
  | "pre_compaction";

type ContextLedgerComparisonItemChange =
  | "added"
  | "removed"
  | "retained"
  | "changed";

type ContextLedgerComparisonItem = {
  key: string;
  title: string;
  kind: ContextLedgerBlockKind;
  change: ContextLedgerComparisonItemChange;
};

type ContextLedgerComparison = {
  basis: ContextLedgerComparisonBasis;
  addedCount: number;
  removedCount: number;
  retainedCount: number;
  changedCount: number;
  currentUsageTokens: number | null;
  previousUsageTokens: number | null;
  usageTokenDelta: number | null;
  items: ContextLedgerComparisonItem[];
};
```

## Validation

- projection comparison pure tests：
  - added / removed / retained / changed 分类
  - usage delta 计算
  - compaction summary comparison
- composer integration tests：
  - send 后即使当前无显式 block，comparison 仍能让 panel 可见
- panel tests：
  - comparison summary 渲染
  - basis 文案与 delta 文案正确

## Follow-up

本 change 不承诺完成以下能力，但会为其预留结构：

- source navigation / jump-back
- carry-over reason visualization
- batch governance
