# codex-conversation-liveness Specification

## Purpose

Defines the codex-conversation-liveness behavior contract, covering Codex Conversation Liveness MUST Separate Draft, Identity, Runtime, And Turn State.
## Requirements
### Requirement: Codex Conversation Liveness MUST Separate Draft, Identity, Runtime, And Turn State

Codex conversation liveness MUST be modeled as separate draft, thread identity, runtime generation, and foreground turn states rather than treating a `threadId` or runtime-ready result as complete conversation health.

#### Scenario: runtime readiness does not prove thread identity readiness
- **WHEN** a Codex runtime reconnect or `ensureRuntimeReady` action succeeds
- **AND** the active `threadId` cannot be verified by `thread/resume`, `turn/start`, alias resolution, or an equivalent identity check
- **THEN** the system MUST keep thread identity liveness in `stale`, `unrecoverable`, or equivalent non-ready state
- **AND** the UI MUST NOT claim the old conversation has been restored solely because the runtime is ready

#### Scenario: runtime generation guards stale lifecycle updates
- **WHEN** a Codex runtime is replaced, reacquired, or restarted for the same workspace
- **THEN** the system MUST associate subsequent liveness diagnostics with a distinguishable runtime generation or equivalent session identity
- **AND** late events or shutdown diagnostics from an older runtime generation MUST NOT overwrite the active generation's conversation state

#### Scenario: turn liveness settles independently from thread liveness
- **WHEN** a Codex foreground turn stops receiving progress evidence
- **THEN** the system MUST evaluate that turn's liveness using bounded turn-level evidence
- **AND** the thread identity MUST NOT be marked recovered, replaced, or unrecoverable merely because the turn entered stalled state

### Requirement: First-Turn Codex Drafts MUST Be Disposable Until A Turn Is Accepted

A Codex conversation created before any user turn is accepted MUST be treated as a disposable draft, even if the implementation has already created a provisional backend `threadId`.

#### Scenario: idle before first send falls back to fresh create and send
- **WHEN** the user creates a new Codex conversation
- **AND** no user turn has been accepted for that conversation
- **AND** the user waits long enough that the provisional `threadId` becomes unavailable or returns `thread not found`
- **THEN** the first user send MUST create or acquire a fresh Codex thread and send the user prompt there
- **AND** the system MUST NOT show a stale old-session recovery card as the primary path for that first prompt

#### Scenario: empty draft fresh fallback is not presented as old-session recovery
- **WHEN** a first-turn Codex draft falls back to a fresh thread
- **THEN** lifecycle state MUST identify the fresh thread as the active target
- **AND** user-visible copy MUST express fresh continuation or draft replacement rather than restored old conversation continuity

#### Scenario: accepted first turn promotes draft to durable identity
- **WHEN** Codex accepts the first user turn for a draft conversation
- **THEN** the conversation MUST promote the resulting thread identity to durable active identity
- **AND** later failures MUST follow stale-thread, runtime-ended, or stalled-turn recovery semantics instead of disposable draft semantics

### Requirement: Draft And Durable Boundaries MUST Use Canonical Activity Facts

Codex liveness MUST decide draft replacement from canonical accepted-turn and durable-activity facts, not from a frontend-only guess.

#### Scenario: accepted-turn fact promotes durable-safe behavior
- **WHEN** the canonical lifecycle fact says a Codex identity has accepted a user turn or has durable activity
- **THEN** the identity MUST be treated as durable for recovery purposes
- **AND** the system MUST NOT silently replace it as an empty draft even if the current frontend item list is empty, stale, filtered, or not yet loaded

#### Scenario: unknown accepted-turn fact defaults durable-safe
- **WHEN** the system cannot determine whether a Codex identity has accepted user work
- **AND** there is no current pre-accept first-send user intent being retried
- **THEN** the identity MUST enter a durable-safe recovery path such as verify, rebind, explicit fresh continuation, or failed retryable state
- **AND** the system MUST NOT use automatic first-turn draft replacement until the authoritative fact is known to be false

#### Scenario: lost draft marker during current first send can fresh continue
- **WHEN** the accepted-turn marker is unavailable because the local draft state was lost or reloaded
- **AND** the current user prompt has not received a `turn/start` acceptance
- **AND** local durable activity facts remain absent except for the current optimistic user intent
- **AND** the identity failure is `thread not found`, `[session_not_found]`, `session not found`, or equivalent missing-thread evidence rather than a malformed id
- **THEN** the system MAY treat the source as a local first-send draft and create a fresh Codex thread
- **AND** it MUST replay the current prompt visibly in the fresh thread without recording the stale draft as durable activity

#### Scenario: frontend local items can only narrow obvious false state
- **WHEN** frontend local items show no user, assistant, tool, approval, or persisted durable activity
- **AND** the canonical accepted-turn fact is available and false
- **THEN** the system MAY treat the conversation as disposable draft
- **AND** diagnostics MUST record that draft replacement was based on an authoritative no-accepted-turn fact

