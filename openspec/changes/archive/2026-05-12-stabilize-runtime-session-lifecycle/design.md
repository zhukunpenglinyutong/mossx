## Context

mossx 的 runtime/session 稳定性已经积累了多条修复线：startup orchestration、runtime termination hardening、Codex stale thread recovery、WebService reconnect refresh、conversation runtime stability。问题不在于完全没有保护，而在于保护分散在多个层：

- backend runtime pool 管进程与 workspace session。
- Codex session runtime 管 thread/start、probe、manual shutdown、stale reuse。
- daemon WebService 管远端页面重连和状态刷新。
- frontend thread actions 管 send / resume / recover / queued follow-up。
- stability diagnostics 管错误文本分类和用户可见恢复入口。

本 change 的设计目标是把这些保护收敛成一个 lifecycle contract：**同一个 `workspace + engine` 同一时刻只能有一个可解释的 runtime lifecycle truth**。外部 command contract 保持不变，内部从“局部补丁”升级为“状态机 + classified outcome + correlated diagnostics”。

## Goals / Non-Goals

**Goals:**

- 定义 runtime session lifecycle 状态、允许转移和触发源。
- 让 create / replace / stop / terminate / recover / quarantine 都通过统一 transition 记录。
- 解决 Codex create/shutdown race 和 stale thread binding recovery 的契约边界。
- 将 WebService reconnect 纳入 lifecycle source，驱动 runtime/thread snapshot refresh。
- 建立可跨 backend/frontend 关联的 diagnostics 字段。

**Non-Goals:**

- 不重构 conversation fact contract。
- 不改变 provider stream payload。
- 不新增外部用户设置。
- 不修改主 specs。
- 不在本提案中实现 Claude `acceptEdits` 或 Codex Launch Configuration。

## Lifecycle Model

### Identity 分层

系统必须区分三类 identity：

- `workspace session identity`: 用户当前 workspace + engine 的执行上下文。
- `runtime process identity`: 当前托管进程或 daemon-side runtime generation。
- `thread identity`: provider 内部 conversation/thread id。

任何恢复行为都不能把三者混为一谈：

- runtime process 可替换，不等于 thread 一定恢复。
- thread 可 fresh fallback，不等于 stale durable history 已被 recovered。
- workspace session 可 active，不等于某个旧 thread id 仍可用。

### State Machine

建议状态转移：

```text
idle
  -> acquiring
  -> active

active
  -> replacing
  -> stopping
  -> recovering
  -> ended

replacing
  -> active
  -> recovering
  -> ended

stopping
  -> ended
  -> acquiring      # explicit user retry only

recovering
  -> active
  -> quarantined
  -> ended

quarantined
  -> acquiring      # explicit user retry only
  -> ended

ended
  -> acquiring      # new user action only
```

### Transition Sources

每次 transition 至少记录 source：

- `startup`
- `send`
- `resume`
- `queued-followup`
- `manual-stop`
- `manual-reconnect`
- `replacement`
- `idle-eviction`
- `stale-reuse-cleanup`
- `web-service-reconnected`
- `app-shutdown`
- `health-probe`

## Decisions

### Decision 1: 保持外部 command contract 不变，内部统一 transition

**Decision**

现有 `replace_workspace_session`、`stop_workspace_session`、`terminate_workspace_session`、`terminate_workspace_session_process`、`stop_workspace_session_with_source` 等入口保留名称和外部语义，内部统一委托 lifecycle coordinator。

**Why**

这样能降低 blast radius。用户侧和 frontend service 不需要同时迁移，后端可以先获得统一状态与 diagnostics。

**Alternative considered**

直接重命名和改造 command contract：长期更干净，但会扩大跨层回归面，不适合稳定性冲刺。

### Decision 2: Runtime generation 必须参与 late event 过滤

**Decision**

runtime replacement 后，旧 runtime 的 completion、end、stdout EOF、diagnostics 只能影响旧 generation，不得污染新 active session。

**Why**

当前“旧 runtime 晚到事件污染新 session”是 create/shutdown race 的核心形态之一。没有 generation boundary，任何状态机都会被 late event 击穿。

### Decision 3: 自动恢复最多 retry 一次，manual retry 开启 fresh recovery cycle

**Decision**

stale thread send/resume、runtime-ended、broken pipe 等 recoverable failure 可以自动恢复并 retry 一次。automatic recovery 进入 quarantine 后，用户显式 retry/reconnect 必须开启 fresh recovery cycle，而不是继承旧 backoff。

