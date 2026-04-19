# conversation-lifecycle-contract Specification

## Purpose

Define a unified conversation lifecycle contract across Claude, Codex, and OpenCode, so delete/recovery/order behavior is restart-verifiable and engine-consistent.
## Requirements
### Requirement: Unified Cross-Engine Conversation Lifecycle Contract
The system MUST define consistent lifecycle semantics (delete, recent ordering, restart visibility, key tool card recoverability) across Claude, Codex, and OpenCode.

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

### Requirement: Delete Semantics Must Be Restart-Verifiable

The system MUST keep user-visible delete results consistent with restart-visible state.

#### Scenario: delete result is restart-verifiable

- **WHEN** user deletes a conversation and receives a success result
- **THEN** current list MUST remove the target conversation
- **AND** after app restart the deleted conversation MUST NOT reappear

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
During conversation list lifecycle, transient `workspace not connected` errors MUST be recoverable without dropping visible history continuity.

#### Scenario: thread list retries once after workspace reconnect
- **WHEN** Codex `thread/list` fails with `workspace not connected`
- **THEN** client MUST trigger workspace reconnect before surfacing failure
- **AND** client MUST retry the same list request once after reconnect succeeds

#### Scenario: reconnect failure keeps existing list state recoverable
- **WHEN** reconnect attempt still fails
- **THEN** system MUST keep previously loaded thread list state available to user
- **AND** lifecycle flow MUST remain interactive without forcing full session reset

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
The system MUST distinguish between restoring workspace/thread UI state and acquiring a managed backend runtime.

#### Scenario: startup restore keeps thread metadata without forcing runtime spawn
- **WHEN** the client restores active or sidebar-visible workspaces on startup
- **THEN** it MUST restore workspace and thread metadata without automatically spawning a managed runtime for every restored workspace

#### Scenario: runtime-required action triggers managed runtime acquisition
- **WHEN** the user performs a runtime-required action such as send, resume, or new thread on a workspace that does not currently have a managed runtime
- **THEN** the system MUST acquire or reuse a managed runtime for that workspace before execution continues

#### Scenario: reconnect remains idempotent for same workspace-engine pair
- **WHEN** the client issues repeated reconnect or ensure-runtime actions for the same workspace and engine
- **THEN** the system MUST preserve a single effective managed runtime identity for that workspace-engine pair

