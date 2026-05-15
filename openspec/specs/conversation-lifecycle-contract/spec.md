# conversation-lifecycle-contract Specification

## Purpose

Define a unified conversation lifecycle contract across Claude, Codex, and OpenCode, so delete/recovery/order behavior is restart-verifiable and engine-consistent.
## Requirements
### Requirement: Unified Cross-Engine Conversation Lifecycle Contract
The system MUST define consistent lifecycle semantics (delete, recent ordering, restart visibility, key tool card recoverability, runtime mode input handling, and approval continuity) across Claude, Codex, and OpenCode.

#### Scenario: lifecycle contract applies to all engines
- **WHEN** the system executes lifecycle-related conversation operations
- **THEN** semantics MUST remain consistent across all three engines
- **AND** engine-specific differences MUST stay inside internal adapter layers

#### Scenario: key tool card lifecycle parity across engines
- **WHEN** `commandExecution` or `fileChange` cards are produced in any engine session
- **THEN** lifecycle semantics for visibility and recovery MUST be equivalent across engines
- **AND** engine adapter differences MUST NOT leak to user-visible card continuity

#### Scenario: restart replay preserves key tool card continuity
- **WHEN** user restarts the app and reopens the same conversation
- **THEN** previously visible `commandExecution` and `fileChange` cards MUST be replayed from persisted history
- **AND** replayed card semantics MUST match pre-restart behavior

#### Scenario: runtime mode selection stays user-visible and effective
- **WHEN** user selects an engine mode that is exposed as available in conversation UI
- **THEN** that mode MUST remain a real runtime input for the target engine
- **AND** product-layer initialization MUST NOT silently override it before send

### Requirement: Delete Semantics Must Be Restart-Verifiable

The system MUST keep user-visible delete results consistent with restart-visible state.

#### Scenario: delete result is restart-verifiable

- **WHEN** user deletes a conversation and receives a success result
- **THEN** current list MUST remove the target conversation
- **AND** after app restart the deleted conversation MUST NOT reappear

#### Scenario: stale deletion cannot be restored by later fallback reload

- **WHEN** a user deletes a conversation and the frontend locally removes it as settled
- **AND** a later fallback reload or stale cache response arrives
- **THEN** lifecycle consumers SHALL keep the deleted conversation suppressed
- **AND** the deleted entry SHALL NOT be restored solely because the fallback source still contains an old projection

#### Scenario: empty session list fallback keeps valid local continuity

- **WHEN** a thread list reload returns an empty or degraded result while local state still has valid active conversations
- **THEN** lifecycle consumers SHALL avoid destructive replacement unless the empty result is authoritative
- **AND** the UI SHALL NOT drop recoverable local conversation entries solely due to a transient empty list

#### Scenario: missing-session delete remains idempotent across single and bulk paths

- **WHEN** single delete or bulk delete observes that the target session no longer exists
- **THEN** the result SHALL be treated as settled success for that target
- **AND** real IO, permission, or ambiguous identity failures SHALL remain visible

### Requirement: Recent Ordering Signals Must Be Reconstructable

The system MUST rely on reconstructable ordering signals for recent conversations rather than process-local caches only.

#### Scenario: ordering remains stable after restart

- **WHEN** the application restarts and reloads recent conversations
- **THEN** ordering MUST match the same deterministic sort rules
- **AND** ordering MUST NOT depend solely on single-process in-memory state

### Requirement: File Reference Click Safety Contract

会话消息中的文件引用点击链路 MUST 满足“可恢复失败”原则，不得导致应用崩溃。

#### Scenario: valid file reference click opens detail flow without interruption

- **WHEN** 用户点击会话消息中的有效文件引用
- **THEN** 系统 MUST 打开文件详情弹窗或等效详情流程
- **AND** 当前会话生命周期状态 MUST 保持连续（不重置、不退出）

#### Scenario: malformed file reference click does not crash app

- **WHEN** 用户点击缺少必要字段的文件引用
- **THEN** 系统 MUST 显示可恢复提示并拒绝执行危险跳转
- **AND** 应用进程 MUST 保持存活且可继续交互

#### Scenario: click handler exception is contained

- **WHEN** 文件引用点击处理链路发生运行时异常
- **THEN** 异常 MUST 被边界捕获并记录
- **AND** 用户界面 MUST 回退到可继续操作状态

### Requirement: Codex History Reopen Must Recover Structured Activity Facts

当 `Codex` 历史会话重新打开时，系统 MUST 从可恢复事实源重建关键结构化活动，不得仅因 `resumeThread` 快照稀疏而丢失已展示内容。

#### Scenario: sparse resume snapshot still recovers key activity

- **WHEN** `Codex` 历史会话的 `resumeThread` 结果只包含消息正文或缺少结构化活动项
- **THEN** 系统 MUST 使用可恢复的历史事实源补建 `reasoning`、`commandExecution`、`fileChange`
- **AND** 用户重新打开同一会话时 MUST 继续看到这些活动事实

#### Scenario: history fallback stays inside codex adapter boundary

- **WHEN** 系统为 `Codex` 启用历史 fallback
- **THEN** 该补偿逻辑 MUST 保持在 Codex adapter / history loader 边界内
- **AND** `Claude` 与 `OpenCode` 的生命周期行为 MUST 保持不变

### Requirement: Codex History Replay Restores Collaboration Parent-Child Links

`Codex` 历史回放 MUST 恢复可用于线程拓扑构建的协作父子关系，保证 reopen 后生命周期语义与实时阶段连续。

#### Scenario: replay reconstructs parent-child relation from collaboration tool facts

- **WHEN** `Codex` 本地历史包含协作调用（例如创建子会话或向子会话发送指令）
- **THEN** 历史回放 MUST 产出可恢复 parent-child 的结构化事实
- **AND** reopen 后线程关系 MUST 支持 root-subtree 聚合，不得丢失已建立 child links

