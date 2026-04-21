## Context

当前 `Codex` 长任务存在一条跨层状态断裂链：

- frontend 在发送后会先进入 `processing`
- `requestUserInput` 提交后会再次进入 processing 等待恢复事件
- runtime pool 主要按 `turn lease / stream lease` 判断 busy
- `Codex` 在 waiting-first-event、resume-after-user-input 等阶段缺少统一的 liveness contract

这会产生两个用户可见故障：

1. 线程长期 loading，前端无法恢复，`requestUserInput` 卡片可见但交互链可能被外层阻塞。
2. runtime pool 同时把该实例或 workspace 显示成 `idle/空闲`，形成“前端卡住但池子空闲”的矛盾口径。

约束：

- 不能仅靠加大 timeout 解决，否则只是推迟挂死时间。
- 不能破坏 `Claude`、`OpenCode`、`Gemini` 的既有生命周期语义。
- 需要复用现有 diagnostics surfaces，避免新造一套平行事故系统。

## Goals / Non-Goals

**Goals:**

- 为 `Codex` 定义可观测的 stalled liveness states，例如 `startup-pending`、`waiting-first-event`、`silent-busy`、`resume-pending`。
- 让 foreground turn 在恢复链停滞时 deterministically 退出 pseudo-processing，进入 recoverable degraded state。
- 让 runtime pool console 能区分 `true idle` 与 “无 lease 但仍有未结算 foreground work”。
- 让 `requestUserInput` 提交后的恢复链具备 bounded settlement，避免卡片与线程永久冻结。
- 在 runtime、thread canvas、diagnostics 之间共享相关联的状态维度。

**Non-Goals:**

- 不重写整个 runtime pool leasing 模型。
- 不为所有引擎统一引入 heartbeat 协议。
- 不在本变更内 redesign 全部 conversation event schema。
- 不把所有 runtime 异常都提升为 stalled recovery；仅覆盖 foreground turn 已开始但恢复链停滞的场景。

## Decisions

### Decision 1: 引入 shared stalled-recovery contract，而不是单点修前端 loading

选择：

- 采用新的 capability `codex-stalled-recovery-contract`，定义 stalled 状态、bounded settlement 和 cross-surface correlation。

原因：

- 这次问题不是单一 UI bug，而是 runtime、lifecycle、user-input、pool console 的共享状态断裂。
- 如果只修前端 loading，pool console 仍会继续误报 idle；如果只修 pool console，线程仍会永久 processing。

备选方案：

- 方案 A：只给前端加超时 auto-unlock。放弃，原因是会掩盖 runtime 事实，且无法解释 pool idle mismatch。
- 方案 B：只给 runtime 增加 lease 保活。放弃，原因是仍缺少 thread-facing degraded settlement 与 requestUserInput 恢复兜底。

### Decision 2: 将 stalled liveness 作为 “foreground protected but not streaming” 的独立状态，而不是继续复用 idle/warm

选择：

- 在 runtime stability 与 runtime pool console 中显式区分 `true idle`、`warm retained`、`startup-pending`、`silent-busy`、`resume-pending`。

原因：

- 现在的误判根源就是把“没有 lease”直接等价成“空闲”。
- stalled liveness 的本质是“协议静默但 foreground work 尚未结算”，其 survival reason 与 idle retention 完全不同。

备选方案：

- 继续沿用 `idle + extra text`。放弃，原因是状态语义仍然不一等，后续调用方容易继续按 idle 处理。

### Decision 3: `requestUserInput` 成功提交后必须进入 bounded resume window

选择：

- 提交成功只代表“答案已发送”，不代表 turn 已真正恢复成功。
- 系统需要进入一个 bounded `resume-pending` window；若窗口内无恢复事件或终态，则转为 recoverable degraded。

原因：

- 当前链路里最危险的点是：提交后再次 `markProcessing(true)`，但没有兜底结算。
- 这导致“卡片出来了但点不了”演变成永久冻结。

备选方案：

- 提交成功后立即清空 processing。放弃，原因是会丢失真实的恢复执行期语义，也会让用户误以为 turn 已结束。

### Decision 4: stalled timeout 拆成首包等待与恢复等待两套口径

选择：

- `first-event timeout` 复用现有 `initial_turn_start_timeout` 配置口径。
- `resume-after-user-input timeout` 新增独立配置，并默认短于 `first-event timeout`。

