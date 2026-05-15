## Context

实时运行会话的卡顿症状集中在 active session 切换期间：静态会话数量增加不一定卡，但多个 running session 同时 streaming 时，后台会话仍可能推动 store dispatch、selector derivation、React commit、terminal/markdown/diff render、auto-scroll/layout measurement。结果是不可见会话消耗 foreground render budget，切回时 buffered 或 pending UI work 又集中 flush。

现有 specs 已覆盖 realtime micro-batching、reducer no-op、incremental derivation、性能诊断与 runtime lifecycle stability。本变更不替换这些能力，而是在其上增加 visibility-aware runtime session scheduling：runtime ingestion 与 task execution 保持 lossless，render-side work 按 active/inactive visibility 分级。

## Goals / Non-Goals

**Goals:**

- 保证 inactive running session 的 runtime connection、任务执行、event ingestion、event ordering 不被切后台动作中断。
- 降低 inactive running session 对主线程和 React render path 的实时压力。
- 切回会话时优先恢复可交互 shell，再按 bounded frame budget 恢复高成本输出。
- 提供可观测证据，能定位卡顿来自 provider delay、runtime ingress、buffer flush、render amplification 还是 long task。
- 提供分层 rollback，使优化可以按 render gating、buffered flush、staged hydration 独立关闭。

**Non-Goals:**

- 不限制用户并行运行会话数量作为主要解决方案。
- 不通过断开、暂停、重启后台 runtime 来换取 UI 性能。
- 不改变 canonical conversation history、provider protocol 或 backend execution lifecycle。
- 不在本变更内重写 terminal、markdown、diff viewer 的内部实现；只定义它们在 inactive visibility 下的调度约束。

## Decisions

### Decision 1: visibility priority 是 render policy，不是 runtime lifecycle

会话切换只改变 client render policy：

- `foreground`: active session，正常实时渲染高价值输出。
- `background`: inactive running session，保留 runtime ingestion 与 canonical state 收敛，但降低可见树更新频率。
- `restoring`: background session 被切回 active 后，先恢复 shell，再分批 hydrate buffered output。

不允许 visibility 变化触发 runtime disconnect、terminate、reacquire、pause 或 provider-level cancellation。

替代方案：把 inactive session 视为 lifecycle suspend。该方案 UI 压力最低，但违反“后台任务正常运行”约束，并会制造 late event、reconnect race、generation 污染风险，因此拒绝。

### Decision 2: 后台只实时投递 lightweight projection

后台 running session 的实时 UI 更新只允许进入轻量 projection：

- running / processing / waiting approval / failed / completed 状态。
- last activity timestamp。
- unread output count 或 buffered bytes/lines。
- latest error summary。
- approval-required presence。

高成本 surfaces 进入 buffer 或 throttled view，包括 terminal lines、markdown deltas、tool output、diff content、large file render、auto-scroll 与 layout measurement。

替代方案：所有后台事件仍写入完整 React-visible conversation tree，但依赖 reducer no-op 降低成本。该方案保留现状语义，但无法解决高频 streaming 下的 render amplification，因此不足。

### Decision 3: buffer 必须 lossless，但 render flush 可以 bounded

后台 output buffer 的约束：

- accepted event 必须 exactly-once 被消费。
- 同一 thread/turn/item 的逻辑顺序必须保持。
- snapshot-equivalent event 可以沿用既有 coalescing 规则合并，但 completion、approval、error、tool boundary、history reconciliation 等语义事件不得丢弃。
- buffer 必须有可观测 depth 与 latency；达到安全阈值时可以降级为更粗粒度 summary，但 canonical event semantics 仍必须可恢复。

切回前台后的 flush 约束：

- 先同步关键状态与 composer safety state。
- 再按 frame budget / chunk size 恢复高成本 output。
- flush 期间用户输入、审批点击、停止任务等 send-critical 操作不能被后台 hydrate 阻塞。

替代方案：切回时一次性 flush 全部 output。该方案最简单，但正是切换卡顿的触发器，因此拒绝。

### Decision 4: staged hydration 保护切换路径的交互优先级

切换会话的渲染顺序：

1. 更新 active session identity 与 lightweight shell。
2. 恢复 composer、审批态、错误态、stop/retry controls。
3. 分帧恢复 visible output viewport 附近内容。
4. 后台继续恢复远离 viewport 的历史输出或低优先级 tool/diff 区块。

如果用户在 hydration 期间输入、发送、停止或再次切换，会取消或让出低优先级 hydrate work，避免 stale flush 抢占交互。

### Decision 5: 诊断必须按阶段归因

新增或复用指标维度：

- `workspaceId`、`threadId`、`engine`、`turnId`。
- visibility state: `foreground` / `background` / `restoring`。
- ingress cadence、buffer depth、buffer age、flush chunk size、flush duration。
- React commit/render cost、long task count、layout measurement cost。
- rollback flag state。

这些证据用于区分：

- provider 或 backend 首包慢。
- runtime stream ingress 慢。
- client buffering/flush 慢。
- render amplification 或 layout thrash。

## Risks / Trade-offs

- [Risk] 后台 buffer 实现不严谨导致输出乱序或重复。→ Mitigation: 以 thread/turn/item/revision 建立 ordering key，并用 focused tests 覆盖 delta、completion、error、approval、tool boundary。
- [Risk] 过度降频让用户误以为后台任务没在跑。→ Mitigation: 轻量 metadata 必须即时更新，并展示 running、last activity、buffered count。
- [Risk] 切回时 staged hydration 导致短暂内容不完整。→ Mitigation: shell 先可交互，同时展示 restoring 状态；viewport 优先恢复。
- [Risk] buffer 长时间增长造成内存压力。→ Mitigation: 记录 depth/bytes/age 阈值，必要时把低优先级输出压缩为 summary projection，但 canonical event log 仍保持可恢复。
- [Risk] rollback 粒度过粗导致诊断失效。→ Mitigation: render gating、buffered flush、staged hydration、diagnostics 分层开关，诊断默认保留。

## Migration Plan

1. 建立 visibility priority model 与轻量 session projection，不改变 runtime lifecycle。
2. 为高成本 output surfaces 接入 inactive render gating 与 buffer queue。
3. 实现切回时 staged hydration 与 cancellation/yield 策略。
4. 增加性能诊断与 focused tests。
5. 默认先通过 feature flag 或 internal profile 开启，确认无事件丢失与无 lifecycle 回退后再扩大。

Rollback:

- 关闭 background render gating：回到 baseline 实时 render。
- 关闭 staged hydration：切回时使用 baseline render。
- 保留 diagnostics：便于比较优化前后证据。
- 任一 rollback 不得断开 runtime 或清空 canonical state。

## Open Questions

- Buffer 上限应按 lines、bytes、event count 还是 estimated render cost 计算？
- Terminal、markdown、diff、tool output 哪些 surface 先接入 gating，最小 MVP 是否只覆盖 conversation output + terminal？
- 是否需要在 UI 上显式展示“后台已缓冲 N 条输出”？
- 现有 store subscription 是否已经支持 per-thread selector 隔离，还是需要先补一层 active thread projection？
