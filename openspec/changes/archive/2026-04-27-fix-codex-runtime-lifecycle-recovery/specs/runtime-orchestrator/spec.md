## ADDED Requirements

### Requirement: Managed Shutdown Source MUST Be Explicit And Reuse-Safe

The Runtime Orchestrator MUST retain explicit shutdown-source attribution for managed Codex runtime stop paths so reuse, replacement, diagnostics, and recovery can distinguish expected lifecycle cleanup from user-visible interruption.

#### Scenario: shutdown source is recorded before process termination

- **WHEN** the system stops a Codex managed runtime through Runtime Pool close, manual release, replacement cleanup, stale-session cleanup, settings restart, idle eviction, or app exit
- **THEN** the runtime session MUST be marked with a source-specific shutdown attribution before process termination begins
- **AND** later EOF or process-exit diagnostics MUST be able to include that source attribution

#### Scenario: stopping runtime is rejected as reusable foreground target

- **WHEN** a runtime has already been marked for source-specific shutdown
- **AND** a new foreground action needs a Codex runtime for the same workspace
- **THEN** the orchestrator MUST treat the stopping runtime as non-reusable
- **AND** the action MUST acquire or await a fresh successor instead of binding new foreground work to the stopping runtime

#### Scenario: internal replacement cleanup does not clear successor lifecycle evidence

- **WHEN** an old Codex runtime is stopped after a replacement successor has been registered
- **THEN** cleanup of the predecessor MUST NOT erase the successor row's ready state, replacement reason, or stopping-predecessor diagnostics
- **AND** predecessor runtime-ended handling MUST NOT use the successor row's active-work signal to emit a thread-facing diagnostic
- **AND** the stopping-predecessor marker MUST clear only after the predecessor stop path settles or times out

### Requirement: Runtime Pin Intent MUST Survive Row Recreation

The Runtime Orchestrator MUST preserve user pin intent for a `(engine, workspace)` pair independently from the transient runtime row lifecycle.

#### Scenario: pin survives runtime row removal

- **WHEN** a user pins a Codex runtime for a workspace
- **AND** the current runtime row is later removed because the process was stopped or recreated
- **THEN** the orchestrator MUST retain the pin intent for that `(engine, workspace)` pair
- **AND** the next runtime row for the same pair MUST be hydrated as pinned

#### Scenario: unpin clears future row hydration

- **WHEN** a user unpins a `(engine, workspace)` pair
- **THEN** subsequent runtime row creation for that pair MUST NOT reapply the old pin intent