原因：

- 首包等待覆盖的是 runtime 启动、`turn/start` 返回、首个生命周期事件到达这段链路。
- `requestUserInput` 提交后的恢复等待只覆盖“答案已发送后，后续 turn 是否继续推进”，语义更窄，也更不应该沿用过长窗口。
- 如果两者共用一套阈值，Windows 上更慢的启动链容易被误判，macOS 上又会把提交后恢复挂死拖得过久。

备选方案：

- 共用单一 stalled timeout。放弃，原因是无法区分启动慢与恢复断链两类现象，诊断价值不足。

### Decision 5: runtime pool 第一版仅在现有 row 上表达 stalled continuity

选择：

- 第一版 runtime pool console 只在现有 `RuntimePoolRow` 上增加 stalled continuity 语义与字段，不引入 workspace-level ghost row。

原因：

- 当前 backend snapshot 与 summary 都是 runtime row 模型，直接扩展现有 row 风险最低。
- 这次问题的重点是“不要误报 idle”，不是重做 pool 结构。
- 如果一开始就加入 ghost row，Win/mac 上 runtime 退出时序差异更容易造成前后端对同一 workspace 展示不同实体。

备选方案：

- 引入 workspace-level ghost row。暂不采用，原因是会扩大 schema 和 UI 复杂度，且目前没有证据表明现有 row 模型无法覆盖第一版需求。

### Decision 6: 复用现有 diagnostics surfaces，不新增平行事故系统

选择：

- stalled recovery 证据写入现有 runtime diagnostics、thread/session diagnostics 与 runtime pool console。

原因：

- 这条故障需要跨层关联 `workspace/thread/runtime` 事实。
- 如果再新建一套 incident store，会加重维护成本且不利于现场排障。

备选方案：

- 单独增加 stalled incident history 表。放弃，原因是超出本变更必要范围。

## Risks / Trade-offs

- [Risk] stalled window 配置过短，可能把合法的长静默任务误判为 degraded。
  → Mitigation：仅对“foreground turn 已启动但无推进事件”的窗口启用；`first-event timeout` 复用现有启动超时口径，`resume-after-user-input timeout` 单独配置并默认更短。

- [Risk] cross-surface 状态维度增加后，前后端枚举值不同步。
  → Mitigation：通过 OpenSpec delta specs 明确共享语义，并在实现期补 runtime/frontend contract 校验。

- [Risk] runtime pool console 新增 stalled 分类后，用户可能把它理解成“进程一定还活着”。
  → Mitigation：在 console 同时暴露 process identity 与最近 exit metadata，区分“runtime 仍活着的 silent-busy”与“workspace slot 仍有未结算 stalled work 但 runtime 已终止”。

- [Risk] 只给 `Codex` 加 contract 可能引入 engine-specific 分支蔓延。
  → Mitigation：把 capability 定义为 `Codex` scoped，但生命周期结算与 diagnostics 接口保持通用表达，限制分支停留在 adapter/runtime boundary。

## Migration Plan

1. 在 runtime stability / lifecycle / user-input / pool console 的实现层先引入新的 stalled state vocabulary。
2. 为 `Codex` waiting-first-event 与 user-input resume 两条链路分别接入 bounded settlement，并落定两套 timeout 口径。
3. 更新 runtime pool snapshot 口径，使其在现有 `RuntimePoolRow` 上可表达 `silent-busy` / `resume-pending`。
4. 验证 existing engines 未受影响，必要时支持 feature-flag 或 guarded rollout。
5. 若上线后误判过多，可先回退为“保留 diagnostics 但不改变主状态文案”，不破坏底层证据采集。

回滚策略：

- UI 层可先隐藏 stalled 主状态展示，但保留内部 diagnostics；
- runtime 侧可关闭 stalled 主判定，仅保留日志采样；
- 如需完全回滚，则恢复原 lifecycle settlement 逻辑，但需保留事故证据以便继续分析。

## Open Questions

- `resume-after-user-input timeout` 的默认值应当设为首包超时的固定比例，还是独立常量更合适？
- 当 runtime 已退出但 row 仍承载 stalled continuity 时，是否需要追加更明确的 UI 文案来区分“进程已终止”与“前台结算未完成”？
- `requestUserInput` 卡片“点不了”的直接原因是否还包含 overlay/focus trap/outer disabled 层，需要在实现前用一次最小复现场景验证？
