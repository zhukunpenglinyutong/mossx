## Context

当前 `Codex` 连续会话的 auto-drain handoff 存在一个前端可见性竞态：

1. `useQueuedSend` 会先把 queue 头部消息从排队态移除，再异步触发发送；
2. `useThreadMessaging` 的 optimistic user bubble 不是在摘队列的瞬间插入，而是更晚才进入消息流；
3. `useThreads` 在上一轮 turn completion 后会安排 Codex history reconcile，这个刷新可能落在两者之间。

因此幕布会进入一个短暂的“queue 已空、optimistic 未到、history 又可能覆盖”的窗口。这个窗口一旦被用户看到，就表现成“最新用户消息被吃掉”。

约束如下：

- 必须保持现有 runtime contract，不引入新的 Tauri command 或持久化字段。
- 必须局限在 `Codex` handoff 语义，不污染其它 provider。
- 必须避免重复气泡和 stale placeholder 长驻。

## Goals / Non-Goals

**Goals:**

- 让 `Codex live -> queued follow-up` 在整个 handoff 窗口中都有可见的 latest user bubble。
- 保证旧 turn reconcile 不会在 handoff 期间覆盖掉下一轮 queued user 的可见性。
- 在 optimistic / authoritative item 到达后平滑去重并清理过渡态。

**Non-Goals:**

- 不改 queue enqueue 规则或 FIFO 语义。
- 不改历史线程 loading UX。
- 不新增跨 provider 的统一 bubble pinning 框架，先局部修正 `Codex` 路径。

## Decisions

### Decision 1: 在 auto-drain 开始时建立 thread-local handoff bubble，而不是等待 optimistic item

- 方案 A：继续等 `sendUserMessage` 深处插入 optimistic user item。
- 方案 B：在 queue item 被摘离排队区时，立刻创建 handoff bubble。

采用 B。

原因：

- 这个 bug 的根因正是“摘队列”和“插气泡”之间存在空窗。
- handoff bubble 是一个前端过渡表达，不需要后端确认，因此应在本地最早时机建立。
- 这样可以保证幕布与 queue 的可见性切换是连续的。

实现约束：

- handoff bubble 必须携带足够的 identity 信息，用于后续和 optimistic / authoritative item 去重。
- handoff bubble 只对当前 thread 生效，且仅在 `Codex` queued auto-drain 路径创建。

### Decision 2: 优先用“显式 handoff state”而不是复用 history loading 占位

- 方案 A：把 handoff 期间看作“历史恢复中”，沿用 loading 占位。
- 方案 B：在消息时间线中渲染一个可去重的 user handoff bubble。

采用 B。

原因：

- 用户已经发送了一条具体消息，此时用 loading 会丢失消息文本本身，表达错误。
- 真实需求是“最新用户消息要持续可见”，不是“显示系统还在恢复”。
- handoff bubble 能和后续真实消息完成内容级去重，loading 做不到。

### Decision 3: 对旧 turn 的 Codex reconcile 增加 handoff-aware guard

- 方案 A：继续无条件执行 reconcile，让最新数据覆盖本地状态。
- 方案 B：当下一轮 queued turn 已开始或 handoff state 尚未消化时，延后或跳过会破坏 handoff 可见性的 reconcile 收口。

采用 B。

原因：

- 当前 race 的破坏性来自“旧 turn reconcile 还在按旧视角收口，但新 turn 的 user bubble 尚未稳定落地”。
- reconcile 的目标是收敛真实历史，而不是在过渡态里吃掉本地已知的最新用户消息。
- 只对 `Codex` handoff 窗口加 guard，风险最小。

实现约束：

- guard 不能导致 reconcile 永久失效，必须在 optimistic / authoritative item 稳定后恢复正常收口。
- guard 不能影响非 `Codex` 路径。

### Decision 4: 去重以“同线程同轮 handoff identity + payload 等价”为准，而不是保留双份气泡

- 方案 A：handoff bubble 一直留到 turn 完成。
- 方案 B：一旦 optimistic 或 authoritative user item 到达，就用 identity / payload 等价规则替换或清理 handoff bubble。

采用 B。

原因：

- 用户要的是连续可见，不是双份可见。
- 如果不做去重，history refresh 后会出现两个内容相同的 user bubble，反而引入新的可见性错误。
- handoff bubble 是 placeholder-like local state，职责只到真实消息稳定出现为止。

## Risks / Trade-offs

- [Risk] handoff bubble 和真实 optimistic item 去重失败，出现双气泡
  - Mitigation：在 handoff state 中保留 thread id、queue item id 或等价发送 identity，并对 `text/images/sendOptions` 做最小必要等价比较。

- [Risk] reconcile guard 条件过宽，导致历史收口被长期延后
  - Mitigation：guard 只在 `Codex` handoff 未决期间生效；一旦 optimistic / authoritative item 到达或 turn 进入稳定态，立即解除。

- [Risk] 只修 `Codex` 路径会留下跨 provider 行为不一致
  - Mitigation：本提案明确限定为 `Codex` bugfix；如后续发现其它 provider 也有同类竞态，再抽象共享能力。

- [Risk] 手动拼接 handoff bubble 影响现有消息时间线排序
  - Mitigation：将其作为 thread-local overlay 或明确插入 latest user tail，而不是改写整个历史排序逻辑。

## Migration Plan

1. 先在 `useQueuedSend` 建立 handoff state，但暂不改变 reconcile。
2. 再在消息时间线渲染层让该 state 可见，并补 optimistic / authoritative 去重逻辑。
3. 最后在 `useThreads` 给 Codex reconcile 增加 handoff-aware guard，补全 race 收口。
4. 用 integration test 锁定 `auto-drain -> handoff visible -> reconcile arrives -> authoritative item dedupe` 的完整链路。