#### Scenario: unified history loader applies reconstructed links before lifecycle consumers read state

- **WHEN** unified history loader 完成 `Codex` 会话 items 恢复
- **THEN** 系统 MUST 在生命周期消费者读取状态前完成 thread links 回填
- **AND** `session activity`、会话列表与其他读取方 MUST 看到一致的线程关系

#### Scenario: codex-specific link restoration does not regress other engines

- **WHEN** 当前引擎为 `Claude` 或 `OpenCode`
- **THEN** 本恢复策略 MUST NOT 改变其既有生命周期行为
- **AND** 既有跨引擎一致性约束 MUST 继续成立

### Requirement: Realtime Optimization Must Preserve Lifecycle Semantics

Any client-side realtime CPU optimization MUST preserve conversation lifecycle semantics and terminal outcomes.

#### Scenario: optimized and baseline paths converge to same lifecycle outcome
- **WHEN** the same ordered event stream is replayed through baseline and optimized paths
- **THEN** both paths MUST converge to the same lifecycle state transitions and terminal state
- **AND** user-visible message continuity MUST remain equivalent

#### Scenario: batching does not leave pseudo-processing residue
- **WHEN** a turn reaches completed or error terminal state under optimized processing
- **THEN** lifecycle state MUST leave processing mode deterministically
- **AND** the thread MUST NOT remain in stuck pseudo-processing state

#### Scenario: duplicate codex assistant aliases converge before terminal settlement
- **WHEN** a Codex realtime turn observes equivalent assistant content through multiple event aliases or fallback ids
- **THEN** lifecycle consumers MUST converge those observations into one completed assistant message
- **AND** terminal settlement MUST NOT leave duplicate assistant bubbles in the conversation state

#### Scenario: claude completed snapshot replay converges with streamed prefix before terminal settlement
- **WHEN** 当前引擎为 `Claude`
- **AND** live assistant message 已经在 processing 中显示过可读正文前缀
- **AND** terminal completed payload 又以 `streamed prefix + full final snapshot` 形式回放同一条 assistant 内容
- **THEN** 生命周期消费者 MUST 在 terminal settlement 前将该 replay 收敛为一条 completed assistant message
- **AND** conversation state MUST NOT 留下重复的 Markdown report、大段列表或等价主体正文块

#### Scenario: completed replay collapse does not require history reconcile changes
- **WHEN** 系统为 `Claude` 处理 completed replay collapse
- **THEN** 该收敛逻辑 MUST 保持在 completed text merge / lifecycle settlement 边界内
- **AND** 系统 MUST NOT 依赖停用、延后或改写 `Claude` history reconcile 才保持单条 assistant bubble 收敛

### Requirement: Foreground Turn MUST Exit Pseudo-Processing When Recovery Progress Stalls

在统一会话生命周期契约下，queue fusion 发起的 continuation 与被策略阻断的 `requestUserInput` 恢复链若未真正接续成功，也 MUST 以有界、可恢复的方式离开 pseudo-processing。

#### Scenario: missing continuation evidence after fusion still settles lifecycle

- **WHEN** 前端已为当前线程发起 fusion continuation
- **AND** 生命周期在受限窗口内没有收到新的 continuation 证据或终态事件
- **THEN** 当前线程 MUST 结算为 recoverable degraded / stalled
- **AND** 线程 MUST 重新进入可交互状态

#### Scenario: request-user-input blocked event settles lifecycle without continuation evidence

- **WHEN** 当前前景 turn 收到针对 `item/tool/requestUserInput` 的 `collaboration/modeBlocked`
- **AND** 生命周期尚未观察到新的 successor turn、stream delta、tool execution 或等效继续证据
- **THEN** 当前线程 MUST 退出普通 processing
- **AND** 与该 turn 绑定的 active-turn marker MUST 被清理
- **AND** 用户 MUST 重新获得可交互线程状态

#### Scenario: late terminal settlement clears pending fusion continuation

- **WHEN** 一条处于待确认状态的 fusion continuation 或 blocked user-input resume chain 后续收到了 completed、error、runtime-ended 或 recoverable abort
- **THEN** 生命周期 MUST 清理对应的待确认 continuation 或 blocked residue
- **AND** 线程 MUST 不再残留伪 processing 或假继续生成文案

### Requirement: Cross-Surface Lifecycle State MUST Remain Non-Contradictory

生命周期展示面之间 MUST 避免对同一条 fusion stalled chain 或 request-user-input blocked chain 给出互相矛盾的主状态结论。

#### Scenario: fusion stalled thread cannot coexist with unexplained busy continuation copy

- **WHEN** 当前线程的 fusion continuation 仍处于待确认或 stalled 状态
- **THEN** 用户可见文案 MUST 表达“正在切换 / 等待接续 / 已停滞”等待确认语义
- **AND** 系统 MUST NOT 在无 continuation 证据时直接宣称“内容正在继续生成”

#### Scenario: request-user-input blocked thread cannot coexist with ordinary processing curtain

- **WHEN** 当前线程已经被共享生命周期判定为 `requestUserInput` 型 blocked settlement
- **THEN** 用户可见主状态 MUST 表达 blocked / waiting for mode change / user-input unavailable 的解释性语义
- **AND** 系统 MUST NOT 在无新进展证据时同时展示普通生成中或不可点击的 processing 幕布

### Requirement: Cross-Engine Lifecycle Parity Under Optimization

Realtime optimization MUST NOT introduce engine-specific lifecycle regressions for Codex, Claude, or OpenCode.

#### Scenario: optimization keeps lifecycle parity across engines
- **WHEN** equivalent lifecycle events are processed for Codex, Claude, and OpenCode threads
- **THEN** lifecycle semantics MUST remain consistent with existing engine contracts
- **AND** optimization internals MUST NOT leak engine-specific behavior to users

