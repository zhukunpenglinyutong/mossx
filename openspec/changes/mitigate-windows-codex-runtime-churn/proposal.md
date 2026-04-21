## Why

Windows 用户反馈 `ccgui` 与多个 `bun` 进程会持续占高 CPU，而 macOS 同链路已趋于正常。结合本仓 `v0.4.4 -> v0.4.5 -> 0.4.6` 的代码审查、现有 runtime spec，以及官方平台资料判断，这更像是**既有 reconnect/spawn 风险在 Windows 包装链路下被放大**，而不是单个最近 commit 的孤立回归：前端 thread-list 自动补连、backend `3s` health probe、`1.5s` live-list timeout、以及 swap-then-kill 的 session replacement，在 Windows `.cmd -> cmd.exe -> bun` 包装和 process-tree 终止语义下更容易形成重复拉起、误判 stale、再重建的 churn。

当前没有 Win 实机可直接复现，因此这次 change 的首要目标不是“宣称根因已完全证实”，而是先把**高置信保护边界、诊断证据和收敛计划**写清楚，让后续实现能在没有 Win 开发机的前提下先止住最可能的风暴入口，并为后续实机验证保留可追踪证据。

## 目标与边界

- 目标：把 `conversation-runtime-stability` 里的 bounded recovery guard 扩展到 thread list、workspace reconnect、restore、focus refresh 等自动路径，避免同一 `workspace + engine` 形成自动 reconnect/spawn 风暴。
- 目标：把 “slow startup” 与 “stale session” 明确区分，避免 Windows wrapper 启动偏慢时被过早判死。
- 目标：补足 runtime churn 证据面，让 runtime pool / diagnostics 能回答“为什么又起了一棵 bun 树、是谁触发的、替换/强杀发生了多少次”。
- 目标：在不依赖 Win 实机的前提下，优先交付可回归的 guard、single-flight 约束和 evidence contract。
- 边界：本次只聚焦 Codex managed runtime 的 Windows churn 风险，不重写整个多引擎 runtime 架构。
- 边界：不把问题简单归咎为 Bun upstream bug；即使 Bun/Windows 存在已知兼容性问题，宿主侧仍需保证不会无限重试或失控拉起。
- 边界：不在本次直接替换 Bun、禁用 Windows managed runtime，或引入新的外部 daemon。

## 非目标

- 不通过单纯全局调大 `Warm TTL` 或所有 timeout 来掩盖问题。
- 不因为缺少 Win 机器就暂停所有止血工作。
- 不重做 thread reducer、session model 或 provider 协议。
- 不承诺一次性解决所有 Windows 上游性能、crash 或 shell 兼容问题。

## What Changes

- 收紧自动恢复入口：
  - 将 thread list、workspace reconnect、restore、focus refresh 等自动路径纳入同一 recovery guard，要求对同一 `workspace + engine` 做 single-flight acquire / reconnect 去重。
  - 重复失败时进入 cooldown / quarantine，而不是继续无界 immediate retry。
- 区分启动预算与健康预算：
  - 为 Windows wrapper 启动链路引入 phase-aware 或 platform-aware budget，避免把 “启动慢” 直接当成 “stale session”。
  - thread-list live timeout 与 session health probe 不再共享同一种过于激进的失败语义。
- 增加 churn diagnostics：
  - 记录最近窗口内的 spawn / replace / force-kill 次数、触发来源、wrapper kind、last replace reason、last health-probe failure。
  - 将这些证据暴露给 runtime pool console 与现有 stability diagnostics，支持无实机条件下的远程归因。
- 先落 evidence，再收默认值：
  - 优先确保新增 guard 与 diagnostics 可测试、可观测，再决定 Windows 默认 timeout / reconnect policy 的最终收口值。

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 全局放宽 timeout / TTL | 改动最小，短期可能缓解误判 | 不能阻止多入口重复 reconnect；也会把 macOS/正常路径一起放松，掩盖真实状态机问题 | 不采用 |
| B | 仅在 UI 上补 warning/card，不动 runtime guard | 用户能看到“runtime 可能异常” | 只能善后，不能阻止 bun/ccgui 自己继续 churn | 不采用 |
| C | 增加 guarded recovery + single-flight 去重 + Windows churn diagnostics，并再按证据收口 timeout | 直接对准最可能的 storm 入口，兼顾 correctness 与后续排障 | 需要跨 frontend/runtime/diagnostics 多层改动，但范围仍可控 | 采用 |

## Capabilities

### New Capabilities

- `windows-runtime-churn-diagnostics`: 为 Windows 侧 managed runtime 定义 recent spawn/replace/force-kill 计数、wrapper lineage、replace reason 与 probe failure evidence，支持远程排障和无实机条件下的归因。

### Modified Capabilities

- `conversation-runtime-stability`: 自动 recovery guard 需要覆盖 thread list、workspace reconnect、restore、focus refresh 等自动路径，并保证失败后进入有界 cooldown/quarantine。
- `runtime-orchestrator`: 需要强化同一 `(engine, workspace)` 的 single-flight acquire / replace 语义，并区分 slow startup 与 stale-session replacement。
- `runtime-pool-console`: 需要展示 churn diagnostics、recent replace/spawn evidence、wrapper kind 与 forced-kill 计数，而不是只展示静态 runtime row。

