# conversation-runtime-stability Specification

## Purpose

Define host conversation runtime stability guarantees for bounded recovery, recoverable diagnostics, last-good continuity, and correlatable failure evidence.

## Requirements

### Requirement: Runtime Recovery Guard MUST Bound Automatic Reacquire And Reconnect

For each `workspace + engine` pair, the host runtime MUST apply a bounded recovery guard so automatic session reacquire, reconnect, and runtime-dependent retry paths cannot form an unbounded storm loop.

#### Scenario: repeated recovery failures enter cooldown quarantine

- **WHEN** automatic runtime reacquire or reconnect fails repeatedly for the same `workspace + engine`
- **THEN** the system MUST stop unbounded immediate retries after the configured recovery budget is exhausted
- **AND** the pair MUST enter a cooldown or quarantine state before another automatic recovery attempt is allowed

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

### Requirement: Last-Good Continuity MUST Survive Partial Runtime-Dependent Read Failures

Conversation list, reopen, and history surfaces MUST preserve the last successful visible snapshot when runtime-dependent reads fail partially, while explicitly marking the surface as degraded.

#### Scenario: thread list fallback keeps last visible snapshot

- **WHEN** a thread list refresh fails after the client already has a previously successful visible list
- **THEN** the system MUST keep the last successful list available to the user
- **AND** the surface MUST indicate that the current list is degraded or partially stale

#### Scenario: history reload failure does not masquerade as empty truth

- **WHEN** reopen or history reload encounters partial source or root failure after a previous successful load
- **THEN** the system MUST preserve the last successful visible history snapshot
- **AND** the system MUST NOT silently replace that state with an unexplained empty result

### Requirement: New Runtime-Required Actions MUST Start From A Fresh Guarded Attempt

When the user initiates a new runtime-required action after a prior runtime failure, the system MUST ensure that the new attempt does not inherit an unbounded retry loop or stale in-flight recovery state.

#### Scenario: new thread after prior failure starts a fresh acquisition cycle

- **WHEN** the user starts a new thread after the same `workspace + engine` previously entered degraded or quarantined recovery state
- **THEN** the system MUST begin a fresh guarded runtime acquisition attempt for that user action
- **AND** the new attempt MUST NOT reuse a stale automatic retry loop that was already exhausted

#### Scenario: explicit user retry can reopen recovery after quarantine

- **WHEN** a `workspace + engine` pair is currently quarantined and the user explicitly retries or reconnects
- **THEN** the system MUST allow a fresh guarded recovery cycle to start
- **AND** the system MUST keep the retry sequence bounded by the same recovery contract

### Requirement: Stability Evidence MUST Be Correlatable Across Existing Diagnostics Surfaces

Runtime failures covered by this capability MUST leave enough correlated evidence in existing diagnostics surfaces to support issue triage and manual debugging.

#### Scenario: runtime failure writes correlated runtime evidence

- **WHEN** a runtime-dependent action fails under the stability contract
- **THEN** runtime diagnostics MUST record the relevant `workspaceId`, `engine`, action type, and recovery state
- **AND** the evidence MUST be queryable through the existing runtime log or equivalent diagnostics surface

#### Scenario: runtime-ended diagnostics preserve exit metadata

- **WHEN** a managed runtime ends unexpectedly after initialization
- **THEN** the correlated evidence MUST preserve the normalized reason code plus any available exit code, exit signal, or pending-request count
- **AND** operators MUST be able to tell whether the runtime ended during active-work protection or idle retention

#### Scenario: thread-facing diagnostics preserve the same failure dimensions

- **WHEN** the frontend records thread/session or renderer diagnostics for the same failure chain
- **THEN** those diagnostics MUST preserve matching correlation dimensions such as workspace, thread, or action identity when available
- **AND** operators MUST be able to relate frontend and runtime evidence without inventing a second incident storage system
