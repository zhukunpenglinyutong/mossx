# codex-stalled-recovery-contract Specification

## Purpose

Define the Codex-specific stalled recovery contract so waiting-first-event, silent foreground work, and request-user-input resume gaps settle into bounded, diagnosable states instead of leaving threads stuck in pseudo-processing.
## Requirements
### Requirement: Codex Stalled Turn MUST Transition To A Recoverable Degraded State

当 `Codex` queue fusion / continuation 已请求切换，但在受限窗口内没有收到新的 continuation 证据或终态事件时，系统 MUST 将其从“假继续生成”转为可恢复的 degraded state。

#### Scenario: queue fusion continuation that never resumes becomes recoverable

- **WHEN** 用户触发 Codex queue fusion
- **AND** 系统已向 runtime 发出 same-run continuation 或 cutover continuation 请求
- **AND** 在受限窗口内未收到新的 `turn/started`、stream delta、execution item 或等效推进事件
- **THEN** 系统 MUST 将当前 continuation 标记为 `resume-pending`、`resume-stalled` 或等效可恢复状态
- **AND** 线程 MUST NOT 永久停留在“继续生成中”的假活跃状态

#### Scenario: fusion continuation timeout remains bounded and diagnosable

- **WHEN** 系统对 Codex fusion continuation 执行 stalled settlement
- **THEN** timeout MUST 使用 bounded recovery window
- **AND** stalled diagnostic MUST 指明该条链路来自 same-run fusion、cutover fusion 或等效 continuation source

### Requirement: Codex Stalled Recovery Diagnostics MUST Be Correlatable Across Runtime And Thread Surfaces

针对同一条 Codex fusion stalled chain 与 `resume-pending` user-input resume timeout，thread-facing diagnostics、runtime diagnostics 与 runtime pool console MUST 共享一致的相关维度，并明确区分“当前仍活跃”与“最近一次 stalled”。

#### Scenario: stalled fusion exposes shared correlation dimensions

- **WHEN** 系统识别到 Codex fusion continuation 进入 stalled / degraded state
- **THEN** 诊断事实 MUST 至少包含 `workspaceId`、`threadId`、`turnId`（可用时）、engine、continuation source 与 timeout stage
- **AND** thread 与 runtime pool MUST 使用语义一致的 stalled reason 表达同一条异常链

#### Scenario: resume-pending timeout keeps correlatable recent stalled evidence after release

- **WHEN** 系统将一条 Codex `resume-pending` user-input resume chain 结算为 stalled / degraded
- **THEN** 诊断事实 MUST 继续包含 `workspaceId`、`threadId`、`turnId`（可用时）、engine、continuation source 与 timeout stage
- **AND** runtime 与 thread surfaces MUST 能将该事实关联为最近一次 stalled timeout
- **AND** 该事实 MUST NOT 单独被解释为当前仍在执行的 foreground work

### Requirement: General Codex Turn Silence MUST Settle To Recoverable Liveness State

Codex stalled recovery MUST distinguish frontend-observed silence from authoritative stalled settlement. A normal foreground turn without active execution items MUST use a 600-second frontend no-progress window to enter `suspected-silent` or an equivalent soft recoverable state. The frontend-only no-progress window MUST NOT mark the turn as terminal stalled and MUST NOT quarantine the turn. A backend `resume-pending` user-input resume watcher MUST default to 360 seconds before emitting authoritative stalled settlement.

#### Scenario: frontend no progress enters suspected silent state
- **WHEN** a Codex foreground turn has been started or requested
- **AND** the turn has no active command, tool, file-change, or equivalent execution item
- **AND** the frontend receives no terminal event, stream delta, tool event, user-input request, approval request, heartbeat, status-active event, item update, or equivalent progress evidence for 600 seconds
- **THEN** the turn MUST transition to `suspected-silent` or an equivalent soft recoverable liveness state
- **AND** the thread MUST remain eligible to receive progress evidence for the same active turn identity
- **AND** the system MUST NOT quarantine the turn solely because of this frontend-only timeout

#### Scenario: authoritative stalled settlement releases current foreground continuity
- **WHEN** a Codex foreground turn receives a backend authoritative stalled settlement such as `turn/stalled`, backend resume-pending timeout, runtime-ended, terminal error, or equivalent runtime-owned liveness failure
- **THEN** the turn MUST transition to `stalled`, `dead-recoverable`, or an equivalent recoverable terminal liveness state
- **AND** the old turn chain MUST release current foreground continuity / active-work protection

#### Scenario: resume-pending timeout releases current foreground continuity
- **WHEN** a Codex foreground turn is waiting on a `requestUserInput` resume chain in `resume-pending` or equivalent state
- **AND** the backend default resume-pending window of 360 seconds expires without new terminal or progress evidence
- **THEN** the turn MUST transition to `stalled`, `dead-recoverable`, or an equivalent recoverable terminal liveness state
- **AND** the old resume-pending chain MUST release current foreground continuity / active-work protection

