# conversation-runtime-stability Specification

## Purpose

Define host conversation runtime stability guarantees for bounded recovery, recoverable diagnostics, last-good continuity, and correlatable failure evidence.
## Requirements
### Requirement: Runtime Recovery Guard MUST Bound Automatic Reacquire And Reconnect

For each `workspace + engine` pair, the host runtime MUST apply a bounded, source-aware recovery guard so automatic session reacquire, reconnect, and runtime-dependent retry paths cannot form an unbounded storm loop.

#### Scenario: concurrent automatic recovery sources collapse into a single guarded leader

- **WHEN** multiple automatic sources such as thread list refresh, workspace restore, focus refresh, or implicit reconnect target the same `workspace + engine`
- **THEN** the system MUST elect at most one in-flight guarded recovery leader for that pair
- **AND** all other automatic sources MUST reuse the leader result, wait, or receive a guarded degraded outcome instead of spawning another recovery attempt

#### Scenario: repeated recovery failures enter cooldown quarantine

- **WHEN** automatic runtime reacquire or reconnect fails repeatedly for the same `workspace + engine`
- **THEN** the system MUST stop unbounded immediate retries after the configured recovery budget is exhausted
- **AND** the pair MUST enter a cooldown or quarantine state before another automatic recovery attempt is allowed

#### Scenario: startup pending does not recursively trigger a second automatic reconnect

- **WHEN** the runtime for a `workspace + engine` pair is already in a startup-pending guarded attempt
- **THEN** timeout or degraded reads from other automatic sources MUST NOT begin a second automatic reconnect for that pair
- **AND** those sources MUST surface a pending-start or equivalent guarded degraded state instead

#### Scenario: successful recovery clears degraded guard state

- **WHEN** a guarded `workspace + engine` pair completes a successful health probe or runtime-dependent action after previous failures
- **THEN** the system MUST clear the accumulated automatic recovery failure state
- **AND** subsequent operations MUST resume from a healthy recovery budget

### Requirement: Runtime-Dependent Failures MUST Surface Structured Stability Diagnostics

When conversation work depends on a managed runtime, the system MUST first protect active work from idle retention policies and MUST classify any remaining runtime loss into a structured stability diagnostic rather than only exposing raw transport or provider text.

#### Scenario: active turn remains protected during quiet execution

- **WHEN** a managed conversation turn is still in progress but has entered a quiet phase without new streamed tokens
- **THEN** the system MUST continue treating that work as active rather than idle
- **AND** idle retention policies such as warm TTL MUST NOT end the runtime for that reason alone

#### Scenario: runtime ends before a turn reaches terminal lifecycle

- **WHEN** a conversation turn loses its managed runtime before a completed or error terminal lifecycle event is emitted
- **THEN** the system MUST classify the failure as a runtime-ended diagnostic or equivalent structured category
- **AND** the thread MUST leave pseudo-processing state deterministically

#### Scenario: child exit or stdout eof includes normalized failure context

- **WHEN** a managed runtime exits, loses stdout, or otherwise becomes unavailable after initialization
- **THEN** the emitted stability diagnostic MUST include a normalized reason code and any available runtime exit metadata
- **AND** the host MUST use that diagnostic to settle pending requests and affected thread state

#### Scenario: recovery exhaustion surfaces quarantine diagnostic

- **WHEN** the automatic recovery guard reaches its retry budget or quarantine threshold
- **THEN** the system MUST surface a recoverable diagnostic that automatic recovery has been paused
- **AND** the diagnostic MUST indicate that a user-initiated retry or reconnect is now required

### Requirement: Codex Runtime Silence MUST Surface Bounded Liveness Diagnostics

对于 Codex fusion continuation，系统 MUST 将“切换后无新 continuation 证据”的静默窗口视为受限 liveness 状态，而不是仅留下模糊的 busy / retained 表象。

#### Scenario: fusion continuation silence is not treated as confirmed resumed work

