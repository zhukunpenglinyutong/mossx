## MODIFIED Requirements

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