#### Scenario: active execution uses extended soft no-progress window
- **WHEN** a Codex foreground turn has an active command, tool, file-change, or equivalent execution item
- **AND** the execution item has not emitted a terminal completion event
- **THEN** the 600-second normal no-progress window MUST NOT settle the turn as stalled
- **AND** the turn MAY only enter `suspected-silent` or an equivalent soft recoverable state after the 1200-second execution-active no-progress window unless backend authoritative stalled settlement arrives first

#### Scenario: progress evidence resets normal no-progress window
- **WHEN** a Codex foreground turn without active execution receives progress evidence before the 600-second normal timeout
- **THEN** the system MUST measure the normal no-progress window from that latest progress evidence
- **AND** the turn MUST remain eligible to continue receiving progress evidence until the refreshed window expires

### Requirement: Stop After Codex Stall MUST Unblock Future Sends

Stopping a stalled Codex turn MUST produce a deterministic terminal or abandoned lifecycle result so future user messages are not trapped behind the stale in-flight state.

#### Scenario: stop settles stalled turn
- **WHEN** the user stops a Codex turn in stalled or dead-recoverable state
- **THEN** the turn MUST settle as abandoned, interrupted, failed, or equivalent terminal state
- **AND** processing and active-turn markers for that turn MUST be cleared

#### Scenario: next send chooses verified or fresh target
- **WHEN** the user sends a new message after stopping a stalled Codex turn
- **THEN** the system MUST target a verified existing thread or create an explicit fresh continuation target
- **AND** the send MUST NOT reuse a thread identity already classified as unrecoverable

### Requirement: Codex Stalled Turn MUST Quarantine Late Events For The Settled Turn

When a Codex foreground turn enters stalled, dead-recoverable, abandoned, or equivalent terminal liveness settlement from an authoritative source, the system MUST prevent late events from that same old turn from reviving normal processing state. A frontend-only `suspected-silent` state is not a terminal liveness settlement and MUST NOT quarantine late progress for the matching active turn.

#### Scenario: late event after authoritative no-progress stall is diagnostic-only
- **WHEN** a Codex foreground turn has been marked stalled due to a backend authoritative no-progress timeout or equivalent runtime-owned stalled settlement
- **AND** a later realtime event arrives for the same `threadId` and `turnId`
- **THEN** the system MUST record the late event as diagnostic evidence
- **AND** the event MUST NOT mark the thread as processing, active, or generating again

#### Scenario: late event after frontend suspected silence restores activity
- **WHEN** a Codex foreground turn has entered `suspected-silent` solely due to frontend-observed no-progress
- **AND** a later realtime event arrives for the same active `threadId` and `turnId`
- **THEN** the system MUST clear the suspected-silent state
- **AND** the event MUST be allowed to update conversation state normally

#### Scenario: successor turn remains live
- **WHEN** a Codex foreground turn has been marked stalled
- **AND** a later realtime event arrives for the same thread but a different active successor `turnId`
- **THEN** the system MUST allow the successor event to update conversation state normally
- **AND** the old stalled turn quarantine MUST NOT suppress the successor turn

### Requirement: Codex Execution-Active No-Progress Window MUST Be Twenty Minutes

Codex stalled recovery MUST use a 1200-second execution-active no-progress window for foreground turns that have active command, tool, file-change, or equivalent execution items. Frontend-observed execution-active silence at this window MUST enter `suspected-silent` or an equivalent soft recoverable state unless backend authoritative stalled settlement arrives.

#### Scenario: quiet execution is not stalled at fifteen minutes
- **WHEN** a Codex foreground turn has an active execution item
- **AND** no progress evidence arrives for 900 seconds
- **THEN** the system MUST keep the turn out of stalled settlement
- **AND** the thread MUST remain eligible to continue receiving progress evidence

#### Scenario: quiet execution becomes suspected at twenty minutes
- **WHEN** a Codex foreground turn has an active execution item
- **AND** no terminal event, stream delta, tool event, user-input request, approval request, heartbeat, status-active event, item update, or equivalent progress evidence arrives for 1200 seconds
- **AND** no backend authoritative stalled settlement has arrived
- **THEN** the turn MUST transition to `suspected-silent` or an equivalent soft recoverable state
- **AND** the system MUST NOT quarantine the turn solely because of this frontend-observed execution-active timeout

#### Scenario: authoritative quiet execution stalls at twenty minutes or later
- **WHEN** backend runtime ownership determines that a Codex foreground turn with an active execution item has exceeded an authoritative execution-active no-progress window
- **THEN** the turn MUST transition to `stalled`, `dead-recoverable`, or an equivalent recoverable terminal liveness state
- **AND** the thread MUST NOT remain indefinitely in normal processing state

#### Scenario: tool progress resets execution-active window
- **WHEN** a Codex foreground turn has an active execution item
- **AND** an `item/started`, `item/updated`, `item/completed`, tool output delta, assistant delta, heartbeat, status-active event, or equivalent normalized realtime event arrives before the execution-active timeout
- **THEN** the system MUST treat that event as progress evidence
- **AND** the 1200-second no-progress window MUST be measured from that latest progress evidence
