## Why

完成“会话切换卡顿”修复后，实时对话的长时间连贯性暴露出另一类问题：最终回答已经可见，但前端偶发仍停在 loading，甚至后期出现无响应或直接断尾。现有补丁只会在 terminal settlement 前主动 `flush` 本地批处理队列，却不能阻止已经排队的 realtime work 在稍后重新落到 store，把已终态 turn 又拉回 `processing`。

这类问题必须现在补，因为它不是单纯性能抖动，而是 conversation terminal contract 被破坏：一旦 turn 已经完成、报错或 stalled，同一 turn 的晚到 delta / snapshot / normalized event 就不应再反向修改前端生命周期状态。

## 目标与边界

- 为每个 thread 建立轻量 terminal turn fence，使已终态 turn 的晚到 realtime event 在真正执行时被丢弃。
- fence 必须覆盖 batched realtime delta、queued normalized event、raw item snapshot 三条主要落状态路径，而不是只挡事件入口。
- event handler 必须在进入 item/realtime hook 之前做 terminal turn 前置判断，避免 raw item snapshot 等 legacy path 绕过执行点 fence。
- legacy / normalized fallback realtime 分发必须保留 `turnId` 到最终 handler，避免 `File changes`、command output、reasoning 或 fallback completion 绕过 terminal fence。
- `turn/started`、`turn/completed`、`turn/error`、`turn/stalled` 必须显式推进 fence 生命周期，确保旧 turn 被隔离、新 turn 不受影响。
- 当 terminal settlement 被前端 guard 拒绝，但 final assistant evidence 已存在且没有 newer active turn 时，系统必须允许一次保守 fallback 清算。
- regression tests 必须覆盖“timer batch 晚到”和“`startTransition` 已排队后 turn 才终态”两类竞态。

## 非目标

- 不重写 provider/runtime protocol，不改变 Claude/Codex/Gemini 的后端 turn 语义。
- 不移除现有 `activeTurnId` guard，也不把所有 settlement reject 都改成强制清算。
- 不把任意 `item/completed` 视作 turn terminal。
- 不复用本变更去承接后台调度、buffered rendering 或 session visibility 优化。

## What Changes

- 在 `useThreadItemEvents` 增加 per-thread realtime turn fence，记录 active turn 和最近 terminal turn 集合。
- 在 realtime delta flush、normalized event dispatch、raw item snapshot update 的执行点增加 terminal turn 自裁判断，避免排队 work 在 terminal 后继续写状态。
- 在 `useThreadEventHandlers` 中把 fence 接入 `turnStarted`、completed settlement、error settlement、stalled settlement，并在 raw item / normalized event / delta handler 入口提前跳过已 terminal turn。
- 在 `useAppServerEvents` 中补齐 legacy / normalized fallback 的 `turnId` 透传，覆盖 agent completion、reasoning、command output、terminal interaction、file change output 等路径。
- 当 `turn/completed` settlement 被拒绝但 final assistant output 已经可见、且没有 newer active turn 时，补一次 conservative fallback settlement 清掉 pseudo-processing residue。
- 补 focused tests 与 `useThreads` integration regression，覆盖 batched delta 被 terminal fence 丢弃、queued transition 在 terminal 后不再重开 processing、event handler 的 fence 调用顺序、fallback realtime 分发的 `turnId` 透传，以及 completed turn 后晚到 normalized update 不再恢复 processing。
- 不引入 breaking change，不新增依赖。

## 方案对比

| 方案 | 描述 | 优点 | 风险 | 取舍 |
| --- | --- | --- | --- | --- |
| A. 继续强化 `flushPendingRealtimeEvents()` | 只在 terminal 前多做几次 flush，希望排空本地队列 | 改动小 | 已排队的 `startTransition` / future callback 仍会晚到执行，治标不治本 | 不采用 |
| B. terminal 后统一强制 `markProcessing(false)` | 不管晚到事件来源，只要 terminal 就反复压平 loading | 实现简单 | 旧事件仍会继续污染 store；对新 turn/并发 tool path 的保护不足 | 不采用 |
| C. 在执行点增加 terminal turn fence | 让 batched/queued work 在真正执行时再次核对 turn 是否已终态 | 直接命中竞态根因，对新旧 turn 隔离清晰，回归面小 | 需要补 turn fence 生命周期与测试 | 采用 |

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `conversation-lifecycle-contract`: realtime terminal settlement 之后，同一 turn 的晚到客户端事件 MUST NOT 重新开启 processing 或继续修改该 turn 的 live state；若 settlement 被拒绝但 final assistant evidence 已存在且无 newer active turn，frontend MUST 允许保守 fallback 清算。
- `conversation-realtime-client-performance`: client-side batching / transition scheduling MUST 在执行点支持 terminal turn 自裁，避免异步排队工作在终态后继续提交高频 state update。

## Impact

- Frontend realtime lifecycle:
  - `src/features/app/hooks/useAppServerEvents.ts`
  - `src/features/threads/hooks/useThreadItemEvents.ts`
  - `src/features/threads/hooks/useThreadEventHandlers.ts`
- Focused regression tests:
  - `src/features/app/hooks/useAppServerEvents.test.tsx`
  - `src/features/threads/hooks/useThreadItemEvents.test.ts`
  - `src/features/threads/hooks/useThreadEventHandlers.test.ts`
  - `src/features/threads/hooks/useThreads.integration.test.tsx`
- No API change, no new dependency, no backend contract change.

## 验收标准

- 当某个 turn 已经 completed、error 或 stalled 后，同一 turn 的晚到 realtime delta MUST NOT 再次触发 `markProcessing(true)`。
- 当 normalized realtime event 已经通过异步调度排队，但其 turn 在执行前已 terminal，该事件 MUST 在执行点被丢弃。
- 当 raw item 或 normalized event 进入 `useThreadEventHandlers` 且对应 turn 已 terminal，handler MUST 在调用下游 item/realtime hook 之前跳过该事件。
- 当 raw item snapshot 在 terminal settlement 后晚到，frontend MUST NOT 再为该 turn upsert/append 会重新激活 live processing 的内容。
- 当 `File changes`、command output、terminal interaction、reasoning delta 或 fallback assistant completion 经 legacy / normalized fallback 分发时，frontend MUST 保留 `turnId` 到最终 handler，使这些事件继续受 terminal fence 约束。
- 当 `turn/completed` 被 reject，但 final assistant output 已经可见且当前没有 newer active turn 时，frontend MUST 清掉残留 processing 并保留 completion 终态。
- 新 turn 开始后，旧 turn fence MUST NOT 阻断新 turn 的正常实时输出。
- Focused Vitest suites MUST 覆盖 batched delta、queued transition、turn handler fence 顺序、fallback `turnId` 透传和 `useThreads` 组合链路下的 late normalized update 回归。