## Impact

- Backend / runtime:
  - `src-tauri/src/codex/session_runtime.rs`
  - `src-tauri/src/shared/workspaces_core.rs`
  - `src-tauri/src/codex/thread_listing.rs`
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/backend/app_server_cli.rs`
- Frontend:
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/workspaces/hooks/useWorkspaceRestore.ts`
  - `src/features/workspaces/hooks/useWorkspaceRefreshOnFocus.ts`
  - `src/features/settings/components/settings-view/sections/RuntimePoolSection.tsx`
  - `src/features/threads/utils/stabilityDiagnostics.ts`
- Specs:
  - `openspec/specs/conversation-runtime-stability/spec.md`
  - `openspec/specs/runtime-orchestrator/spec.md`
  - `openspec/specs/runtime-pool-console/spec.md`
  - `openspec/changes/mitigate-windows-codex-runtime-churn/specs/windows-runtime-churn-diagnostics/spec.md`
- Dependencies:
  - 不新增第三方依赖；复用现有 runtime log / snapshot / diagnostics surface

## 验收标准

- 同一 `workspace + engine` 在 thread list、restore、focus refresh、显式 reconnect 同时命中时，系统 MUST 至多保留一个 in-flight acquire/reconnect，并且不得无界重复 spawn。
- 自动 recovery 连续失败后，系统 MUST 进入 cooldown / quarantine，而不是继续立即重试到 CPU 持续飙高。
- Windows wrapper 启动偏慢时，系统 MUST 不再直接用与 stale health probe 相同的失败预算做误判；slow startup 与 stale session 必须可区分。
- runtime pool / diagnostics MUST 能显示 recent spawn count、replace count、force-kill count、wrapper kind、last replace reason 与最近一次 probe failure。
- session replacement 发生时，系统 MUST 能回答替换是由哪类入口触发（例如 thread list reconnect、explicit connect、startup restore）。
- macOS 现有 recovery / runtime tests 不得回退；新增 guard 不能把正常路径变成过度保守或永久 quarantine。
- 在获得后续 Windows 实机验证前，系统至少要通过 targeted tests 和 synthetic diagnostics 证明：
  - recovery guard 有界
  - single-flight 生效
  - churn evidence 可被快照和日志读取

## 分阶段 Plan

1. Phase 1: Evidence First
   - 先补 runtime churn diagnostics 与触发来源记录，不改变默认行为语义。
2. Phase 2: Guard And Dedup
   - 对 thread list / reconnect / restore / focus refresh 加 single-flight 与 bounded recovery guard。
3. Phase 3: Startup Budget Split
   - 把 slow startup 与 stale probe 拆开，收口 Windows 侧 timeout / retry 预算。
4. Phase 4: Remote Verification And Rollout
   - 用新增 diagnostics 指导远程 Windows 验证，再决定默认值是否进一步收紧或放宽。

## Implementation Snapshot (workspace code, 2026-04-21)

已落地到工作区代码的部分：

- backend runtime guard 已经进入 `src-tauri/src/runtime/mod.rs` / `src-tauri/src/codex/session_runtime.rs` / `src-tauri/src/shared/workspaces_core.rs`
  - 已有 `leader / waiter / cooldown / quarantined` 的 acquire guard
  - explicit connect 会 reset quarantine，避免用户主动重试被 automatic storm loop 误伤
  - `ensure_codex_session` 与 `connect_workspace_core` 已接入统一 recovery 入口
- startup / stale evidence 已经开始分离
  - runtime snapshot 已暴露 `startupState`
  - `note_probe_failure()` 只会在 runtime 已 `Ready` 时升级成 `SuspectStale`
  - thread list live timeout 在 frontend 会先降级成 `startup-pending` / `automatic-recovery-cooldown` 等 partial source，而不是无脑再起一轮 reconnect
- churn diagnostics 与 runtime pool console 已有首版
  - snapshot / ledger 已包含 `wrapperKind`、`resolvedBin`、`lastRecoverySource`、`lastReplaceReason`、`lastProbeFailure`、`recentSpawnCount`、`recentReplaceCount`、`recentForceKillCount`、`hasStoppingPredecessor`
  - Runtime Pool Console 已消费这些字段并展示 replacement / probe / recent churn 证据
- frontend automatic source integration 已有首版
  - `thread-list-live`、`workspace-restore`、`focus-refresh` 已传入 recovery source
  - thread list waiter path 会保留 last-good snapshot，并用 `guarded-recovery-waiter` / `automatic-recovery-cooldown` 标注 degraded source

本轮已收口的部分：

- replacement serialization 已补齐 gate + synthetic regression，`replacement_waiter_does_not_swap_in_a_third_runtime` 直接钉住“replacement 期间不会继续拉起第三棵树”
- runtime pool console 的 UI regression 已补齐，覆盖 startup state、recent churn、recovery source、replace/probe evidence 的展示契约

仍保留的边界：

- 还没有 Windows 实机 closure；当前结论仍以 synthetic tests + diagnostics contract 为主