#### Scenario: rollback path keeps lifecycle contract intact
- **WHEN** optimization modules are partially or fully disabled for rollback
- **THEN** lifecycle handling MUST still satisfy existing conversation lifecycle requirements
- **AND** restart/replay lifecycle continuity MUST remain valid

### Requirement: Claude Prompt-Overflow Recovery Preserves Lifecycle Continuity

Within the unified conversation lifecycle contract, Claude prompt-overflow auto recovery MUST preserve thread/session continuity and produce deterministic terminal outcomes.

#### Scenario: recovery runs in the same claude thread lifecycle
- **WHEN** Claude turn hits prompt overflow and runtime triggers compact-retry
- **THEN** recovery flow SHALL stay bound to the same Claude thread/session lineage
- **AND** user-visible lifecycle progression SHALL remain a single continuous turn flow

#### Scenario: terminal error remains deterministic after recovery attempt
- **WHEN** one-shot compact-retry cannot recover the turn
- **THEN** runtime SHALL emit one deterministic terminal error outcome
- **AND** lifecycle state SHALL NOT remain stuck in pseudo-processing state

### Requirement: Claude Compaction Lifecycle Events Integrate Into Existing Conversation Event Stream

Claude compaction lifecycle MUST be represented in the existing conversation event stream so current frontend lifecycle handlers can consume them directly.

#### Scenario: compacting signal routes through existing lifecycle handlers
- **WHEN** runtime maps Claude compacting signal
- **THEN** the event SHALL be emitted as `thread/compacting`
- **AND** existing thread lifecycle handlers SHALL process it without engine-specific branching in UI surface

#### Scenario: compact boundary signal routes through existing compacted path
- **WHEN** runtime maps Claude compact boundary signal
- **THEN** the event SHALL be emitted as `thread/compacted`
- **AND** existing compacted message append/dedupe logic SHALL continue to apply

### Requirement: Cross-Engine Lifecycle Contract Remains Intact

Adding Claude compact-retry lifecycle semantics MUST NOT regress existing lifecycle behavior for Codex, OpenCode, and Gemini.

#### Scenario: non-claude lifecycle remains unchanged
- **WHEN** runtime handles turns from non-Claude engines
- **THEN** Claude-specific compact-retry and signal mapping SHALL NOT run
- **AND** existing lifecycle contracts for those engines SHALL remain unchanged

### Requirement: Codex Config Reload MUST Preserve Conversation Visibility Continuity
Within conversation lifecycle contract, Codex config reload MUST preserve thread visibility and historical reopen entry points.

#### Scenario: thread list remains visible after successful reload
- **WHEN** user reloads Codex config successfully during active workspace session
- **THEN** existing thread list MUST remain visible to lifecycle consumers
- **AND** system MUST NOT reset conversation visibility to empty state solely due to reload

#### Scenario: historical reopen remains continuous after reload
- **WHEN** user performs external config change and completes client-side reload, then reopens existing Codex thread
- **THEN** historical messages MUST remain recoverable via same reopen flow
- **AND** lifecycle identity continuity MUST remain consistent with pre-reload state

### Requirement: Codex Lifecycle View MUST Be Cross-Source Unified By Default
For a workspace, Codex lifecycle history view MUST present a unified cross-source list by default rather than source-isolated partitions.

#### Scenario: default history list includes sessions from multiple sources
- **WHEN** workspace has Codex sessions created under multiple sources/providers
- **THEN** lifecycle history list MUST include entries across those sources in one unified timeline
- **AND** user MUST NOT need source switch just to make previously existing history visible

#### Scenario: unified list keeps source identity metadata
- **WHEN** lifecycle consumers read unified history entries
- **THEN** each entry MUST preserve source/provider metadata for identification
- **AND** metadata presence MUST NOT change reopen semantics

### Requirement: Codex History Reopen MUST Remain Stable Across Source Context Changes
Changing source context and reloading config MUST NOT break reopen behavior for already visible history entries.

#### Scenario: reopen historical thread after source change and reload
- **WHEN** user switches source externally, triggers client reload, and reopens an older history entry
- **THEN** system MUST recover historical messages for that entry
- **AND** system MUST NOT report false not-found solely due to current active source mismatch

### Requirement: Codex Config Reload MUST Keep Cross-Engine Lifecycle Parity
Adding Codex config reload and unified history capability MUST NOT regress lifecycle semantics of Claude and Gemini.

#### Scenario: claude lifecycle behavior remains unchanged
- **WHEN** Claude sessions continue after Codex reload/unified-history capability is introduced
- **THEN** Claude lifecycle semantics for reopen, ordering, and continuity MUST remain unchanged
- **AND** Codex-specific logic MUST stay isolated from Claude adapter path

#### Scenario: gemini lifecycle behavior remains unchanged
- **WHEN** Gemini sessions continue after Codex reload/unified-history capability is introduced
- **THEN** Gemini lifecycle semantics for reopen and visibility MUST remain unchanged
- **AND** Codex-specific logic MUST stay isolated from Gemini adapter path

### Requirement: Codex Thread Listing MUST Recover From Workspace Connectivity Drift
During conversation list lifecycle, transient `workspace not connected` and equivalent workspace-connectivity failures MUST be recoverable without dropping visible history continuity or triggering an unbounded recovery storm.

#### Scenario: thread list retries once after workspace reconnect
- **WHEN** Codex `thread/list` fails with `workspace not connected`
- **THEN** client MUST trigger workspace reconnect before surfacing failure
- **AND** client MUST retry the same list request once after reconnect succeeds

#### Scenario: reconnect failure keeps existing list state recoverable
- **WHEN** reconnect attempt still fails
- **THEN** system MUST keep previously loaded thread list state available to user
- **AND** lifecycle flow MUST remain interactive without forcing full session reset