### Requirement: Codex Recovery Outcomes MUST Be Classified

Codex recovery actions MUST return and consume classified outcomes so UI, runtime, and messaging paths can make consistent decisions.

#### Scenario: verified rebind reports rebound
- **WHEN** recovery verifies the same thread or a canonical replacement that preserves old conversation identity
- **THEN** the outcome MUST be classified as `rebound`
- **AND** duplicate user prompt suppression MAY remain enabled for resend paths

#### Scenario: explicit new target reports fresh
- **WHEN** recovery cannot verify old identity but creates a new Codex thread for user continuation
- **THEN** the outcome MUST be classified as `fresh`
- **AND** resend paths MUST visibly send or render the replayed user prompt in the fresh thread

#### Scenario: no usable target reports failed
- **WHEN** recovery cannot verify old identity and cannot create a fresh continuation target
- **THEN** the outcome MUST be classified as `failed`
- **AND** the current surface MUST remain visibly failed or retryable rather than silently clearing the recovery affordance

#### Scenario: user stop after liveness stall reports abandoned
- **WHEN** the user stops a Codex turn that has already entered stalled or dead-recoverable liveness state
- **THEN** the outcome MUST be classified as `abandoned` or an equivalent terminal state
- **AND** subsequent sends MUST NOT remain blocked by the abandoned turn's in-flight state

### Requirement: Codex Liveness Diagnostics MUST Be Correlatable

Every Codex liveness failure covered by this capability MUST leave enough structured evidence to correlate frontend conversation state with backend runtime state.

#### Scenario: liveness failure captures core dimensions
- **WHEN** Codex liveness transitions to stale, stalled, runtime-ended, failed, fresh, or abandoned
- **THEN** diagnostics MUST preserve `workspaceId`, engine, active thread identity when available, runtime generation when available, turn id when available, liveness stage, and recovery outcome
- **AND** these fields MUST be visible through existing debug, runtime log, runtime pool, or thread diagnostic surfaces without requiring a new incident store

#### Scenario: first-turn draft fallback records draft context
- **WHEN** an empty Codex draft falls back to a fresh thread on first send
- **THEN** diagnostics MUST indicate that no accepted user turn existed for the old draft identity
- **AND** operators MUST be able to distinguish draft replacement from stale durable conversation recovery

#### Scenario: long stall records last progress evidence age
- **WHEN** a Codex turn enters stalled or dead-recoverable state due to missing progress evidence
- **THEN** diagnostics MUST include the last known progress signal or last event timestamp when available
- **AND** operators MUST be able to distinguish quiet protected work from bounded liveness failure

### Requirement: Codex Stalled Or Abandoned Turn MUST Not Revive From Stale Progress Evidence

Codex conversation liveness MUST treat stalled or abandoned turn settlement as terminal for that turn's UI processing state unless a verified successor turn identity is active.

#### Scenario: stale progress after settlement cannot restore generating state
- **WHEN** a Codex turn has been settled as stalled, dead-recoverable, abandoned, interrupted, failed, or equivalent terminal liveness state
- **AND** stale progress evidence later arrives for the same settled turn identity
- **THEN** the system MUST NOT restore normal generating or processing state for that old turn
- **AND** diagnostics MUST identify the evidence as stale late progress

#### Scenario: verified successor identity can continue
- **WHEN** a Codex turn has been settled as stalled
- **AND** the user starts or recovers into a verified successor turn identity
- **THEN** realtime evidence for the successor identity MUST be allowed to update the conversation
- **AND** the old stalled identity MUST remain quarantined from mutating active state

### Requirement: Codex Silent Turn Suspicion MUST Remain Non-Terminal Until Authoritative Settlement

Codex conversation liveness MUST model frontend-observed silent turns as non-terminal suspicion until an authoritative runtime, backend, or user action settles the turn.

#### Scenario: frontend silence does not terminalize active turn
- **WHEN** a Codex foreground turn enters `suspected-silent` or an equivalent soft state because the frontend has not observed progress within the configured no-progress window
- **THEN** the turn MUST remain non-terminal
- **AND** active turn identity MUST remain eligible to consume matching realtime progress
- **AND** the system MUST NOT emit terminal external settlement for that turn solely from the frontend suspicion

#### Scenario: backend terminal event overrides suspicion
- **WHEN** a Codex foreground turn is in `suspected-silent`
- **AND** backend emits `turn/completed`, `turn/error`, `turn/stalled`, `runtime/ended`, or an equivalent authoritative terminal event for the same active turn identity
- **THEN** lifecycle MUST settle the turn according to that authoritative event
- **AND** the suspected state MUST be cleared or superseded by the terminal state

#### Scenario: user stop after suspicion settles deterministically
- **WHEN** the user stops a Codex turn that is in `suspected-silent`
- **THEN** the turn MUST settle as abandoned, interrupted, failed, or an equivalent terminal state
- **AND** subsequent sends MUST NOT remain blocked by that old suspected turn

