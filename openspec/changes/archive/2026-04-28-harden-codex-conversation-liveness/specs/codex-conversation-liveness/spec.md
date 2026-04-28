## ADDED Requirements

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