#### Scenario: repeated list recovery failure does not create reconnect storm
- **WHEN** the same workspace repeatedly fails `thread/list` recovery within one bounded recovery window
- **THEN** the system MUST stop unbounded immediate reconnect retries after the configured recovery budget is exhausted
- **AND** the list surface MUST transition to a degraded recoverable state instead of continuing an automatic storm loop

### Requirement: Archive Visibility Semantics Must Be Restart-Verifiable

Within the unified conversation lifecycle contract, archive visibility MUST be a restart-verifiable user-visible fact rather than a process-local filter accident.

#### Scenario: archived conversation disappears from default main list after success

- **WHEN** user archives a conversation and receives success
- **THEN** the current default main conversation surfaces MUST remove that conversation
- **AND** removal MUST be observable without requiring a full app restart

#### Scenario: archived conversation stays hidden after app restart

- **WHEN** user restarts the app after a conversation has been archived
- **THEN** the archived conversation MUST remain hidden from default main conversation surfaces
- **AND** the system MUST NOT reintroduce it solely because history is rebuilt from local files or live thread queries

#### Scenario: unarchived conversation becomes visible again

- **WHEN** user successfully unarchives a conversation
- **THEN** the conversation MUST re-enter the default visible conversation set
- **AND** subsequent list rebuilds MUST treat it as active again

### Requirement: Archive Semantics Must Stay Consistent Across Main Conversation Surfaces

The system MUST apply archive visibility semantics consistently across all default main conversation surfaces.

#### Scenario: sidebar home and topbar agree on archived invisibility

- **WHEN** a conversation is archived
- **THEN** sidebar thread list, workspace home recent conversations, and topbar session-tab recovery set MUST all treat it as hidden by default
- **AND** the user MUST NOT observe one surface keeping the archived conversation visible while another removes it after the same refresh cycle

#### Scenario: archiving one conversation does not interrupt unrelated running sessions

- **WHEN** user archives or deletes a conversation from session management
- **THEN** unrelated running conversations MUST keep their lifecycle and processing state unchanged
- **AND** archive visibility updates MUST NOT be implemented by globally resetting workspace conversation state

### Requirement: Workspace reconnect and restore semantics MUST preserve runtime acquisition boundaries
The system MUST distinguish between restoring workspace/thread UI state and acquiring a managed backend runtime, and it MUST keep repeated runtime acquisition attempts bounded and deterministic for the same workspace-engine pair.

#### Scenario: startup restore keeps thread metadata without forcing runtime spawn
- **WHEN** the client restores active or sidebar-visible workspaces on startup
- **THEN** it MUST restore workspace and thread metadata without automatically spawning a managed runtime for every restored workspace

#### Scenario: runtime-required action triggers managed runtime acquisition
- **WHEN** the user performs a runtime-required action such as send, resume, or new thread on a workspace that does not currently have a managed runtime
- **THEN** the system MUST acquire or reuse a managed runtime for that workspace before execution continues

#### Scenario: reconnect remains idempotent for same workspace-engine pair
- **WHEN** the client issues repeated reconnect or ensure-runtime actions for the same workspace and engine
- **THEN** the system MUST preserve a single effective managed runtime identity for that workspace-engine pair

#### Scenario: repeated acquisition failure enters bounded recoverable state
- **WHEN** managed runtime acquisition keeps failing for the same workspace-engine pair during automatic recovery
- **THEN** the system MUST stop unbounded immediate acquisition attempts after the configured retry budget is exhausted
- **AND** the workspace MUST enter a recoverable degraded or quarantined state until a fresh guarded retry cycle begins

#### Scenario: user-initiated retry restarts guarded acquisition after quarantine
- **WHEN** a workspace-engine pair is already in a degraded or quarantined recovery state and the user explicitly retries a runtime-required action
- **THEN** the system MUST begin a fresh guarded runtime acquisition cycle for that action
- **AND** the new cycle MUST NOT inherit an infinite retry loop from the previously exhausted automatic recovery path

### Requirement: Workspace Restore MUST Canonicalize Active Codex Thread Binding

在统一 conversation lifecycle contract 下，workspace restore / reopen MUST NOT 把已经确认失效的 `Codex` `threadId` 继续当成当前 active binding。

#### Scenario: restore repairs persisted active thread binding before lifecycle use
- **WHEN** workspace restore 已拿到 thread list 或 last-good visible snapshot
- **AND** 当前 persisted `activeThreadId` 已存在已验证的 canonical replacement
- **THEN** 系统 MUST 在后续 lifecycle consumer 使用该 id 前先完成 canonical rebind
- **AND** workspace MUST NOT 以旧 stale `threadId` 进入“看似 restored、实际无法 resume”的状态

#### Scenario: canonical active thread map stays consistent after restore
- **WHEN** 系统发现 `activeThreadIdByWorkspace` 中保存的是已知 stale `threadId`
- **THEN** 系统 MUST 将其收敛为 canonical `threadId` 或显式清空
- **AND** 生命周期读取方 MUST 看到一致的 current active binding

### Requirement: Codex Realtime History Reconcile MUST Be Validation-Oriented

在 `Codex` 会话中，turn completion 后的 history reconcile MUST 以 validation / backfill 为主，而不是 primary duplicate repair。只要客户端已经具备足够的本地 observation 去完成 canonical convergence，系统就 MUST 在 history refresh 之前保持稳定的可见 row 结果。

#### Scenario: equivalent history replay does not change visible row cardinality

- **WHEN** `Codex` turn 已在本地完成 user / assistant / reasoning 的 canonical convergence
- **AND** 后续 history reconcile 只带来等价内容
- **THEN** reconciliation MUST NOT 改变用户可见 message row 数量
- **AND** reconciliation 只 MAY canonicalize ids、metadata 或来源字段

#### Scenario: reconcile may backfill missing structured facts without reintroducing duplicates

