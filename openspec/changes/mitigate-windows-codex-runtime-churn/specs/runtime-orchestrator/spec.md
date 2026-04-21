## MODIFIED Requirements

### Requirement: Runtime Orchestrator MUST enforce unique active runtime per engine-workspace pair

The system MUST treat `(engine, workspace)` as the unique identity for a managed runtime instance and MUST prevent duplicate active runtimes for the same pair, including concurrent automatic recovery sources and replacement overlap.

#### Scenario: repeated ensure is idempotent

- **WHEN** the client issues repeated `connect` or `ensureRuntimeReady` requests for the same `(engine, workspace)`
- **THEN** the system MUST reuse the existing active runtime or the existing in-flight startup instead of spawning a second runtime

#### Scenario: concurrent automatic recovery sources reuse one guarded acquire

- **WHEN** multiple automatic recovery sources target the same `(engine, workspace)` while no healthy runtime is ready
- **THEN** the orchestrator MUST expose one in-flight guarded acquire for that pair
- **AND** later callers MUST join that acquire as waiters or receive a guarded degraded outcome instead of creating a parallel runtime

#### Scenario: replacement stops old runtime after swap

- **WHEN** the system replaces an existing managed runtime for the same `(engine, workspace)`
- **THEN** it MUST complete startup for the new runtime, swap the registry binding, and stop the old runtime through the managed shutdown path

#### Scenario: replacement overlap is capped to one stopping predecessor

- **WHEN** a replacement is already in progress for a managed runtime
- **THEN** the orchestrator MUST allow at most one active successor and one stopping predecessor for that `(engine, workspace)`
- **AND** further automatic recovery sources MUST NOT start an additional replacement until the predecessor stop path has settled or timed out

### Requirement: Runtime lifecycle state MUST be explicit and observable

The system MUST expose explicit runtime lifecycle state for every managed runtime instance, including startup-vs-health classification and replacement diagnostics needed to understand Windows churn behavior.

#### Scenario: runtime snapshot includes lifecycle state and lease source

- **WHEN** the client requests a runtime pool snapshot
- **THEN** each managed runtime entry MUST include lifecycle state, lease source, last-used timestamp, and engine/workspace identity

#### Scenario: startup failure is represented as failed state

- **WHEN** runtime startup fails after the system begins acquiring a managed runtime
- **THEN** the runtime entry MUST transition to `Failed` with diagnosable error details instead of remaining implicitly connected

#### Scenario: startup-pending remains distinct from suspect-stale

- **WHEN** a managed runtime has begun startup but has not yet established a healthy ready state
- **THEN** the observable lifecycle state MUST distinguish that startup-pending condition from a post-ready stale-session suspicion
- **AND** downstream recovery logic MUST be able to tell whether a timeout happened before readiness or after health had previously succeeded

#### Scenario: replacement diagnostics expose stopping predecessor state

- **WHEN** a managed runtime has already swapped to a new active successor while an old predecessor is still stopping
- **THEN** the observable snapshot MUST preserve that stopping predecessor condition and the last replacement reason
- **AND** operators MUST be able to tell that the extra process tree belongs to bounded replacement overlap rather than an unbounded duplicate spawn
