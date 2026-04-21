## MODIFIED Requirements

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