**Why**

自动恢复要提升体验，但不能形成 recovery storm。manual retry 是明确用户意图，应该允许重新尝试，但仍受 bounded guard 约束。

### Decision 4: Durable activity 优先于静默 rebind

**Decision**

只要 stale thread 有 accepted user turn、assistant response、tool activity、approval、generated image 或其他 durable local activity，系统不得静默把它替换成 fresh thread。必须优先 verified rebind 或显式 fresh continuation。

**Why**

恢复错会话比恢复失败更严重。durable activity 是用户信任边界，不能用启发式猜测覆盖。

### Decision 5: WebService reconnect 是 lifecycle source，不是单纯刷新按钮

**Decision**

WebService reconnect 后必须触发 workspace runtime snapshot、active thread state、frontend binding reconcile，并记录 `recoverySource=web-service-reconnected`。

**Why**

远端页面断线重连后，runtime panel、thread list、active thread 如果不统一刷新，会产生“后端已恢复，前端还卡着”的假死感。

## Diagnostics Contract

### Reason Code

建议第一阶段 reasonCode 至少覆盖：

- `runtime-ended`
- `manual-shutdown`
- `stopping-runtime-race`
- `stale-thread-binding`
- `thread-not-found`
- `session-not-found`
- `broken-pipe`
- `probe-failed`
- `replacement-late-event`
- `recovery-quarantined`
- `web-service-reconnected`
- `unknown-runtime-loss`

### Recovery Source

建议第一阶段 recoverySource 至少覆盖：

- `automatic-send-retry`
- `automatic-resume-retry`
- `manual-reconnect`
- `manual-recover-only`
- `manual-recover-and-resend`
- `startup-refresh`
- `web-service-reconnected`
- `thread-list-refresh`

### User Action

用户可见 diagnostic 应给出可执行动作：

- `wait`
- `retry`
- `reconnect`
- `recover-thread`
- `start-fresh-thread`
- `open-runtime-console`
- `dismiss`

## Data Flow

```text
runtime event / provider error
  -> classify reasonCode
  -> lifecycle transition
  -> bounded recovery guard
  -> optional rebind / retry
  -> diagnostics emission
  -> frontend stabilityDiagnostics
  -> inline notice / toast / status panel
```

## Testing Strategy

### Rust targeted tests

- lifecycle transition table。
- create while stopping。
- manual shutdown stale reuse rejection。
- stale probe failure classification。
- replacement late event ignored by current generation。
- WebService reconnect refresh event maps to lifecycle source。

### Frontend targeted tests

- stale thread send 自动恢复最多 retry 一次。
- durable local activity 不被静默 fresh fallback 覆盖。
- recover-only / recover-and-resend 区分 `rebound / fresh / failed`。
- recoverable create-session failure 显示 reconnect-and-retry action。
- WebService reconnect 后 thread list / active thread / runtime panel refresh。
- diagnostics 文案和 `userAction` 匹配。

### Manual Matrix

- 新建 Codex 会话。
- 停止后立即重开。
- runtime 结束后发送。
- stale thread reopen 后发送。
- WebService 页面断线重连。
- manual reconnect after quarantine。
- replacement 期间旧 runtime late event。

## Risks / Trade-offs

- 统一状态机可能暴露旧补丁之间的不一致，需要分阶段接入。
- diagnostics 字段过细会增加实现成本，但缺字段会让排障继续靠 raw text。
- 自动恢复提升体验，但误判会引发错绑风险，所以必须 conservative。
- WebService reconnect refresh 增加后台请求量，需要幂等和去重。

## Rollout Plan

1. 先定义 lifecycle state / transition / reasonCode 类型与 focused tests。
2. 后端内部 coordinator 接管 create / replace / stop / terminate / recover。
3. Codex create/shutdown race 与 stale binding 接入 classified outcome。
4. frontend recovery helper 消费 classified diagnostics，限制 retry 次数。
5. WebService reconnect 接入 snapshot refresh。
6. status panel / toast / inline notice 展示最小用户可见状态。

## Rollback

- 保留现有 Tauri command 和 payload，必要时可以回退 coordinator 内部实现。
- 自动 rebind / retry 可通过 gate 降级为只展示恢复入口。
- `reasonCode` additive，回滚时可继续走旧 raw error fallback。
- WebService reconnect refresh 可单独关闭，不影响桌面本地 runtime。