- **WHEN** 本地 realtime settlement 缺少部分 canonical metadata 或 structured activity facts
- **AND** post-turn history reconcile 能补齐这些缺失信息
- **THEN** 系统 MAY 用 reconcile 结果回填缺失事实
- **AND** MUST NOT 因回填动作重新引入重复 user / assistant / reasoning rows

#### Scenario: non-codex lifecycle behavior remains unchanged

- **WHEN** 当前引擎为 `Claude`、`Gemini` 或 `OpenCode`
- **THEN** 本 reconciliation 职责调整 MUST NOT 改变其既有生命周期行为
- **AND** engine-specific differences MUST 继续保持在内部 adapter / loader 边界内

### Requirement: Claude And Gemini History Reconcile MUST Be Validation-Oriented

在 `Claude Code` 与 `Gemini` 会话中，turn completion 后的 history reconcile 或 session reopen MUST 以 validation / backfill 为主，而不是 primary duplicate repair。只要客户端已经具备足够的 local realtime observations 去完成 canonical convergence，系统就 MUST 在 history refresh 之前保持稳定的可见 row 结果。

#### Scenario: claude equivalent history replay does not change visible row cardinality

- **WHEN** `Claude Code` turn 已在本地完成 assistant、reasoning、tool、approval 或 plan rows 的 canonical convergence
- **AND** 后续 history reconcile 只带来等价内容
- **THEN** reconciliation MUST NOT 改变用户可见 row 数量
- **AND** reconciliation only MAY canonicalize ids、metadata、timestamps 或 structured facts

#### Scenario: gemini equivalent history replay does not change visible row cardinality

- **WHEN** `Gemini` turn 已在本地完成 assistant、reasoning 或 tool rows 的 canonical convergence
- **AND** 后续 history hydrate 只带来等价内容
- **THEN** reconciliation MUST NOT 改变用户可见 row 数量
- **AND** reconciliation only MAY canonicalize ids、metadata、timestamps 或 structured facts

#### Scenario: reconcile may backfill missing structured facts without reintroducing cross-engine duplicates

- **WHEN** 本地 realtime settlement 缺少部分 canonical metadata 或 structured activity facts
- **AND** post-turn history reconcile 能补齐这些缺失信息
- **THEN** 系统 MAY 用 reconcile 结果回填缺失事实
- **AND** MUST NOT 因回填动作重新引入重复 user、assistant、reasoning、tool、approval 或 plan rows

#### Scenario: codex lifecycle baseline remains unchanged

- **WHEN** 当前引擎为 `Codex`
- **THEN** Claude / Gemini convergence rollout MUST NOT weaken existing Codex idempotency、queued handoff、image generation、or staged markdown lifecycle behavior
- **AND** Codex-specific tests MUST remain part of the regression gate

### Requirement: Claude Lifecycle Consumers MUST Canonicalize Verified Thread Identity Before State Mutation

在统一 `conversation lifecycle` contract 下，`Claude` 的 lifecycle consumers MUST 在修改 active、loaded、processing、turn-settlement 等 thread-scoped state 之前，先解析已验证的 canonical thread identity。

#### Scenario: approval and request user input continuations use canonical thread identity
- **WHEN** `Claude` lifecycle consumer 处理 approval continue、`requestUserInput` submit、turn completion、turn error 或等价 continuation settlement
- **AND** 当前事件携带的 thread id 已存在已验证 alias 或 pending-to-finalized mapping
- **THEN** consumer MUST 在写入 processing / loaded / active-turn state 前先切换到 canonical thread identity
- **AND** 用户可见生命周期状态 MUST 保持附着在同一条 conversation 上

#### Scenario: selection resume consumes recovered canonical thread identity
- **WHEN** 用户激活某条 `Claude` conversation 并触发异步 resume、history reopen 或 equivalent hydrate
- **AND** resume path 返回的 authoritative thread identity 与初始选中 id 不同
- **THEN** lifecycle state MUST 将 active selection 与 loading ownership 迁移到 recovered canonical thread
- **AND** stale thread MUST NOT 继续被标记为当前 loaded active conversation

### Requirement: Claude Lifecycle MUST Prefer Explicit Reconcile Over False Loaded Success

当 `Claude` 的 canonical identity 在 reopen 或 continue 期间无法被安全确认时，生命周期状态 MUST 进入显式 reconcile / failure，而不是表现为“已成功打开但内容消失”。

#### Scenario: unresolved claude reopen does not settle as empty success
- **WHEN** `Claude` history reopen 或 continuation 期间无法安全确认 canonical thread identity
- **THEN** 生命周期 MUST 进入 explicit reconcile、recoverable failure 或等价分支
- **AND** 系统 MUST NOT 将当前会话 settle 为一个无内容、无说明、但看似已成功加载的状态

### Requirement: Codex History Reconcile MUST Consume Assembled History State

在 `Codex` 会话中，post-turn history reconcile MUST 先经过 shared assembly contract，再暴露给 lifecycle consumers；它只能补 canonical facts / metadata，不能重新承担 primary duplicate repair。

#### Scenario: reconcile hydrates through assembler before lifecycle consumers read state

- **WHEN** `Codex` turn completion 触发 delayed history reconcile
- **THEN** reconcile 返回的 history snapshot MUST 先经过 `ConversationAssembler.hydrateHistory()`
- **AND** lifecycle consumers MUST 读取 assembled state 而不是 raw history items

#### Scenario: reconcile backfills canonical facts without changing converged rows

- **WHEN** 本地 realtime state 已经对 user / assistant / reasoning 完成 semantic convergence
- **AND** reconcile 只补回 canonical id、structured metadata 或缺失 activity facts
- **THEN** conversation lifecycle state MUST 保持相同的 visible row cardinality
- **AND** 系统 MUST NOT 因 reconcile 再次出现重复 assistant、reasoning 或 user rows

### Requirement: Codex Realtime Rendering MUST Preserve Input Responsiveness Without Waiting For History

