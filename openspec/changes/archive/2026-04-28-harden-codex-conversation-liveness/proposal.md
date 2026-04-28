## Why

Codex 会话保活问题已经不是单一 timeout 或 reconnect 按钮失效，而是 draft thread、真实 thread identity、managed runtime、foreground turn 四层 lifecycle 没有统一判死与替换语义。用户现在遇到的两个小概率现象都指向同一个根因：旧 conversation identity 已经不可继续，但 UI 仍尝试把 runtime reconnect 当作旧会话恢复成功。

这需要上升为 Codex conversation liveness contract：系统不承诺旧会话永远不断，但必须准确判定死亡边界、隔离污染状态、保留用户意图，并在旧 identity 不可恢复时显式切到 fresh continuation。

## 目标与边界

- 目标：定义 Codex conversation liveness 的 canonical 状态机，区分 draft、thread identity、runtime、turn 四个生命周期。
- 目标：让首轮未发送的 Codex 新会话具备 disposable draft 语义；如果旧空 thread 已失效，首条用户消息必须 fresh create + send，而不是进入旧会话恢复卡片。
- 目标：让正在进行的 Codex turn 在长时间无推进证据时进入 bounded stalled / degraded 状态，用户停止或重发后必须有确定的 terminal / continuation 结果。
- 目标：让所有恢复动作返回 classified outcome，例如 `rebound`、`fresh`、`failed`、`abandoned`，避免 runtime ready 被误判为 conversation recovered。
- 目标：明确首轮/ durable 边界的 authoritative source of truth，避免仅凭 frontend local items 把已接受过 work 的 thread 误判为 disposable draft。
- 目标：补齐可复盘证据，至少能关联 `workspaceId`、`threadId`、`runtimeGeneration`、`turnId`、liveness stage、last event 与 recovery outcome。
- 目标：把 Win/macOS runtime/process/path 兼容性写成 contract，禁止用 Unix-only signal、路径分隔符、shell quoting 或 pid-only identity 作为核心语义。
- 边界：本变更优先约束 Codex local managed runtime 与 conversation surface；不重写 Codex CLI protocol。
- 边界：不把 Claude / Gemini / OpenCode 全量迁入新状态机；共享 lifecycle 只补非矛盾原则。
- 边界：不新增第三方依赖，不引入独立数据库；优先复用 runtime ledger、debug log、thread/session diagnostics。

## 非目标

- 不承诺已被 Codex runtime 删除或无法验证的旧 `threadId` 可以原地复活。
- 不靠无限 keepalive、无限 reconnect 或单纯调大 warm TTL 来掩盖生命周期问题。
- 不在用户无感知的情况下把“恢复旧会话”偷偷替换成“新建会话继续”。
- 不扩大到 remote mode 完整 parity；remote mode 可先返回 capability-limited diagnostic。
- 不在本 change 中处理 unrelated history rendering、model selector、Computer Use 授权等问题，除非它们触发同一 liveness contract。

## What Changes

- Introduce a new `codex-conversation-liveness` capability that defines the Codex-specific lifecycle model for draft, identity, runtime, and turn liveness.
- Modify `conversation-lifecycle-contract` so Codex recovery surfaces cannot report contradictory lifecycle states across runtime reconnect, thread recovery, and fresh continuation.
- Modify `conversation-runtime-stability` so runtime readiness is explicitly separated from conversation identity readiness, and runtime generation is preserved in diagnostics.
- Modify `codex-stale-thread-binding-recovery` so unrecoverable first-turn or empty-thread cases can use explicit fresh continuation without masquerading as rebind.
- Modify `codex-stalled-recovery-contract` so long no-progress turns settle into `stalled` / `abandoned` / `fresh-continuation` outcomes instead of leaving pseudo-processing residue.
- Clarify the relationship with `codex-long-task-runtime-protection`: active work remains protected, but protection must not keep a dead turn indefinitely alive after bounded liveness timeout.
- Require accepted-turn / durable-activity classification to come from a canonical lifecycle fact, with unknown state defaulting to durable-safe recovery rather than silent draft replacement.
- Require runtime generation, process shutdown, executable path, and command spawning logic to stay cross-platform across macOS and Windows.
- Add a fault-injection verification matrix for idle-before-first-send, runtime-ended-during-turn, thread-not-found-after-reconnect, stop-after-stall, and recovery button fresh fallback.

## 技术方案对比与取舍

| 方案 | 描述 | 优点 | 风险/代价 | 结论 |
|---|---|---|---|---|
| A | 继续按症状修：调 TTL、调 timeout、增强 reconnect 按钮 | 局部改动小，短期能减少某些失败 | runtime ready 与 thread identity 仍混在一起，小概率死态还会反复出现 | 不采用 |
| B | 增加强 keepalive / heartbeat，尽量不让 Codex runtime 退出 | 能降低一部分空闲断链概率 | 消耗资源，无法修复 `thread not found`、旧 turn pseudo-processing、按钮语义错误 | 只可作为辅助，不作为主方案 |
| C | 建立 Codex conversation liveness 状态机，按 draft / identity / runtime / turn 分层判定和恢复 | 语义清晰，可测试，可诊断；能解释首轮空会话和长时间卡死两类问题 | 需要跨 frontend、runtime manager、diagnostics surface 做系统性改造 | 采用 |
| D | 每次失败都直接新建 Codex 会话重发 | 用户能继续工作 | 会丢失旧上下文且掩盖真实故障，破坏“恢复”和“继续”的语义边界 | 仅作为显式 fresh continuation fallback |

