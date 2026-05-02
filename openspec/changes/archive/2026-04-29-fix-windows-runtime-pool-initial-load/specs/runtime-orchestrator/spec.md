## ADDED Requirements

### Requirement: Runtime panel bootstrap MUST preserve launch-time metadata-only restore semantics
The Runtime Orchestrator MUST allow a user-initiated runtime panel bootstrap to request runtime readiness for eligible workspaces without changing the application launch restore policy.

#### Scenario: launch restore still avoids bulk runtime spawn
- **WHEN** the application launches with metadata-only runtime restore enabled
- **THEN** workspace and thread metadata restore MUST NOT bulk-spawn managed runtimes for every visible workspace
- **AND** the runtime panel bootstrap contract MUST NOT change that launch-time behavior

#### Scenario: runtime panel entry is an explicit readiness source
- **WHEN** the user explicitly opens the runtime pool console
- **AND** the client identifies connected workspaces that are eligible for runtime visibility using currently available workspace metadata
- **AND** the initial runtime pool snapshot did not already contain runtime rows
- **THEN** the system MUST allow the client to request runtime readiness through the existing orchestrator acquisition path
- **AND** the orchestrator MUST treat that request as a bounded explicit source rather than launch-time bulk restore

#### Scenario: non-empty snapshot does not request readiness
- **WHEN** the runtime pool console opens on any supported platform
- **AND** the initial runtime pool snapshot already contains one or more runtime rows
- **THEN** the client MUST NOT request runtime readiness solely because the panel opened
- **AND** the orchestrator MUST NOT receive an additional runtime-panel bootstrap request for that initial render

#### Scenario: repeated runtime panel bootstrap remains idempotent
- **WHEN** multiple runtime panel bootstrap attempts target the same engine-workspace pair while startup is already in progress
- **THEN** the orchestrator MUST reuse the existing active runtime or guarded in-flight acquire
- **AND** it MUST NOT spawn a duplicate active runtime for the same engine-workspace pair

#### Scenario: runtime panel bootstrap source is diagnosable
- **WHEN** runtime panel bootstrap initiates or joins runtime acquisition
- **THEN** any runtime row or diagnostic metadata that records recovery source MUST identify the source as runtime-panel bootstrap or an equivalent explicit runtime-console source
- **AND** this diagnostic source MUST NOT be required for the runtime readiness request to remain idempotent
