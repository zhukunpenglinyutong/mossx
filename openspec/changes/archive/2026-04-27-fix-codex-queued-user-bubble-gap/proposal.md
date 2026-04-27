## Why

### 背景/问题

在 `Codex` 实时对话中，如果用户在当前 turn 处理中连续追问，系统会先把后续消息放进 queue。当前 turn 结束后，queue 会自动进入下一轮 follow-up，但幕布里经常出现一个可见性断层：

1. queue item 已经被 auto-drain 从排队区摘掉；
2. 新一轮的 user optimistic bubble 还没插入到消息流；
3. 上一轮 turn completion 触发的 Codex history reconcile 可能又在这个窗口里刷新一次消息源。

结果就是：最新用户消息会短暂甚至高概率“被吃掉”，直到稍后的 history refresh 才重新出现。用户看到的是“我明明刚发了消息，但幕布里没有”，这会直接破坏连续对话的可信度。

这个问题不属于 `show-codex-history-loading-state` 的边界。后者只处理“打开尚未恢复完成的 Codex 历史线程时，空白消息区要显示 loading”，并不覆盖 live turn 结束后的 queued follow-up handoff。

## 目标与边界

### 目标

- 目标 1：保证 `Codex` 在 `live -> queued follow-up` 自动切换时，幕布里始终能立即看到最新用户消息。
- 目标 2：即使上一轮 turn 的 history reconcile 与下一轮 queued turn 并发发生，也不能把这条最新用户消息暂时吃掉。
- 目标 3：当 authoritative history user item 到达时，本地过渡态要能平滑去重，不出现重复 user bubble。

### 边界

- 仅修复 `Codex` 实时会话结束后自动进入 queued follow-up 时的 user bubble continuity。
- 优先在前端线程态和消息渲染层闭环解决，不新增 Rust/Tauri command，不修改 runtime contract。
- 保持当前 `show-codex-history-loading-state` task 独立，不并入本提案。
- 不重做整个消息时间线架构，也不改 queue 的 FIFO 或 composer 入口语义。

## 非目标

- 不处理“首次打开历史线程时的 loading 占位”问题。
- 不修改 Claude、Gemini、OpenCode 的行为。
- 不新增新的 queue UI 组件模式或新的后端消息类型。
- 不改变既有 turn completion / history restore 的全局策略，只约束它在该 handoff 窗口内不能破坏可见性。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续沿用当前流程，只在 history refresh 后补显示 | 实现最少 | 用户仍会看到“消息被吃掉”的窗口，问题本身不解决 | 不采用 |
| B | 仅扩展当前 history loading 占位，把 handoff 也视为 loading | 可复用部分 UI 空态 | 会把“用户已发出的真实消息”错误表达成 loading，不满足即时可见 | 不采用 |
| C | 在 queue auto-drain 开始时创建 thread-local handoff 可见态，并对旧 turn reconcile 加保护 | 能直接覆盖可见性断层，且不改协议 | 需要补本地去重和 race 测试 | **采用** |

取舍：采用 C。这个问题的本质不是“历史没回来”，而是“本地 handoff 期间没有任何可见 user bubble”。因此要在 auto-drain 切换时显式建立一个过渡可见态，并确保 reconcile 不会把它抹掉。

## What Changes

### 具体改动方案

- 在 `useQueuedSend` 中为 `Codex` queued auto-drain 增加 thread-local 的 `pendingQueuedUserBubble` 或等价 handoff state。
- handoff state 在 queue item 被摘出排队区的同一时刻建立，让幕布立即有“最新 user message”的可见表示。
- 在 `useThreadMessaging` 中，当 optimistic user item 或 authoritative history user item 到达时，清理该 handoff state，并完成去重收口。
- 在 `useThreads` 的 Codex history reconcile 链路中增加 handoff-aware guard：如果下一轮 queued turn 已经开始，或者该线程仍存在 handoff state，则不得把最新 user bubble 从可见状态打掉。
- 增补 integration / regression test，覆盖 `queue auto-drain + old-turn reconcile + dedupe` 的竞态组合。

### 交互说明

1. 当前 `Codex` turn 仍在运行时，用户继续追问，消息进入 queue。
2. 当前 turn 结束并自动切换到 queue 的下一条消息时，幕布必须在同一 handoff 窗口内立刻显示这条最新用户消息。
3. 即使这时旧 turn 的 history reconcile 到来，幕布里也不能短暂失去该消息。
4. 当真实 optimistic item 或 history item 到达后，本地 handoff bubble 必须平滑让位，不出现重复。

### 预期效果

- 用户不会再看到“queue 里没了，但幕布里也没有”的空档。
- 连续多轮实时追问时，latest user bubble 的可见性稳定。
- 该修复保持在前端编排层，不扩散到 runtime contract。

## Capabilities

### New Capabilities

- `codex-queued-user-bubble-continuity`: 定义 `Codex live -> queued follow-up` handoff 期间，最新 user bubble 的可见性、reconcile 护栏和去重语义。

## Impact

- 前端 hook：
  - `src/features/threads/hooks/useQueuedSend.ts`
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreads.ts`
- 消息渲染层：
  - `src/features/messages/components/Messages.tsx`
  - `src/features/messages/components/MessagesTimeline.tsx`
- 测试：
  - queue auto-drain / thread messaging / Codex history reconcile 相关 Vitest

## 验收标准

- `Codex` 当前 turn 结束并自动进入 queued follow-up 时，最新用户消息在 1 次 handoff 渲染窗口内保持可见。
- 旧 turn 的 history reconcile 即使与下一轮 queued turn 并发，也不会让最新用户消息短暂消失。
- authoritative history user item 到达后，不出现重复 user bubble。
- `show-codex-history-loading-state` 的既有 loading 行为不回归。