- **WHEN** Codex queue fusion 已向 runtime 发出 continuation 请求
- **AND** runtime 进程仍存活
- **AND** 受限窗口内没有新的 continuation 证据
- **THEN** 系统 MUST 将该状态视为 `resume-pending`、`silent-busy` 或等效 liveness 状态
- **AND** 该状态 MUST NOT 被当作已经确认 resumed 的正常 active work

#### Scenario: bounded fusion silence timeout settles to structured degraded outcome

- **WHEN** Codex fusion continuation silence 超出配置的 bounded window
- **THEN** 系统 MUST 产出结构化 degraded diagnostic
- **AND** 诊断 MUST 能区分普通 user-input resume timeout 与 fusion continuation timeout

### Requirement: Last-Good Continuity MUST Survive Partial Runtime-Dependent Read Failures

Conversation list, reopen, and history surfaces MUST preserve the last successful visible snapshot when runtime-dependent reads fail partially, omit a previously visible subset, or otherwise return a degraded partial result, while explicitly marking the surface as degraded.

#### Scenario: thread list fallback keeps last visible snapshot

- **WHEN** a thread list refresh fails after the client already has a previously successful visible list
- **THEN** the system MUST keep the last successful list available to the user
- **AND** the surface MUST indicate that the current list is degraded or partially stale

#### Scenario: thread list waiter path preserves last-good snapshot while leader recovers

- **WHEN** a thread list refresh arrives while another guarded automatic recovery attempt is already leading for the same `workspace + engine`
- **THEN** the thread list surface MUST preserve the last successful visible snapshot instead of clearing or duplicating the recovery attempt
- **AND** the surface MUST remain explicitly diagnosable as waiting on guarded recovery

#### Scenario: startup-pending list timeout does not masquerade as stale disconnect

- **WHEN** a thread list live read times out while the same `workspace + engine` is still inside a startup-pending guarded attempt
- **THEN** the system MUST classify that read as startup-related degraded continuity rather than a confirmed stale disconnect
- **AND** the host MUST NOT escalate that timeout into a new automatic reconnect storm

#### Scenario: history reload failure does not masquerade as empty truth

- **WHEN** reopen or history reload encounters partial source or root failure after a previous successful load
- **THEN** the system MUST preserve the last successful visible history snapshot
- **AND** the system MUST NOT silently replace that state with an unexplained empty result

#### Scenario: thread list partial omission preserves last visible subset
- **WHEN** a thread list refresh returns a non-empty result
- **AND** the result omits one or more previously visible entries from the same surface
- **AND** the refresh is classified as degraded, partial, waiter-bound, or equivalent non-authoritative subset result
- **THEN** the system MUST preserve the omitted entries from the last successful visible snapshot
- **AND** the surface MUST indicate that the current list is degraded or partially stale

### Requirement: New Runtime-Required Actions MUST Start From A Fresh Guarded Attempt

When the user initiates a new runtime-required action after a prior runtime failure, or while the previously bound managed runtime has already entered a stopping/manual-shutdown lifecycle, the system MUST ensure that the new attempt does not inherit an unbounded retry loop, stale in-flight recovery state, or a runtime instance that is already on its way out.

#### Scenario: new thread after prior failure starts a fresh acquisition cycle

- **WHEN** the user starts a new thread after the same `workspace + engine` previously entered degraded or quarantined recovery state
- **THEN** the system MUST begin a fresh guarded runtime acquisition attempt for that user action
- **AND** the new attempt MUST NOT reuse a stale automatic retry loop that was already exhausted

#### Scenario: explicit user retry can reopen recovery after quarantine

- **WHEN** a `workspace + engine` pair is currently quarantined and the user explicitly retries or reconnects
- **THEN** the system MUST allow a fresh guarded recovery cycle to start
- **AND** the system MUST keep the retry sequence bounded by the same recovery contract

#### Scenario: create session ignores stopping runtime marked for manual shutdown

