## Why

当前客户端稳定性问题表面上是“偶发没反应、恢复失败、重连后状态不对”，本质是 runtime session lifecycle 没有形成单一、可验证、可观测的状态机。

近期修复和 active 任务已经暴露出同一类系统债：

- `fix(web-service): 补偿重连后的线程状态刷新`
- `fix(runtime): 隔离 Codex 控制面并过滤 Claude 历史污染`
- `fix(codex): 联动计划模式入口`
- `feat(startup): 接入客户端启动编排`
- `fix-stale-thread-binding-recovery`
- `fix-codex-session-create-shutdown-race`
- `split-runtime-session-lifecycle`
- `split-thread-actions-session-runtime`

这些不是孤立 bug，而是同一条链路的不同断点：

```text
workspace selected
  -> runtime acquire/create
  -> session bind thread
  -> send/resume/reconnect
  -> shutdown/replace/terminate
  -> recover stale binding
  -> refresh frontend thread/runtime state
```

现在这条链路分散在 Rust runtime、Codex session runtime、daemon WebService、frontend thread actions、queued send、stability diagnostics 里。每个点都在局部补救，但缺少统一生命周期契约。

> 🛠 **深度推演**：L2 根因是 `thread identity`、`runtime process identity`、`workspace session identity` 三者没有稳定分层。L3 原则是：AI 客户端里的 session 不是普通 request，它是长生命周期 actor；actor lifecycle 必须显式建模，否则 reconnect / resume / shutdown 都会退化成竞态补丁。

## 目标与边界

### 目标

- 建立 workspace runtime session 的明确 lifecycle 状态：`idle / acquiring / active / replacing / stopping / recovering / quarantined / ended`。
- 统一 Codex / Claude / daemon WebService 对 stale、shutdown race、manual shutdown、reconnect 的判断语义。
- 避免同一 `workspace + engine` 下重复创建 runtime、错误复用 stale runtime、或 UI 绑定到已经失效的 thread。
- 让用户在异常时看到可解释状态：恢复中、已断开、需要重连、会话已结束，而不是“发送没反应”。
- 将现有 runtime lifecycle helper 从“函数散点”收敛为可测试的 lifecycle coordinator。
- 建立跨前后端可关联的 `reasonCode / recoverySource / retryable / userAction` diagnostics 字段。

### 边界

- 不重写 conversation message contract。
- 不改变现有 Tauri command 名称、参数、返回值。
- 不引入新的持久化模型，除非用于记录最小恢复元数据。
- 不把 Claude `acceptEdits` 或 Codex Launch Configuration 混入本提案。
- 不把 UI 大改作为第一阶段目标，只补必要的状态展示和恢复反馈。
- 不修改 OpenSpec 主 specs；本 change 只提供 delta specs。

## What Changes

### 0. Current Implementation Status - 2026-05-12 Final Review

本 change 的 tasks 已完成 `24/24`。当前实现不再停留在初始 foundation checkpoint，而是完成了本提案约定的 runtime lifecycle coordinator、Codex create/shutdown race、stale thread recovery、WebService reconnect refresh 与用户可行动 diagnostics 的最小闭环。

已落地范围：

- `RuntimeLifecycleCoordinator` facade 已收敛 acquire、active、stop、recover、quarantine probe 等 lifecycle truth 写入；外部 Tauri command 名称、参数、返回值保持兼容。
- `RuntimePoolRow` additive 暴露 `lifecycleState / reasonCode / recoverySource / retryable / userAction`，并保留既有 `state` contract。
- runtime generation guard 已阻止 predecessor late end event 污染 successor row。
- Codex `thread/start` create/shutdown race 在主路径与 hook-safe fallback 上都先走 bounded retry 和 quarantine probe，避免自动重试风暴。
- frontend stale recovery 已统一 `thread-not-found / session-not-found / broken-pipe / runtime-ended / recovery-quarantined / stopping-runtime-race` 分类，并输出稳定 `reasonCode / staleReason / retryable / userAction / recommendedOutcome`。
- recover-only 与 recover-and-resend 已形成 `rebound / fresh / failed` outcome；recover-only 默认禁止 fresh fallback，只有 recover-and-resend 显式允许 fresh continuation。
- WebService reconnect 会记录 `recoverySource=web-service-reconnected`，并触发 active workspace thread/runtime refresh。
- Composer 仅消费 runtime lifecycle projection 解释 send readiness，不拥有 runtime recovery policy。

