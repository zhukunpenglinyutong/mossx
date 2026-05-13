## Why

用户观察到：静态打开五个会话也不卡，但两个会话同时处于实时运行态时，来回切换运行中会话会明显卡顿。这说明瓶颈不只是会话数量，而是后台运行会话仍以 foreground priority 推动高频 UI 更新，导致 runtime stream、store dispatch、React commit、terminal/markdown/diff 渲染与 scroll/layout effect 叠加放大。

本变更要建立运行态会话的 foreground/background 调度契约：后台任务必须继续正常运行且不丢事件，但后台 UI 不应继续执行高成本实时渲染；切回前台时再按优先级恢复可见输出。

## 目标与边界

- 前台 active session 保持现有实时体验，用户可见输出、输入态、审批态、错误态必须即时。
- 后台 running session 必须保持 runtime connection、stream ingestion、任务执行、事件排序与最终状态收敛。
- 后台 running session 只能实时更新轻量 metadata，例如 running 状态、最后活动时间、未读/待处理计数、错误摘要。
- 后台高成本输出面板必须降频、缓冲或暂停 render-side effects，例如 terminal output、markdown streaming、diff viewer、large tool output、auto-scroll、layout measurement。
- 从后台切回前台时，界面必须先恢复可交互 shell，再以 bounded batch / frame budget 恢复 buffered output，避免一次性 flush 堵塞主线程。
- 该变更只定义 client/runtime 调度与可观测性契约，不改变 AI provider、模型执行语义或后端任务生命周期。

## 非目标

- 不中断、不暂停、不降级后台实际任务执行。
- 不把后台 session 从 runtime 断开再重连作为性能优化手段。
- 不删除现有 realtime micro-batching、reducer no-op、incremental derivation 等优化能力。
- 不以“只限制同时运行会话数量”替代调度治理。
- 不在本变更中重写 conversation storage、canonical history 或 provider protocol。

## What Changes

- 引入 active/inactive runtime session visibility priority：active session 使用 foreground render budget，inactive running session 使用 background render budget。
- 为 inactive running session 建立 lossless output buffer：后台事件继续被接收、排序、归档到 canonical state 或待 flush 队列，但不驱动高成本可见树逐 delta render。
- 为切换会话建立 staged hydration：先渲染 session shell 与关键状态，再按 frame budget 恢复 terminal/markdown/diff/tool output。
- 为后台运行态增加 observability：记录 stream ingress cadence、background buffer depth、flush latency、React commit/render cost、long task evidence。
- 提供 rollback-safe 开关：可按层关闭 background render gating、buffered flush、staged hydration，同时保持 baseline-compatible realtime semantics。
- 不引入 breaking changes；用户可见语义应保持“任务继续跑、切回来能看到完整输出”。

## 方案对比

| 方案 | 描述 | 优点 | 风险 | 取舍 |
| --- | --- | --- | --- | --- |
| A. 限制同时运行会话数 | 超过 N 个运行会话则阻止或暂停新任务 | 实现简单，立即降低负载 | 破坏多会话并行能力，不能解释“2 个也卡”的根因 | 不采用，属于功能倒退 |
| B. 后台断开 runtime，切回再恢复 | inactive session 断开 stream 或 suspend runtime | UI 压力最低 | 违反后台任务不中断约束，存在事件丢失、重连竞态、任务状态污染 | 不采用，风险不可接受 |
| C. 后台 UI 降频 + lossless buffer + staged hydration | runtime 继续运行，后台只更新轻量状态，高成本输出缓冲，切回分帧恢复 | 命中根因，保留并行任务语义，可观测、可回滚 | 需要明确 event ordering、buffer bound、flush 策略 | 采用 |

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `conversation-realtime-cpu-stability`: 增加 inactive running session 的后台渲染预算、lossless buffer、分帧 flush 与 long task 防护要求。
- `conversation-realtime-client-performance`: 增加 active/inactive session 维度的性能预算与诊断证据，区分 provider delay、runtime stream delay 与后台 UI render amplification。
- `runtime-session-lifecycle-stability`: 增加后台可见性变化不得触发 runtime disconnect、terminate、reacquire 或任务暂停的生命周期约束。

## Impact

- 前端 session 切换、conversation canvas、runtime output rendering、terminal/markdown/diff/tool output surface。
- Realtime event ingestion、store subscription、selector derivation、render pacing、auto-scroll/layout effect。
- Runtime lifecycle 与 WebService/Tauri IPC 状态展示，但不改变 provider/backend execution contract。
- 测试需要覆盖：后台运行不中断、后台事件不丢失、切回输出收敛、active session 输入态不被延迟、rollback flag 恢复 baseline behavior。

## 验收标准

- 当两个或以上会话同时 running，切换到后台的会话 MUST 继续接收 runtime events，任务执行 MUST 不被暂停、断开或重启。
- 后台 running session 的高频 output delta MUST NOT 逐条触发高成本可见组件渲染；只允许轻量 metadata 实时更新。
- 切回后台运行过的会话后，buffered output MUST 按原始逻辑顺序完整收敛，且不能出现重复、乱序、丢失。
- 切换会话时 UI MUST 先恢复可交互 shell，再分批恢复重输出，避免一次切换同步 flush 全部 buffered output。
- 诊断日志或指标 MUST 能关联 workspace/thread/engine/turn，并能区分 ingress、buffer、flush、render、long task 阶段。
- 任一优化层 rollback 后，系统 MUST 回到 baseline-compatible realtime behavior，且不破坏 session continuity。