- **WHEN** the user starts a new thread or creates a new session while the currently registered managed runtime has already been marked `manual shutdown`, `runtime ended`, or equivalent stopping lifecycle
- **THEN** the system MUST reject that runtime as a reusable foreground execution target
- **AND** the create-session path MUST start or await a fresh guarded runtime attempt instead of surfacing the stale stopping-runtime binding as the first execution target

#### Scenario: create session gets one bounded fresh retry after stopping-runtime race

- **WHEN** a user-initiated create-session request reaches `thread/start` and the bound runtime still ends due to the same stopping/manual-shutdown race before the new turn is created
- **THEN** the system MUST perform one bounded fresh reacquire or equivalent guarded retry for that user action
- **AND** the flow MUST settle as either a successful new session or a recoverable failure without requiring an unbounded reconnect loop

### Requirement: Stability Evidence MUST Be Correlatable Across Existing Diagnostics Surfaces

Runtime failures covered by this capability MUST leave enough correlated evidence in existing diagnostics surfaces to support issue triage and manual debugging.

#### Scenario: hook-safe fallback evidence preserves primary and fallback outcome

- **WHEN** hook-safe fallback is attempted during create-session
- **THEN** diagnostics MUST record workspace id, engine, create-session action, primary failure category, fallback mode, and fallback outcome
- **AND** diagnostics MUST avoid storing full hook additionalContext or full prompt text

### Requirement: Recoverable Create-Session Failures MUST Expose A Direct Recovery Action

当系统已经能够判断某次 create-session failure 属于 stopping-runtime、runtime-recovering、或项目 SessionStart hook 阻塞这类可恢复错误时，前端 MUST 提供显性的恢复动作或自动恢复反馈，而不是只留下纯文本错误结论。

#### Scenario: hook-induced create-session failure auto-recovers before blocking the user

- **WHEN** 用户创建 Codex 会话时 primary runtime 因项目 SessionStart hook failure、hook timeout、hook permission denial 或 invalid `thread/start` response 无法返回 thread id
- **THEN** backend MUST first attempt a bounded hook-safe fallback
- **AND** frontend MUST NOT show the empty-thread-id blocking error if fallback succeeds

#### Scenario: hook-safe fallback reports degraded context

- **WHEN** hook-safe fallback succeeds
- **THEN** frontend MUST present a visible degraded-context notice
- **AND** runtime diagnostics MUST preserve enough evidence for support to distinguish hook-safe fallback from ordinary runtime recovery

#### Scenario: hook-safe fallback remains bounded by runtime recovery guard

- **WHEN** multiple create-session requests hit the same hook-induced failure pattern
- **THEN** each user-initiated request MAY receive at most one hook-safe fallback attempt
- **AND** automatic fallback MUST NOT create an unbounded runtime restart loop
- **AND** concurrent callers MUST respect existing runtime acquire / replacement coordination

### Requirement: Internal Codex Runtime Shutdown MUST NOT Masquerade As Foreground Turn Loss

The system MUST distinguish expected internal Codex runtime cleanup from true foreground runtime loss before emitting thread-facing runtime-ended diagnostics.

#### Scenario: internal cleanup without affected work records diagnostics only

- **WHEN** a Codex managed runtime is stopped by internal replacement, stale-session cleanup, settings restart, idle eviction, or app shutdown cleanup
- **AND** there is no active turn, pending request, timed-out request, background thread callback, or foreground work continuity attached to that runtime
- **THEN** the backend MUST NOT emit a `runtime/ended` app-server event for the conversation surface
- **AND** the backend MUST preserve runtime lifecycle evidence in existing runtime diagnostics or ledger state

#### Scenario: active foreground work still receives runtime-ended recovery

- **WHEN** a Codex managed runtime ends while active turn, pending request, timed-out request, background callback, or foreground work continuity exists
- **THEN** the affected work MUST settle through a structured recoverable runtime-ended diagnostic
- **AND** the diagnostic MUST include shutdown source, normalized reason code, pending request count, affected thread or turn ids when available, and exit metadata when available

#### Scenario: expected cleanup still settles pending request state

