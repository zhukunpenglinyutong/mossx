## Why

用户偶发观察到最终回答已经显示，但 composer 仍停留在“正在生成响应”。这说明 realtime output 已经进入前端，terminal settlement 没有可靠清算 `isProcessing`，问题更像 `turn/completed` 到达、归属或处理竞态，而不是模型真实卡住。

该问题需要现在修复，因为近期后台运行会话性能优化已经降低 render pressure，但也让“真卡、没收到信号、收到信号但没正确处理”这三类问题更需要可审计的 settlement 证据区分。

## 目标与边界

- 为 realtime turn completion 增加可观测 settlement 诊断，明确区分 `turn/completed` 未到达、到达但被 turn/thread guard 拒绝、到达并完成清算。
- 在不改变 provider/runtime 执行语义的前提下，让最终 assistant output 已经可见的 terminal turn 能可靠退出 pseudo-processing。
- 保护 newer active turn：任何 fallback settlement 都不得误清后续新 turn 的 `isProcessing`。
- 覆盖 pending thread 与 finalized/canonical thread alias 的 completion settlement，避免最终文本落在一个 thread、processing 残留在另一个 thread。
- 用 focused tests 固化极端事件序列。

## 非目标

- 不改变 Codex/Claude/Gemini provider protocol。
- 不把 `item/completed` 等同为无条件 turn terminal；它只能作为辅助证据。
- 不移除现有 `activeTurnId` guard；只补充更精确的诊断与安全 fallback。
- 不重写 runtime session scheduling、background render gating 或 staged hydration。
- 不处理所有历史会话恢复问题；本次只处理实时 turn terminal settlement。

## What Changes

- 增加 turn settlement audit：记录 workspace/thread/turn、canonical/alias thread、activeTurnId、processing state、settlement result 与拒绝原因。
- 补强 `turn/completed` 清算路径：当 completion 与 pending alias/canonical thread 出现归属分裂时，必须对安全相关 thread 同步清算。
- 增加 guarded fallback settlement：如果已有最终 assistant completion evidence，且没有 newer active turn，则允许 completion 终态清掉 pseudo-processing residue。
- 增加 regression tests，覆盖最终文本已显示但 `turn/completed` 被 mismatch/alias race 拒绝的极端态。
- 保持 rollback-safe：新增逻辑应局限于 settlement 判断和 diagnostics，不改变 stream ingestion、runtime lifecycle 或 render gating。

## 技术方案对比

| 方案 | 描述 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- | --- |
| A. 只加日志，不改 settlement | 仅记录 `turn/completed` 和 `markProcessing(false)` 证据 | 风险最低，能确认现场 | 用户仍会偶发卡住，无法止血 | 不单独采用，作为第一层 |
| B. `item/completed` 直接清 `isProcessing` | 最终文本到达就认为 turn 完成 | 实现简单，能消除 spinner 残留 | 可能误清仍在跑的 tool/subagent/newer turn | 拒绝，破坏生命周期语义 |
| C. 诊断 + alias-aware settlement + guarded fallback | 先按 terminal event 清算；只在 final output evidence 且无 newer turn 时 fallback | 命中竞态根因，保护新 turn，可审计 | 需要补测试覆盖边界 | 采用 |

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `conversation-lifecycle-contract`: 补充 realtime terminal settlement 必须可靠退出 pseudo-processing，且 fallback settlement 不能误清 newer active turn。
- `conversation-realtime-client-performance`: 补充 settlement diagnostics 必须能区分 upstream/runtime stall 与 frontend terminal handling failure。

## Impact

- Frontend realtime event routing and thread settlement:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreadEventHandlers.ts`
  - `src/features/threads/hooks/useThreadTurnEvents.ts`
  - `src/features/threads/hooks/useThreadsReducer.ts`
- Tests:
  - focused Vitest for `useThreadEventHandlers` / `useThreadTurnEvents` / reducer settlement behavior.
- Dependencies:
  - No new dependency.

## 验收标准

- 当最终 assistant output 已经显示且对应 turn 已 terminal，composer MUST 退出“正在生成响应”。
- 当 `turn/completed` 的 `turnId` 与当前 thread 的 active turn 不匹配，但 alias thread 匹配时，settlement MUST 同时清算 canonical 与 alias thread。
- 当 `turn/completed` 被拒绝时，debug/audit MUST 记录拒绝原因、active turn、alias turn 与 processing 状态。
- 当存在 newer active turn 时，fallback settlement MUST NOT 清掉该 newer turn 的 processing 状态。
- Focused tests MUST cover terminal event mismatch、pending/canonical alias split、final assistant evidence fallback 和 newer turn guard。
