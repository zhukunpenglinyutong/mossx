## Why

Issue #374 暴露的不是单一 `rewind` 或单一 history bug，而是一条更底层的宿主集成失稳链路：会话可能提前结束、上下文在不同 surface 上表现为“像是消失了”、失败后新建对话又触发高频 reconnect / reacquire / history reload，最终把 CPU 与风扇打满。现有 OpenSpec 已分别覆盖 `rewind` 真截断、project history scope、global history 可见性，但还没有一条 contract 明确“宿主 runtime 在异常链路下必须如何稳定失败、如何限流恢复、以及如何把证据暴露给用户和开发者”。

现在补这条变更的原因有两个：第一，现有 issue 已经说明这不是纯理论边界，而是用户可感知的稳定性故障；第二，仓库里已经具备 `runtime_log_*`、renderer diagnostics、thread session log 等基础设施，如果继续只修单点而不建立统一稳定性 contract，后续仍会反复出现“症状看似不同、根因实则同类”的回归。

## 目标与边界

### 目标

- 定义 conversation runtime 在异常链路下的稳定性 contract，覆盖提前结束、失败重试、reconnect/reacquire 抖动、processing 卡死与新会话高 CPU 风险。
- 明确用户可见诊断基线：失败后必须给出可恢复、可定位的 diagnostics，而不是只表现为“没继续”“上下文没了”。
- 规定 retry / reconnect / session reacquire 的预算、节流与终止语义，避免 host 集成层形成 storm loop。
- 复用现有 `runtime_log_*`、renderer diagnostics、thread session log 基础设施，形成最小可用的 evidence path。
- 明确责任边界：该问题优先归因于 desktop host integration / lifecycle orchestration，而不是直接归因于 Claude Code core 普遍缺陷。

### 边界

- 本提案关注宿主 runtime/session orchestration 的稳定性与可诊断性，不重做 Claude/Codex/Gemini provider 内核协议。
- 本提案不重开 `workspace-session-catalog-projection-parity` 与 `global-session-history-archive-center` 已定义的 project/global history 口径设计，只要求与这些 contract 的错误表达保持一致、可解释。
- 本提案不改变 `rewind success == truncation committed` 这一既有 contract，只补充失败态、恢复态和后续稳定性约束。
- 本提案优先覆盖本地 desktop 模式；remote mode 可先保持能力降级，但不得给出误导性成功语义。

## 非目标

- 不把本轮变更扩展成所有 engine 的 provider 重构。
- 不承诺一次性解决所有历史丢失、归属推断或 source 切换问题。
- 不新增新的持久化数据库或全局索引系统。
- 不把开发者调试工具直接产品化为完整 support 平台；本轮只要求建立“能留证据、能指导排查”的最小闭环。

## What Changes

- 新增一条 `conversation-runtime-stability` capability，定义宿主 conversation runtime 的异常退场、retry budget、backoff、stale-session quarantine、CPU-storm prevention 与 diagnostics 基线。
- 修改 `conversation-lifecycle-contract`，把“可见列表不中断”“processing 不假死”“失败后可恢复”从零散实现细节上升为统一 lifecycle requirement。
- 明确当 `workspace not connected`、session health probe 失败、reconnect 失败、rewind 后 resume 失败、history reload partial failure 等异常发生时：
  - 系统必须限制重试次数或时间窗口；
  - 必须保留最后一个可恢复的用户可见状态；
  - 必须避免因为自动恢复导致无界 reacquire / reconnect storm。
- 要求会话提前结束、resume 中断或 post-rewind follow-up 失败时，UI 必须给出结构化 recoverable diagnostic，至少说明是 runtime 结束、workspace 漂移、history partial、还是 provider/host 连接异常。
- 要求现有 runtime log、renderer lifecycle log、thread session log 可以组成同一次故障的证据包，便于人工复盘与 issue 归因。

### 本次实现切片（2026-04-20）