- **WHEN** a Codex runtime end path discovers pending or timed-out request state
- **THEN** every affected request MUST resolve or fail deterministically
- **AND** the system MUST NOT suppress request settlement merely because the shutdown source was expected or internal

### Requirement: Runtime Generation MUST Bound Codex Liveness Recovery

The runtime stability layer MUST preserve enough runtime generation identity to distinguish current Codex runtime state from stale predecessor shutdowns, events, and diagnostics.

#### Scenario: predecessor shutdown cannot poison successor conversation state
- **WHEN** a Codex runtime is replaced or reacquired
- **AND** the predecessor later emits runtime-ended, manual-shutdown, stdout-eof, or process-exit diagnostics
- **THEN** those diagnostics MUST be associated with the predecessor generation
- **AND** they MUST NOT mark the successor generation's active conversation as failed unless affected work identity matches

#### Scenario: explicit user recovery starts a fresh generation-aware attempt
- **WHEN** a user explicitly retries, reconnects, or continues in a new Codex conversation after a runtime failure
- **THEN** the recovery path MUST create, await, or verify a fresh generation-aware runtime attempt
- **AND** it MUST NOT reuse a runtime already marked stopping, ended, or stale for foreground execution

#### Scenario: runtime diagnostics include liveness source
- **WHEN** runtime stability emits a diagnostic for a Codex liveness failure
- **THEN** the diagnostic MUST include recovery source, guard state, shutdown source when available, and runtime generation or equivalent process identity when available
- **AND** frontend diagnostics MUST be able to correlate that diagnostic with the affected thread or draft state when known

### Requirement: Runtime Readiness MUST Stay Separate From Conversation Identity Readiness

Runtime stability actions MUST report runtime health without implying that a previously active Codex thread identity is still usable.

#### Scenario: ready runtime with missing thread remains recoverable identity failure
- **WHEN** `ensureRuntimeReady` succeeds for a workspace
- **AND** subsequent `thread/resume` or `turn/start` for the active Codex thread returns `thread not found` or equivalent identity failure
- **THEN** the system MUST treat the result as identity recovery failure, not runtime recovery failure
- **AND** the recovery surface MUST offer rebind, fresh continuation, or failed outcome according to identity recovery contract

#### Scenario: runtime reconnect button does not imply resend target validity
- **WHEN** the user clicks a runtime reconnect action from a conversation surface
- **THEN** the action MUST only certify runtime readiness
- **AND** any resend target MUST still be verified, rebound, or freshly created before user intent is replayed

### Requirement: Codex Runtime Stability MUST Be Cross-Platform Across macOS And Windows

Codex runtime stability MUST use platform-neutral process, path, spawn, shutdown, and watchdog contracts so macOS and Windows produce equivalent lifecycle outcomes.

#### Scenario: runtime identity is not pid-only
- **WHEN** runtime stability records or compares a Codex process identity
- **THEN** the identity MUST use a monotonic runtime generation or a composite identity such as `pid + startedAt`
- **AND** pid alone MUST NOT be used as the generation boundary because process ids can be reused across platforms

#### Scenario: executable paths are resolved with platform APIs
- **WHEN** the system resolves Codex executable, workspace, log, storage, or diagnostic paths
- **THEN** it MUST use Rust/Tauri path APIs, `PathBuf`, app path resolvers, or existing storage helpers
- **AND** it MUST NOT build correctness-critical paths by manually concatenating `/` or `\` separators

#### Scenario: spawn arguments are not shell-quoted strings
- **WHEN** the system starts or restarts a Codex runtime process
- **THEN** command arguments MUST be passed as structured args to the process API
- **AND** lifecycle correctness MUST NOT depend on shell-specific quoting, escaping, or Unix-only wrapper commands

#### Scenario: shutdown reason is normalized
- **WHEN** a Codex runtime ends through manual shutdown, stdout eof, process exit, watchdog settlement, or platform-specific termination
- **THEN** backend diagnostics MUST map that event to a platform-neutral shutdown reason
- **AND** frontend lifecycle decisions MUST consume the normalized reason rather than parsing OS-specific error strings
