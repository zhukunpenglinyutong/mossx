## ADDED Requirements

### Requirement: Codex Runtime Silence MUST Surface Bounded Liveness Diagnostics

对于 `Codex` 受管 runtime，系统 MUST 将“启动后长时间无首包”与“runtime 存活但协议静默”视为受限 liveness 状态，而不是直接坍缩成普通 idle。

#### Scenario: startup-pending is distinct from idle retention
- **WHEN** `Codex` runtime 已成功创建或 reacquire
- **AND** 前台 turn 已开始等待首个生命周期事件
- **AND** 该窗口尚未完成终态结算
- **THEN** 系统 MUST 将 runtime 标记为 `startup-pending`、`waiting-first-event` 或等效 liveness 状态
- **AND** 该状态 MUST NOT 被归类为普通 warm idle

#### Scenario: silent-busy remains protected until bounded settlement
- **WHEN** `Codex` turn 已经获得前台处理权
- **AND** runtime 进程仍存活但在受限窗口内没有新的协议事件
- **THEN** 系统 MUST 将该 runtime 视为 `silent-busy`、`resume-pending` 或等效 active-work protection 状态
- **AND** 自动清理与池化策略 MUST NOT 仅因 lease 缺失就把该状态视为可随意回收的 idle

#### Scenario: bounded liveness timeout settles to structured degraded outcome
- **WHEN** `startup-pending` 或 `silent-busy` 超出配置的受限窗口
- **THEN** 系统 MUST 产出结构化 degraded diagnostic
- **AND** 诊断 MUST 指明该条链路是在首包等待阶段还是恢复等待阶段超时
