# runtime-session-lifecycle-stability Specification

## Purpose

Defines the runtime-session-lifecycle-stability behavior contract, covering Runtime Session Lifecycle MUST Be Explicit For Each Workspace Engine Pair.

## Requirements
### Requirement: Runtime Session Lifecycle MUST Be Explicit For Each Workspace Engine Pair

系统 MUST 为每个 `workspace + engine` 维护明确的 runtime session lifecycle 状态，并将 create / replace / stop / terminate / recover / quarantine 统一解释为状态转移。

#### Scenario: acquire transitions from idle to active through acquiring

- **WHEN** 用户在某个 `workspace + engine` 上启动需要 runtime 的会话
- **THEN** lifecycle MUST 从 `idle` 进入 `acquiring`
- **AND** runtime health probe 或等价 ready signal 成功后 MUST 进入 `active`

#### Scenario: stopping runtime is not reusable as foreground target

- **WHEN** 某个 runtime 已进入 `stopping`、`ended` 或 manual shutdown 等价状态
- **THEN** create-session / send / resume 路径 MUST NOT 将该 runtime 作为新的 foreground execution target
- **AND** 系统 MUST 启动或等待一轮 fresh guarded acquisition

#### Scenario: quarantine blocks automatic recovery but allows explicit retry

- **WHEN** automatic recovery 已因重复失败进入 `quarantined`
- **THEN** 系统 MUST 暂停同一 `workspace + engine` 的进一步 automatic recovery
- **AND** 用户显式 retry / reconnect MUST 可以开启一轮 fresh bounded recovery cycle

### Requirement: Runtime Generation MUST Isolate Late Events From New Sessions

系统 MUST 使用 runtime generation 或等价 identity 区分当前 runtime 与已被替换或停止的 predecessor，防止 late event 污染新 session。

#### Scenario: old runtime ended event does not end replacement session

- **WHEN** runtime replacement 已经产生新的 active generation
- **AND** 旧 generation 之后才发出 completion、stdout EOF、runtime ended 或 diagnostics event
- **THEN** 该 late event MUST NOT 结束或污染新 generation 的 active turn
- **AND** 系统 MAY 将其记录为 predecessor lifecycle evidence

#### Scenario: replacement preserves current active work signal

- **WHEN** replacement 期间新 runtime 已接管 foreground work
- **THEN** predecessor 的 cleanup event MUST NOT 清空新 runtime 的 active work state
- **AND** frontend MUST NOT 因 predecessor cleanup 进入错误的 pseudo-processing 或 disconnected 状态

### Requirement: Lifecycle Diagnostics MUST Be Classified And Correlatable

runtime lifecycle 相关失败 MUST 输出结构化 diagnostics，而不是只暴露 raw provider / transport text。

#### Scenario: runtime loss includes reason code and recovery action

- **WHEN** runtime 在 active turn、pending request、resume 或 create-session 期间丢失
- **THEN** diagnostics MUST 尽可能包含 `workspaceId`、`engine`、`threadId`、`runtimeState`、`reasonCode`、`recoverySource`、`retryable`、`userAction`
- **AND** `reasonCode` MUST 区分 `runtime-ended`、`manual-shutdown`、`stopping-runtime-race`、`probe-failed`、`recovery-quarantined` 等核心类别

#### Scenario: frontend and backend evidence use shared dimensions

- **WHEN** frontend 显示 thread recovery notice、toast、runtime panel 或 status panel
- **THEN** 这些 surface MUST 保留与 backend diagnostics 可关联的 workspace、engine、thread、reasonCode 或 recoverySource
- **AND** 排障不应依赖人工猜测 raw error text 所属 lifecycle 阶段

### Requirement: WebService Reconnect MUST Refresh Runtime And Thread State

WebService reconnect MUST 被视为 runtime lifecycle source，系统 MUST 在 reconnect 后刷新 runtime 与 thread 状态。

#### Scenario: reconnect refreshes active workspace runtime snapshot