归档前注意事项：

- 大文件治理 hard gate 已通过；`src-tauri/src/runtime/mod.rs` 仍处于 near-threshold watch，但不是 hard-debt。若后续继续拆分，应围绕 coordinator/process termination 模块边界谨慎切分，避免机械拆文件。
- 本 change 不修改 OpenSpec 主 specs；主 specs 同步应在归档流程中基于本 change 的 delta specs 执行。

### 1. Runtime lifecycle coordinator 收敛

将分散 lifecycle 行为收敛到统一 coordinator，保留现有外部 helper / command contract，但内部统一走状态转移。

建议统一操作语义：

```text
acquire(workspace, engine, source)
replace(workspace, engine, reason)
stop(workspace, engine, source)
terminate(workspace, engine, source)
recover(workspace, engine, stale_thread)
quarantine(workspace, engine, reason)
```

核心状态：

| State | 含义 | 用户感知 |
|---|---|---|
| `idle` | 当前无 active runtime | 可启动 |
| `acquiring` | 正在创建或获取 runtime | 正在连接 |
| `active` | runtime 可用于 foreground work | 可发送 |
| `replacing` | 旧 runtime 正被替换 | 正在切换 |
| `stopping` | stop / terminate 已开始 | 正在停止 |
| `recovering` | stale / reconnect 恢复中 | 正在恢复 |
| `quarantined` | automatic recovery 已暂停 | 需要手动重连 |
| `ended` | runtime 已终止且不可复用 | 会话已结束 |

### 2. Codex create/shutdown race 专项修复

Codex create 期间遇到 manual shutdown、runtime ended、stale probe、replacement late event 时，必须进入分类恢复路径，而不是返回普通失败或错误复用旧 runtime。

关键语义：

- create 期间遇到 shutdown，不应产生重复 active runtime。
- manual shutdown 后短时间 reuse，应被拒绝并返回稳定恢复错误。
- `probe failed`、`already stopping`、`runtime ended` 必须是不同 diagnostics。
- replacement 不能污染新 session 的 active work signal。
- `[RUNTIME_ENDED]`、`manual_shutdown`、`stale-reuse-cleanup` 等错误需要可分类。

### 3. Stale thread binding recovery 收敛

将 stale thread 的恢复策略显式化：

```text
send/resume 失败
  -> classify error
  -> decide recoverability
  -> locate replacement candidate
  -> preserve durable local activity
  -> rebind active thread if safe
  -> show recovery notice
  -> retry at most once
```

关键边界：

- 有 durable local activity 的 thread 不允许静默替换。
- `thread-not-found` / `session not found` 可以自动尝试一次恢复。
- `broken pipe` / `runtime-ended` 应进入 reconnect/recover path。
- 恢复失败时保留原 thread 可见，不直接丢历史。
- fresh fallback 不得伪装成 verified rebind。

### 4. WebService reconnect refresh 纳入 lifecycle

WebService reconnect 不是普通 UI refresh，它是 lifecycle source。

```text
web-service-reconnected
  -> refresh workspace runtime snapshot
  -> refresh active thread state
  -> reconcile stale frontend binding
  -> emit diagnosable recovery source
```

目标是让 WebService 页面断线重连后，thread list、active thread、runtime panel 三者自动收敛到同一真值。

### 5. Diagnostics 统一