- Runtime 层已落地 shared recovery guard：以 `workspace + engine` 为键维护 retry budget、backoff、quarantine 与 success reset；`ensure_codex_session`、Codex 高风险入口和 workspace reconnect 已统一消费该 guard，避免各入口各自重试。
- 前端结构化诊断已收口到 shared `stabilityDiagnostics`：`connectivity_drift`、`partial_history`、`runtime_quarantined` 三类 recoverable diagnostic 已覆盖 turn error、context compaction failure、history fallback 与 reconnect card。
- Thread list / history 可见性已引入 last-good continuity：refresh 失败或 partial source 退化时优先保留最近健康 sidebar/thread summaries，并用 degraded metadata/badge 显式标记，而不是把旧状态伪装成 fresh truth。
- 证据链已复用现有 debug surface：`threadDebugCorrelation` 与 `diagnostics.threadSessionLog` 现在能把 `workspaceId / threadId / engine / action / recoveryState` 串到同一条故障链。
- 在 Codex `sendUserMessage` 前端发送路径补上一层一次性 stale-thread 自愈：当 `turn/start` 返回 `thread not found`、`[SESSION_NOT_FOUND] session file not found`，或等价的 invalid thread binding 错误时，前端先执行一次 `refreshThread(workspaceId, threadId)`，再把原消息无额外 optimistic bubble 地重发到恢复后的 thread。
- 该自愈只重试一次；若 `refreshThread` 失败或重发后仍失败，系统继续回落既有 recovery card / user-visible error surface，不引入无界 storm retry。
- 这次切片刻意不改 recovery card 的兜底语义，也不新造第二套恢复链路，而是复用现有 stale-thread refresh 结果，把“人工点恢复并发送”前移成 send path 的默认一次性自愈。
- 2026-04-20 follow-up hotfix：撤销前端 `turn/started` 后的 20 秒 no-activity hard-stop watchdog。该策略会把网络抖动、provider 长静默或事件桥临时沉默误判为终态失败；processing 的终止重新收敛到 runtime/engine 的权威 terminal event，避免前端与真实会话状态 split-brain。
- 自动化验证已覆盖 recovery guard、concurrent acquire waiter、stability diagnostics、runtime quarantine reconnect card、stale-thread resend、degraded continuity 与 debug correlation；剩余未完成项是集成本地 desktop stress 手工验收记录。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/成本 | 结论 |
|---|---|---|---|---|
| A | 继续按症状逐个修：`rewind` 修一个、history 修一个、CPU 狂转再单独 patch | 改动局部、短期见效快 | 根因分散，缺少统一 failure contract，下一次仍会在别的入口复发 | 不采用 |
| B | 直接把问题归因到 Claude Code core，尽量少碰 host runtime | 范围最小 | 与本仓库现有证据不符，且无法解释为何多数 CLI 用户不受影响、为何 GUI 集成链路才放大问题 | 不采用 |
| C | 建立宿主 conversation runtime stability contract，复用现有 diagnostics 基座，并与已有 rewind/history changes 对齐 | 责任边界清晰，可把提前结束、上下文错觉丢失、storm loop 归到同一治理模型 | 需要补 lifecycle/spec/test/diagnostics 多处契约 | **采用** |

## 验收标准

- 当 runtime/session 在用户视角下提前结束时，系统 MUST 退出 pseudo-processing 状态，并给出结构化失败或中断诊断。
- 当自动 reconnect / reacquire 连续失败时，系统 MUST 有明确的 retry budget/backoff，且 MUST NOT 造成无界 CPU storm。
- 当 conversation list、history reload 或 reopen 遇到 partial source failure 时，系统 MUST 保留最近一次可见成功状态，并明确标出 degraded/partial，而不是伪装成“完全没有上下文”。
- 当 rewind 相关后续链路失败时，系统 MUST 返回 recoverable diagnostic，并且 MUST NOT 让旧 session、child session、processing state 进入相互打架的半成功状态。
- 当用户在异常后立即新建对话时，系统 MUST 保证新的 runtime acquire 不会继承旧失败链路的无限重试状态。
- 系统 MUST 提供一条最小证据链，至少能把 runtime log、thread/session log 或 renderer diagnostics 中的关键上下文关联到同一 workspace/thread 故障。
- 该稳定性增强 MUST NOT 改变 Claude/Codex/Gemini 在正常成功路径下既有 lifecycle 语义。

## Capabilities

### New Capabilities

- `conversation-runtime-stability`: 定义宿主 conversation runtime 在异常链路下的稳定退场、重试预算、抖动抑制、recoverable diagnostics 与 evidence capture 约束。

### Modified Capabilities

- `conversation-lifecycle-contract`: 补充异常恢复、processing 终态、partial/degraded 可见性、以及 reconnect/reacquire failure 不得破坏用户可见 lifecycle continuity 的 requirement。

## Impact

- Affected backend/runtime:
  - `src-tauri/src/codex/session_runtime.rs`
  - `src-tauri/src/codex/mod.rs`
  - `src-tauri/src/shared/codex_core.rs`
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/runtime_log/mod.rs`
- Affected frontend:
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/threads/loaders/*`
  - `src/features/runtime-log/hooks/useRuntimeLogSession.ts`
  - `src/features/debug/hooks/useDebugLog.ts`
  - session/history/reconnect related reducers and surfaces
- Affected specs:
  - new `openspec/changes/harden-conversation-runtime-stability/specs/conversation-runtime-stability/spec.md`
  - delta `openspec/changes/harden-conversation-runtime-stability/specs/conversation-lifecycle-contract/spec.md`
- Validation impact:
  - runtime reconnect / reacquire regression tests
  - history partial/degraded continuity tests
  - rewind failure recovery regressions
  - manual stress verification for “fail then immediately start new conversation” scenario