- **WHEN** WebService frontend 与 daemon 断线后重新连接
- **THEN** 系统 MUST 刷新 active workspace 的 runtime snapshot
- **AND** MUST 记录 `recoverySource=web-service-reconnected` 或等价 diagnostics source

#### Scenario: reconnect reconciles active thread binding

- **WHEN** WebService reconnect 后当前 active thread 绑定可能 stale
- **THEN** 系统 MUST 触发 active thread state refresh 或 reconcile
- **AND** thread list、active thread、runtime panel MUST 收敛到同一后端真值

#### Scenario: reconnect refresh is idempotent

- **WHEN** 多个 reconnect 或 refresh event 在短时间内到达
- **THEN** 系统 MUST 避免对同一 `workspace + engine` 发起无界重复 refresh / resume
- **AND** later callers MUST wait、reuse leader result 或获得 guarded degraded outcome

### Requirement: User-Facing Lifecycle State MUST Be Actionable

用户可见的 runtime/session 异常状态 MUST 显示可理解状态和可执行动作。

#### Scenario: recovering state explains wait or retry

- **WHEN** runtime lifecycle 处于 `recovering`
- **THEN** UI MUST 显示恢复中状态
- **AND** 如果恢复超时或失败，MUST 提供 retry / reconnect / start fresh thread 等可行动作

#### Scenario: ended state does not masquerade as loading

- **WHEN** runtime lifecycle 已进入 `ended`
- **THEN** UI MUST NOT 继续只显示 indefinite loading 或 pseudo-processing
- **AND** MUST 显示会话已结束、可重连或可新建会话的明确文案

### Requirement: Runtime Recovery Guard MUST Bound Automatic Reacquire And Reconnect

For each `workspace + engine` pair, the host runtime MUST apply a bounded, source-aware recovery guard so automatic session reacquire, reconnect, and runtime-dependent retry paths cannot form an unbounded storm loop.

#### Scenario: lifecycle state participates in guarded recovery decisions

- **WHEN** automatic recovery source targets a `workspace + engine`
- **THEN** recovery guard MUST consider current lifecycle state such as `acquiring`、`recovering`、`quarantined`、`stopping`
- **AND** it MUST NOT start a duplicate recovery leader when an equivalent lifecycle transition is already in flight

### Requirement: Session Visibility Changes MUST NOT Interrupt Runtime Execution
Changing whether a running session is foreground or background MUST NOT be treated as a runtime lifecycle transition that can disconnect, terminate, pause, reacquire, or restart the underlying runtime.

#### Scenario: switching a running session to background keeps runtime active
- **WHEN** a running session is switched away from foreground
- **THEN** the runtime connection and in-flight task MUST continue running under the same lifecycle generation
- **AND** the system MUST NOT issue disconnect, terminate, pause, reacquire, or restart actions solely because the session became inactive

#### Scenario: switching a running session back to foreground does not create a replacement runtime
- **WHEN** a background running session is switched back to foreground
- **THEN** the frontend MUST rebind visible surfaces to the existing runtime generation when it is still active
- **AND** the system MUST NOT create a replacement runtime unless normal lifecycle diagnostics indicate the current runtime is actually lost or unusable

### Requirement: Background Session State MUST Remain Reconciliable After Reconnect
If the host reconnects while sessions were backgrounded, runtime and thread state reconciliation MUST preserve background execution continuity and buffered output semantics.

#### Scenario: reconnect reconciles background running sessions
- **WHEN** WebService or Tauri frontend connectivity is restored after a disconnect
- **AND** one or more sessions were running in background visibility before or during the disconnect
- **THEN** runtime refresh MUST reconcile their current lifecycle state without assuming user-visible inactivity means task completion
- **AND** buffered or newly fetched output MUST converge without duplicate session completion or stale disconnected status

#### Scenario: lifecycle diagnostics include visibility context
- **WHEN** runtime lifecycle diagnostics are emitted for a running session
- **THEN** diagnostics MUST include or be correlatable with the session visibility state at the time of the event
- **AND** troubleshooting MUST be able to distinguish visibility-driven render gating from true runtime loss