在 `Codex` 会话中，realtime curtain 的 render scheduling MUST 以本地 render cadence 完成 progressive reveal，并优先保持 composer 输入可操作；系统 MUST NOT 依赖 history reconcile 才恢复最终 Markdown 结构或输入响应。

#### Scenario: active typing may defer live curtain status but input remains responsive

- **WHEN** `Codex` thread 正在 realtime streaming
- **AND** 用户同时在 composer 中继续输入或进行 IME composition
- **THEN** 系统 MAY defer live status、usage 或 snapshot render cadence
- **AND** composer 输入 MUST 继续保持可操作
- **AND** 输入内容、selection、attachment state MUST NOT 因 live curtain 更新被回退或阻塞

#### Scenario: staged markdown reveal converges to final structure before history reconcile

- **WHEN** `Codex` assistant 正在输出长文本或结构化 Markdown 内容
- **THEN** 系统 MAY 使用 staged Markdown throttle 逐步显示结构
- **AND** completion 后的最终 Markdown 结构 MUST 在本地 realtime render 路径中收敛
- **AND** 系统 MUST NOT 依赖 post-turn history reconcile 才让标题、列表或强调结构恢复正确

### Requirement: Codex Recovery Surfaces MUST Remain Lifecycle-Consistent

Codex recovery UI and lifecycle consumers MUST avoid contradictory states across runtime reconnect, thread rebind, fresh continuation, stalled turn settlement, and user stop.

#### Scenario: runtime reconnect success cannot clear stale identity by itself
- **WHEN** a user clicks a Codex reconnect or recovery action
- **AND** runtime readiness succeeds
- **AND** thread identity remains stale or unrecoverable
- **THEN** the conversation lifecycle MUST remain recoverable, stale, fresh-continuable, or failed according to thread identity outcome
- **AND** the surface MUST NOT clear the recovery card as if the old conversation were restored

#### Scenario: fresh continuation switches active lifecycle target
- **WHEN** a Codex recovery action creates a fresh continuation target
- **THEN** active lifecycle state MUST switch to the fresh thread before or with the replayed user intent
- **AND** future user input MUST target the fresh thread rather than the stale source identity

#### Scenario: unknown draft boundary cannot be shown as successful fresh replacement
- **WHEN** a Codex identity recovery action cannot determine whether the old identity accepted user work
- **THEN** lifecycle state MUST remain durable-safe, retryable, failed, or explicitly fresh-continuable
- **AND** the UI MUST NOT present automatic draft replacement as a successful recovery outcome

#### Scenario: stalled stop produces terminal lifecycle outcome
- **WHEN** a Codex foreground turn is stalled and the user stops it
- **THEN** the old turn MUST settle as abandoned, interrupted, failed, or an equivalent terminal lifecycle state
- **AND** the thread MUST leave pseudo-processing before the next user send is accepted

#### Scenario: recovery card labels match actual outcome
- **WHEN** a Codex recovery action produces `rebound`, `fresh`, `failed`, or `abandoned`
- **THEN** user-visible labels and status text MUST match that outcome
- **AND** the system MUST NOT use the same success wording for restored identity and fresh continuation

### Requirement: Passive History Selection MUST NOT Force Codex Runtime Acquisition

Selecting or restoring a completed Codex history conversation for display MUST prefer durable local history facts and MUST NOT acquire a managed Codex runtime solely to render already-readable history.

#### Scenario: local history satisfies passive selection

- **WHEN** the user selects an unloaded Codex history conversation
- **AND** local session history can reconstruct visible conversation items for that `threadId`
- **THEN** the UI MUST render that history without calling Codex `thread/resume`
- **AND** backend runtime acquisition MUST remain reserved for runtime-required actions such as send, explicit retry, fork, or verified stale recovery

#### Scenario: passive selection may fall back when local history is insufficient

- **WHEN** local session history is unavailable, unreadable, or reconstructs no visible items
- **THEN** the system MAY use the existing runtime-backed resume path if the caller intentionally requested runtime verification
- **AND** any resulting recovery MUST follow the existing liveness and stale-thread contracts

### Requirement: Manual Recovery Actions MUST Settle To Non-Contradictory Conversation State

Manual recovery actions on the conversation surface MUST leave lifecycle state consistent with the actual target thread that can accept future work.

#### Scenario: fresh fallback cannot masquerade as old conversation continuity
- **WHEN** a manual recovery action for a stale Codex thread creates a fresh replacement conversation
- **THEN** lifecycle state MUST identify the fresh thread as the active continuation target
- **AND** the UI MUST NOT claim that the old stale thread was restored in place

#### Scenario: failed manual recovery keeps the user in a recoverable state
- **WHEN** a manual recovery action fails to produce a usable target thread
- **THEN** the current conversation surface MUST leave processing state
- **AND** the recovery affordance MUST remain visibly failed or retryable instead of silently doing nothing

#### Scenario: runtime reconnect remains separate from conversation identity recovery
- **WHEN** runtime readiness succeeds during a stale thread recovery action
- **AND** the stale conversation identity still cannot be rebound
- **THEN** lifecycle state MUST NOT treat runtime readiness alone as successful conversation recovery
- **AND** the thread identity recovery outcome MUST determine whether the recovery card succeeds, fails, or offers fresh continuation

### Requirement: Lifecycle Semantics MUST Survive Architecture Extraction
threads / messages / composer 主链路在第一阶段抽取期间 MUST 保持统一会话生命周期语义不变。

#### Scenario: lifecycle-compatible extraction preserves same outcomes
- **WHEN** reducer、event handlers、thread actions、message rendering 或 composer orchestration 被拆分到新模块
- **THEN** 相同事件序列在抽取前后 MUST 收敛到相同 lifecycle outcome
- **AND** user-visible processing、completed、error、recovery 与 blocked 语义 MUST 保持等价

