## ADDED Requirements

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