## Capabilities

### New Capabilities

- `codex-conversation-liveness`: Defines Codex-specific draft, thread identity, runtime generation, and foreground turn liveness semantics.

### Modified Capabilities

- `conversation-lifecycle-contract`: Require recovery UI and lifecycle consumers to expose non-contradictory states across reconnect, rebind, stall, abandon, and fresh continuation.
- `conversation-runtime-stability`: Separate runtime readiness from conversation identity readiness; preserve runtime generation and liveness stage in diagnostics.
- `codex-stale-thread-binding-recovery`: Extend stale identity recovery for first-turn empty threads and explicit fresh continuation outcomes.
- `codex-stalled-recovery-contract`: Extend stalled turn settlement beyond queue fusion to long-running Codex turns with no progress evidence.
- `codex-long-task-runtime-protection`: Clarify that active-work protection prevents idle eviction but does not prevent bounded dead-turn settlement.

## 验收标准

- 新建 Codex 会话后，用户未发送首轮消息前，该会话 MUST 被视为 disposable draft；若首轮发送发现旧 `threadId` 不可用，系统 MUST 自动 fresh create + send，并显示真实 active target。
- disposable draft 判定 MUST 依赖 canonical accepted-turn / durable-activity fact；如果该 fact 缺失或不确定，系统 MUST 走 durable-safe recovery，而不是静默 fresh replacement。
- 当 runtime reconnect 成功但旧 `threadId` 仍不可恢复时，UI MUST NOT 声称旧会话已恢复。
- 当 recover-and-resend 进入 fresh continuation，用户 MUST 看见上一条 prompt 在新 thread 中被发送；当 recover-only 无法 rebind，UI MUST 保守失败或提示 fresh continuation。
- 当 Codex turn 超过 bounded no-progress window 且无 terminal event、stream delta、tool event 或等效推进证据时，thread MUST 离开无限 processing，进入可恢复 stalled state。
- 用户在 stalled turn 上点击 stop 后，旧 turn MUST 结算为 `abandoned` 或等效 terminal lifecycle；下一条消息 MUST 不再被旧 in-flight state 阻塞。
- 所有 liveness failure MUST 留下可关联证据：`workspaceId`、engine、thread identity、runtime generation、turn id（若有）、stage、last event age、recovery source、outcome。
- Runtime Pool / warm TTL / active-work protection 的既有保护不能回退：真实 active work 不得被 idle eviction 中断，但死态也不能无限占用 processing。
- macOS 与 Windows 上的 runtime process identity、shutdown reason、path handling、spawn args、timeout / watchdog 语义 MUST 等价；实现不得依赖 Unix-only signal、`/` 路径拼接、shell-specific quoting 或 pid-only generation。

## Impact

- Frontend:
  - `src/features/threads/hooks/useThreadMessaging.ts`
  - `src/features/threads/hooks/useThreadActionsSessionRuntime.ts`
  - `src/features/threads/hooks/useThreadActions.ts`
  - `src/features/messages/components/RuntimeReconnectCard.tsx`
  - `src/app-shell-parts/manualThreadRecovery.ts`
  - `src/features/threads/utils/stabilityDiagnostics.ts`
- Backend:
  - `src-tauri/src/codex/session_runtime.rs`
  - `src-tauri/src/shared/codex_core.rs`
  - `src-tauri/src/runtime/mod.rs`
  - `src-tauri/src/backend/app_server_runtime_lifecycle.rs`
  - `src-tauri/src/backend/app_server_event_helpers.rs`
- Cross-platform:
  - Runtime process identity must use a monotonic generation or `pid + startedAt` style composite identity, never pid alone.
  - Paths must use Rust/Tauri path APIs (`PathBuf`, app path resolver, existing storage helpers) rather than manual separator concatenation.
  - Child process spawn / shutdown logic must use argument arrays and platform-neutral lifecycle reasons instead of shell-specific strings.
- Tests:
  - Focused Vitest coverage for first-turn draft fallback, stale identity recovery, recovery card outcome, and stalled stop/resend.
  - Rust tests for runtime generation, active-work protection, runtime-ended settlement, and stale cleanup diagnostics.
- Specs:
  - `openspec/specs/codex-conversation-liveness/spec.md`
  - `openspec/specs/conversation-lifecycle-contract/spec.md`
  - `openspec/specs/conversation-runtime-stability/spec.md`
  - `openspec/specs/codex-stale-thread-binding-recovery/spec.md`
  - `openspec/specs/codex-stalled-recovery-contract/spec.md`
  - `openspec/specs/codex-long-task-runtime-protection/spec.md`
- Dependencies:
  - No new third-party dependencies.