#### Scenario: fallback or rollback path preserves lifecycle continuity
- **WHEN** 新的 facade、adapter 或 extracted helper 被局部关闭或回滚
- **THEN** conversation lifecycle contract MUST 继续成立
- **AND** 回滚 MUST NOT 留下 pseudo-processing、identity 漂移或重复 settlement residue

### Requirement: Realtime Turn Terminal Settlement MUST Clear Pseudo-Processing Safely
Realtime conversation lifecycle consumers MUST settle terminal turn state deterministically when a turn reaches completed or error state, while protecting newer active turns from accidental cleanup.

#### Scenario: completed turn clears processing after final assistant output
- **WHEN** a realtime turn has produced final assistant output
- **AND** the corresponding turn reaches completed terminal state
- **THEN** the thread lifecycle state MUST clear processing mode
- **AND** the active turn id for that completed turn MUST be cleared

#### Scenario: alias thread completion settles all matching identities
- **WHEN** a terminal completion event is associated with a finalized or canonical thread
- **AND** a pending or alias thread still carries the same active turn id
- **THEN** lifecycle settlement MUST clear processing state for both matching thread identities
- **AND** external completion side effects MUST run only once for the terminal turn

#### Scenario: fallback settlement does not clear newer turn
- **WHEN** final assistant completion evidence exists for an older turn
- **AND** the target thread has a newer active turn id
- **THEN** fallback settlement MUST NOT clear processing for the newer turn
- **AND** the rejected settlement MUST remain diagnosable

### Requirement: Turn Completion Guard Rejections MUST Be Observable
When terminal settlement refuses to clear processing, the system MUST emit enough structured evidence to distinguish a correct guard rejection from a stuck pseudo-processing bug.

#### Scenario: turn mismatch records settlement rejection
- **WHEN** a `turn/completed` event is received
- **AND** its turn id does not match the current thread or alias active turn
- **THEN** the client MUST record a settlement rejection with the requested thread id, alias thread id if any, terminal turn id, active turn ids, processing states, and rejection reason

#### Scenario: successful settlement records cleared target identities
- **WHEN** a terminal completion event successfully clears processing
- **THEN** the client MUST record which thread identities were settled
- **AND** the evidence MUST be correlatable with workspace, thread, engine, and turn

### Requirement: Realtime Terminal Fence Preserves Terminal Lifecycle
The frontend conversation lifecycle MUST prevent realtime work belonging to a terminal turn from re-opening processing or mutating that turn's live state after the turn has reached `completed`, `error`, or `stalled`.

#### Scenario: late realtime delta cannot reopen processing
- **WHEN** a turn has been marked terminal by completed, error, or stalled settlement
- **AND** a realtime delta for the same thread and turn arrives later
- **THEN** the frontend MUST NOT call `markProcessing(true)` for that thread because of the stale delta
- **AND** the stale delta MUST NOT append live assistant, reasoning, tool, command, terminal, or file-change output for that terminal turn

#### Scenario: queued realtime work self-cancels after terminal settlement
- **WHEN** realtime work was accepted before terminal settlement but executes later through a timer batch or scheduled transition
- **AND** the work belongs to the now-terminal turn
- **THEN** the frontend MUST drop the work at execution time
- **AND** the terminal lifecycle state MUST remain settled

#### Scenario: raw item handler skips terminal turn before downstream mutation
- **WHEN** a raw item snapshot enters the event handler for a turn that is already terminal
- **THEN** the event handler MUST skip the event before invoking downstream item/realtime mutation handlers
- **AND** downstream continuation evidence or live processing side effects MUST NOT be produced for that stale event

#### Scenario: newer active turn is not blocked by old terminal fence
- **WHEN** a newer turn starts on the same thread after an older turn has been marked terminal
- **THEN** realtime events carrying the newer turn id MUST continue through normal realtime handling
- **AND** the terminal fence for the older turn MUST NOT suppress the newer turn's visible output or lifecycle state

### Requirement: Final Assistant Evidence Enables Conservative Completion Settlement
When normal `turn/completed` settlement is rejected but final assistant output is already visible, the frontend MUST allow a conservative fallback settlement only when no newer active turn exists for the thread.

#### Scenario: rejected completion with visible final output settles stale processing
- **WHEN** `turn/completed` is rejected by the normal active-turn guard
- **AND** final assistant output evidence exists for the same diagnostic turn
- **AND** the thread has no newer active turn
- **THEN** the frontend MUST clear residual processing state for that thread
- **AND** the frontend MUST keep the assistant output in final completed state
- **AND** the fallback settlement MUST emit diagnostic evidence that it was applied

#### Scenario: fallback settlement does not clear newer active turn
- **WHEN** `turn/completed` for an older turn is rejected
- **AND** final assistant output evidence exists for the older turn
- **AND** the same thread already has a newer active turn
- **THEN** the frontend MUST NOT clear processing for the thread through fallback settlement
- **AND** the newer active turn marker MUST remain intact

### Requirement: Terminal Fence Requires Turn Identity Propagation
Realtime event routing MUST preserve available `turnId` values from legacy and normalized fallback event paths to the final frontend handlers that apply terminal turn filtering.

#### Scenario: fallback output event keeps turn identity
- **WHEN** command output, terminal interaction, file-change output, reasoning delta, agent delta, or fallback assistant completion is routed through a legacy or normalized fallback path
- **THEN** the routed handler call MUST include the event's `turnId` when the source event provides it
- **AND** terminal turn filtering MUST be able to apply exact-turn matching to that event

#### Scenario: missing turn identity does not overblock newer events
- **WHEN** a realtime event does not provide a usable `turnId`
- **THEN** the frontend MUST avoid treating that event as an exact match for an unrelated terminal turn
- **AND** newer turn events with explicit turn ids MUST remain preferred for terminal fence decisions

### Requirement: Conversation Restore MUST Resolve Engine From Active Thread
When restoring or rendering an existing conversation thread, the system MUST resolve the conversation engine from the active thread identity before falling back to the global engine selector.

