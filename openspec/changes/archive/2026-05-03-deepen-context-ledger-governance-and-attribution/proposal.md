## Why

`Context Ledger` 已经完成来源解释、变化对比和来源回跳，但用户仍然缺少“为什么它还在”和“怎么快速清掉一批上下文”的治理闭环。现在阶段一到三已经稳定，正是把账本从 explainability surface 推进到 governance surface 的时点。

## 目标与边界

### 目标

- 补齐 `carry-over` 可解释性，让用户看懂某个 block 为什么被带入当前轮次、何时会自动消耗。
- 增加最小 `batch governance` 能力，避免用户对多条 memory/helper block 逐条点选。
- 收紧 `degraded/shared` 归因表达，减少“明明是粗粒度估算却看起来像精确来源”的误导。

### 边界

- 本次不改写 backend prompt assembler，也不暴露 raw prompt。
- 本次 batch 治理只覆盖前端已显式可见、可治理的 block，不扩展到 provider-only segment。
- attribution hardening 优先复用现有 `backendSource + attributionKind`，不引入第二套 attribution pipeline。

## 非目标

- 不引入长期记忆策略系统。
- 不把 `Context Ledger` 做成历史时间线浏览器。
- 不在本次变更重做 compaction 算法或 manual memory retrieval。

## What Changes

- 为 `Context Ledger` block 增加 `carry-over reason` 表达，区分“将保留到下一轮一次”和“由上一轮 keep 带入”。
- 为 `carried_over` block 增加语义更准确的清理动作，而不是继续只暴露模糊的 `exclude next send`。
- 增加 batch selection / batch clear / batch keep 的治理入口，按来源组执行批量操作。
- 收紧 helper / engine / system / degraded 归因标签与解释 copy，让粗粒度 attribution 明示为 coarse/degraded。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续沿用现有 `participationState`，只补文案 | 成本最低 | 用户仍看不见 carry-over 生命周期；批量治理和 attribution 仍缺正式模型 | 不采用 |
| B | 在现有 block model 上扩展 `carry-over reason + batch governance + attribution confidence` | 与现有 projection/surface 连续，改动集中在 frontend model 与 surface | 需要补 tests、i18n、治理 eligibility matrix | **采用** |
| C | 直接把治理逻辑下沉到新的 runtime contract | 理论上更完整 | 过早跨层，当前阶段收益不足，且会扩大验证面 | 本期不采用 |

## 验收标准

- 用户 MUST 能在 `pinned_next_send` 与 `carried_over` block 上看到不同的原因说明，而不是只看到状态枚举。
- 用户 MUST 能对 `carried_over` block 执行明确的清理动作，并在当前准备态立即生效。
- 对前端显式可见的可治理 block，系统 SHOULD 提供批量 keep / clear / exclude 的最小入口。
- 对 `degraded/shared` attribution，ledger MUST 明示粗粒度性质，不得伪装成精确来源。
- 新增治理与 attribution copy MUST 走 i18n。

## Capabilities

### New Capabilities

- `context-ledger-governance-batch`: Context Ledger 的批量治理入口、批量 eligibility 和批量动作语义。

### Modified Capabilities

- `context-ledger-surface`: 增加 carry-over reason、clear carried-over、batch governance affordance。
- `context-ledger-attribution`: 增加 attribution confidence / coarse/degraded explainability 约束。
- `context-ledger-transition-diff`: 让跨轮 retained block 在 diff 之外也保持可解释生命周期。

## Impact

- Frontend:
  - `src/features/context-ledger/**`
  - `src/features/composer/components/Composer.tsx`
  - `src/i18n/locales/*.ts`
- State / contracts:
  - `ContextLedgerBlock` carry-over reason metadata
  - batch governance eligibility / action wiring
  - attribution confidence presentation
- Verification:
  - focused Vitest for projection / panel / composer governance
  - `npm run lint`
  - `npm run typecheck`
  - `npm run check:large-files`