### Requirement: Codex Progress Evidence MUST Include Non-Text Runtime Activity

Codex turn liveness MUST treat normalized runtime activity as progress evidence even when no assistant text delta is visible.

#### Scenario: heartbeat refreshes liveness
- **WHEN** a `processing/heartbeat` or equivalent runtime heartbeat is correlated to the current Codex thread, runtime generation, and active turn when available
- **THEN** the system MUST treat it as progress evidence
- **AND** the no-progress window MUST be measured from that heartbeat

#### Scenario: active status refreshes liveness
- **WHEN** `thread/status/changed`, runtime status, or equivalent event reports active, running, processing, or alive state for the current Codex thread and runtime generation
- **THEN** the system MUST treat it as progress evidence
- **AND** the turn MUST NOT enter suspected-silent based on an older frontend timestamp

#### Scenario: item and tool state refresh liveness
- **WHEN** an item, command, tool, file-change, approval, request-user-input, token usage, or equivalent structured runtime activity changes for the active Codex turn
- **THEN** the system MUST treat that change as progress evidence
- **AND** liveness diagnostics MUST record the progress source when available

### Requirement: Codex Soft-Suspect UI MUST Be Low-Interruption And Self-Recovering

Codex soft-suspect state MUST inform the user without requiring manual debug interaction and MUST recover automatically when matching progress arrives.

#### Scenario: suspected silence shows passive status
- **WHEN** a Codex foreground turn enters `suspected-silent`
- **THEN** UI MUST show passive waiting copy or equivalent low-interruption status
- **AND** UI MUST keep Stop available
- **AND** UI MUST NOT require the user to open a debug panel to continue normal monitoring

#### Scenario: matching late progress clears passive status
- **WHEN** UI is showing suspected-silent status for a Codex turn
- **AND** matching realtime progress arrives for the active turn identity
- **THEN** UI MUST clear suspected-silent status automatically
- **AND** UI MUST return to normal waiting or ingress processing presentation

### Requirement: Codex Silent Liveness Diagnostics MUST Distinguish Suspicion From Settlement

Codex liveness diagnostics MUST preserve the difference between frontend-observed suspected silence and authoritative stalled settlement.

#### Scenario: frontend suspicion records non-terminal source
- **WHEN** a Codex turn enters suspected-silent due to frontend no-progress observation
- **THEN** diagnostics MUST record source `frontend-no-progress-suspected` or an equivalent non-terminal source
- **AND** diagnostics MUST include last progress evidence source and age when available

#### Scenario: authoritative stalled records terminal source
- **WHEN** a Codex turn enters stalled, dead-recoverable, abandoned, runtime-ended, or equivalent terminal liveness state
- **THEN** diagnostics MUST record the authoritative source such as `backend-authoritative-stalled`, `runtime-ended`, or `user-abandoned`
- **AND** diagnostics MUST NOT conflate that source with frontend-only suspected silence

#### Scenario: recovery records suspicion duration
- **WHEN** a suspected-silent Codex turn later receives matching progress or terminal settlement
- **THEN** diagnostics MUST preserve that the turn was previously suspected
- **AND** diagnostics SHOULD include the suspected duration when available

### Requirement: Mature Codex Streaming Liveness MUST Survive Refactors

Codex streaming and liveness handling are considered mature. Refactors MUST preserve the separation between realtime progress evidence, frontend suspicion, authoritative terminal settlement, and history reconciliation.

#### Scenario: refactor preserves non-terminal suspicion
- **WHEN** developers refactor Codex realtime event handling, conversation lifecycle reducers, liveness timers, runtime diagnostics, or history reconciliation
- **THEN** frontend-observed silence MUST remain a non-terminal `suspected-silent` style state
- **AND** only authoritative runtime, backend, user stop, or terminal turn evidence MAY settle the active turn

#### Scenario: non-text activity remains progress evidence
- **WHEN** a Codex turn emits runtime heartbeat, thread status, tool progress, command output, file-change activity, approval state, token usage, request-user-input, or equivalent structured activity
- **THEN** liveness MUST treat that activity as progress evidence even if assistant text has not changed
- **AND** refactors MUST NOT regress to a text-delta-only definition of progress

#### Scenario: history reconciliation is not required for live convergence
- **WHEN** realtime Codex events have enough evidence to update active turn state or visible assistant/tool rows
- **THEN** the UI MUST converge through the realtime path first
- **AND** history reconciliation MUST remain a validation or replay aid rather than the only path that clears loading, suspected silence, duplicate assistant rows, or final visible state

#### Scenario: settled turns stay quarantined
- **WHEN** a Codex turn has settled as stalled, abandoned, interrupted, failed, or completed
- **THEN** late stale progress for that old turn identity MUST remain quarantined
- **AND** refactors MUST NOT let stale evidence revive processing state unless a verified successor turn identity is active