#### Scenario: Claude history opens while global engine is Codex
- **WHEN** the global selected engine is `codex`
- **AND** the active thread metadata identifies the thread as `claude`
- **THEN** the conversation render state MUST use `claude`
- **AND** the message surface MUST NOT show Codex history loading or Codex transcript recovery copy for that Claude thread

#### Scenario: thread metadata is unavailable
- **WHEN** an active thread has no usable `selectedEngine` or `engineSource`
- **AND** the thread id does not contain a supported engine prefix
- **THEN** the conversation render state MAY fall back to the global selected engine
- **AND** new-session composer engine selection MUST remain unchanged

### Requirement: Claude Progressive Mode Rollout MUST Preserve Conversation Continuity

Claude mode availability changes MUST preserve conversation lifecycle continuity and MUST NOT require users to switch to a different engine contract.

#### Scenario: current claude mode expansion does not reset thread flow
- **WHEN** Claude exposes `default`, `plan`, and `full-access`
- **THEN** existing Claude thread creation and message send flow MUST remain continuous
- **AND** previously working `full-access` conversations MUST continue without lifecycle regression

#### Scenario: approval-dependent claude modes stay inside existing event stream
- **WHEN** Claude mode execution requires GUI approval
- **THEN** approval requests MUST flow through the existing conversation event stream
- **AND** user-visible lifecycle progression MUST remain consistent with other engines using the same approval surface

### Requirement: Claude Synthetic Approval Resume MUST Preserve History Recoverability

Claude synthetic approval handling MUST preserve both live continuity and restart recoverability.

#### Scenario: approval completion resumes the interrupted claude turn
- **WHEN** the last pending Claude synthetic approval in a turn is resolved
- **THEN** runtime MUST continue the interrupted Claude session instead of ending permanently at the approval summary
- **AND** the user MUST still receive the post-approval execution result in the same conversation flow

#### Scenario: synthetic approval markers do not leak into user-visible history
- **WHEN** approval resume metadata is carried through Claude history using an internal marker payload
- **THEN** loaders and thread item parsing MUST strip the raw marker from visible text
- **AND** the payload MUST be reconstructed into structured lifecycle items such as `File changes`

#### Scenario: multi-approval turns finalize only after the last request resolves
- **WHEN** multiple Claude approvals are pending for the same turn
- **THEN** the conversation MUST remain resumable until every pending approval is answered
- **AND** intermediate approvals MUST NOT prematurely finalize the turn

### Requirement: Claude Inline Approval Surface MUST Stay Decision-Oriented

Claude synthetic approvals MUST remain readable and decision-oriented in the shared conversation surface rather than degrading into generic notices or raw content dumps.

#### Scenario: inline approval renders as a distinct approval card near the active turn tail
- **WHEN** Claude synthetic approval is rendered inline inside the message canvas
- **THEN** the UI MUST present it as a visually distinct approval card with clear approval affordance
- **AND** the inline placement MUST anchor near the bottom of the active conversation flow instead of occupying the top reading entry

#### Scenario: approval detail hides large raw content fields by default
- **WHEN** Claude synthetic approval payload contains large raw body fields such as `content`, `diff`, `patch`, or equivalent rewritten text
- **THEN** the inline approval detail MUST hide those raw fields by default
- **AND** the card MUST continue surfacing compact decision-critical metadata such as path, command summary, tool label, or approval note

### Requirement: Exit Plan Handoff MUST Keep UI Mode And Execution Mode In Sync

When Claude `plan` execution reaches `ExitPlanMode`, the UI MUST require an explicit execution-mode choice and MUST NOT leave the conversation selector showing `plan` after execution starts.

#### Scenario: exit plan card offers explicit execution mode choices
- **WHEN** Claude renders an `ExitPlanMode` handoff card after plan confirmation
- **THEN** the card MUST state that continuing execution requires leaving planning mode
- **AND** it MUST provide explicit actions for `default` and `full-access`

#### Scenario: choosing default approval mode syncs selector before execution
- **WHEN** user clicks the `default` execution action from the `ExitPlanMode` card
- **THEN** the collaboration selector MUST leave `plan`
- **AND** the access selector MUST switch to `default`
- **AND** the follow-up implementation prompt MUST run with `default` access mode

#### Scenario: choosing full access syncs selector before execution
- **WHEN** user clicks the `full-access` execution action from the `ExitPlanMode` card
- **THEN** the collaboration selector MUST leave `plan`
- **AND** the access selector MUST switch to `full-access`
- **AND** the follow-up implementation prompt MUST run with `full-access`

#### Scenario: historical claude thread still enforces read-only while plan mode is active
- **WHEN** user reopens an existing Claude thread, switches conversation UI to `plan`, and sends a follow-up request
- **THEN** runtime MUST send the follow-up turn as `read-only`
- **AND** stale writable access state from the same thread MUST NOT leak through and allow file creation or approval prompts

### Requirement: Claude Stream Startup Failure MUST Deterministically Settle Turn Lifecycle

Within the unified conversation lifecycle, a Claude turn that never establishes a valid realtime stream MUST leave pseudo-processing through a deterministic terminal error.

#### Scenario: no valid claude stream settles processing

- **WHEN** a Claude foreground turn starts in the GUI
- **AND** backend cannot observe any valid Claude stream-json event within the bounded startup window
- **THEN** the turn MUST settle as terminal error
- **AND** the conversation MUST leave ordinary processing state for that turn
- **AND** the user MUST regain an interactive thread state without manually restarting the app

#### Scenario: startup failure remains engine-scoped

- **WHEN** Claude stream startup timeout handling is introduced
- **THEN** Codex, Gemini, and OpenCode lifecycle behavior MUST remain unchanged
- **AND** provider-specific compatibility logic MUST NOT leak into the shared lifecycle layer