统一 runtime/session/thread-facing diagnostics 字段：

```text
engine
workspaceId
threadId
runtimeState
transition
reasonCode
recoverySource
staleReason
shutdownSource
retryable
userAction
```

这些字段应能贯穿 runtime diagnostics、global runtime notice dock、status panel、runtime console、thread recovery toast / inline notice。

## Capabilities

### New Capabilities

- `runtime-session-lifecycle-stability`: 定义统一 runtime session lifecycle 状态机、状态转移、WebService reconnect refresh 与 diagnostics 关联要求。

### Modified Capabilities

- `codex-stale-thread-binding-recovery`: 收敛 Codex create/shutdown race、stale thread binding recovery、fresh fallback 与 classified outcome。

## 验收标准

- Codex session create 期间遇到 shutdown race，不产生重复 active runtime。
- stale Codex thread 发送失败时，最多自动恢复并重试一次。
- manual shutdown 后旧 session 不会被 probe 成功后继续复用。
- runtime replacement 后，旧 runtime 的 completion / end event 不污染新 session。
- WebService reconnect 后，active workspace / thread 状态自动刷新。
- runtime 退出、恢复、隔离、重建都有明确用户可见状态。
- 有本地 durable activity 的 stale thread 不被静默替换。
- diagnostics 至少包含 `workspaceId / engine / threadId / reasonCode / recoverySource / retryable / userAction` 中可用字段。

## Impact

### Backend

- `src-tauri/src/runtime/mod.rs`
- `src-tauri/src/runtime/session_lifecycle.rs`
- `src-tauri/src/runtime/pool_types.rs`
- `src-tauri/src/runtime/process_diagnostics.rs`
- `src-tauri/src/codex/session_runtime.rs`
- `src-tauri/src/codex/mod.rs`
- `src-tauri/src/backend/app_server.rs`
- `src-tauri/src/backend/app_server_runtime_lifecycle.rs`
- `src-tauri/src/bin/cc_gui_daemon/daemon_state.rs`
- `src-tauri/src/bin/cc_gui_daemon/web_service_runtime.rs`

### Frontend

- `src/features/threads/hooks/useThreadActions.ts`
- `src/features/threads/hooks/useThreadActionsSessionRuntime.ts`
- `src/features/threads/hooks/useThreadActions.helpers.ts`
- `src/features/threads/hooks/useThreadMessaging.ts`
- `src/features/threads/hooks/useQueuedSend.ts`
- `src/features/threads/utils/stabilityDiagnostics.ts`
- `src/features/threads/utils/threadStorage.ts`
- `src/services/tauri.ts`

### User Impact

- 用户少遇到假死、发不出去、恢复错会话。
- WebService 重连后不需要手动切 workspace 才刷新状态。
- 出错时能看到“正在恢复 / 需要重连 / 会话已结束”等可行动状态。

## 风险与回滚

### 风险

- 生命周期状态收敛后，旧局部补丁可能和新状态机重复触发恢复。
- 错误分类过宽，可能把不可恢复错误误判为可恢复，导致多一次无意义 retry。
- thread replacement 策略如果不保守，可能错误切换用户正在看的历史。
- backend replacement 和 frontend rebind 如果不同步，可能出现 runtime 已恢复但 UI 仍显示旧 thread。
- WebService reconnect 自动刷新如果没有幂等控制，可能造成重复 list / resume。

### 回滚

- 第一阶段保持所有 Tauri command 和 payload 不变，回滚可以只撤内部 coordinator 和 frontend recovery path。
- 自动恢复能力加 feature flag 或 runtime setting gate，异常时可退回“只提示、不自动 rebind”。
- retry 限制为一次，避免恢复风暴。
- stale replacement 只在高置信度候选存在时执行；低置信度进入用户确认或新建会话。
- 保留现有 `stabilityDiagnostics` 分类作为 fallback，不删除原有错误显示路径。
