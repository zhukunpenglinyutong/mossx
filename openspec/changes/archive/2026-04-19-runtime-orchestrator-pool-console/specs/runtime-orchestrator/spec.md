## ADDED Requirements

### Requirement: Runtime Orchestrator MUST manage workspace runtimes as budgeted resources
The system MUST manage persistent workspace runtimes through a unified Runtime Orchestrator instead of implicitly binding runtime existence to workspace visibility or restore state.

This requirement applies to `Codex` and `Claude Code` managed runtimes in the first release of the orchestrator contract.

#### Scenario: non-active visible workspace does not force runtime spawn
- **WHEN** the client restores sidebar-visible workspaces on startup
- **THEN** the system MUST restore workspace/thread metadata without automatically spawning a persistent runtime for every visible workspace

#### Scenario: active turn acquires managed runtime
- **WHEN** a workspace starts a send/resume/new-thread action that requires a managed runtime
- **THEN** the Runtime Orchestrator MUST ensure a runtime is available for that `(engine, workspace)` pair before execution proceeds

### Requirement: Runtime Orchestrator MUST enforce unique active runtime per engine-workspace pair
The system MUST treat `(engine, workspace)` as the unique identity for a managed runtime instance and MUST prevent duplicate active runtimes for the same pair.

#### Scenario: repeated ensure is idempotent
- **WHEN** the client issues repeated `connect` or `ensureRuntimeReady` requests for the same `(engine, workspace)`
- **THEN** the system MUST reuse the existing active runtime or the existing in-flight startup instead of spawning a second runtime

#### Scenario: replacement stops old runtime after swap
- **WHEN** the system replaces an existing managed runtime for the same `(engine, workspace)`
- **THEN** it MUST complete startup for the new runtime, swap the registry binding, and stop the old runtime through the managed shutdown path

### Requirement: Runtime Orchestrator MUST support pooled lifecycle tiers
The system MUST classify managed runtimes into `Hot`, `Warm`, `Cold`, and `Pinned` lifecycle tiers and MUST enforce configurable runtime budgets.

#### Scenario: warm runtime is cooled after ttl expiry
- **WHEN** a managed runtime is no longer needed for an active turn and no lease source remains except warm retention
- **THEN** the system MUST transition that runtime to `GracefulIdle` and release it after the configured warm TTL expires

#### Scenario: budget overflow evicts lowest-priority runtime
- **WHEN** the number of managed runtimes exceeds the configured budget for an engine
- **THEN** the system MUST evict the lowest-priority runtime that has no active lease according to pool tier and recency rules

### Requirement: Runtime lifecycle state MUST be explicit and observable
The system MUST expose explicit runtime lifecycle state for every managed runtime instance.

#### Scenario: runtime snapshot includes lifecycle state and lease source
- **WHEN** the client requests a runtime pool snapshot
- **THEN** each managed runtime entry MUST include lifecycle state, lease source, last-used timestamp, and engine/workspace identity

#### Scenario: startup failure is represented as failed state
- **WHEN** runtime startup fails after the system begins acquiring a managed runtime
- **THEN** the runtime entry MUST transition to `Failed` with diagnosable error details instead of remaining implicitly connected

### Requirement: Runtime eviction MUST be lease-gated
The system MUST prevent runtime eviction while any turn lease or stream lease is active.

#### Scenario: long stream is protected from ttl eviction
- **WHEN** a runtime is emitting stream deltas for an active turn and the elapsed time exceeds warm TTL
- **THEN** eviction MUST be blocked until stream lease and turn lease are both released

#### Scenario: reconcile loop skips lease-active candidate
- **WHEN** the reconcile loop scans runtime candidates under budget pressure
- **THEN** runtimes with any active lease MUST be excluded from eviction candidates

### Requirement: Reconciler MUST NOT directly terminate runtime processes
The reconcile loop MUST only mark candidates and MUST delegate process termination to the lifecycle coordinator.

#### Scenario: reconcile produces candidate only
- **WHEN** a runtime meets budget/ttl eviction criteria
- **THEN** reconcile MUST record an evict candidate marker and MUST NOT invoke direct stop/kill

#### Scenario: coordinator performs termination with pre-stop recheck
- **WHEN** lifecycle coordinator starts termination for an evict candidate
- **THEN** it MUST re-check active leases before stop and abort termination when lease becomes active

### Requirement: Managed runtime shutdown MUST be tree-safe and unified across exit paths
The system MUST use a unified shutdown path for managed runtimes on reconnect, workspace removal, app exit, and launch-time orphan cleanup.

#### Scenario: app exit drains managed runtimes
- **WHEN** the application begins shutdown
- **THEN** the system MUST stop accepting new runtime acquisitions and drain all managed runtimes through the shared shutdown coordinator

#### Scenario: launch-time orphan sweep cleans stale managed runtime
- **WHEN** the application starts and finds a previously recorded managed runtime that was not cleaned up
- **THEN** the system MUST classify it as an orphan candidate and attempt cleanup before marking startup diagnostics complete

### Requirement: Windows termination MUST preserve process-tree semantics for managed runtimes
The system MUST terminate managed runtimes on Windows using process-tree-safe semantics that account for wrapper and child processes.

#### Scenario: cmd-wrapper runtime is terminated as a tree
- **WHEN** a managed runtime launched from a Windows wrapper chain (`.cmd`, `cmd.exe`, `node`, sandbox) is stopped
- **THEN** the system MUST attempt process-tree termination semantics for the full runtime tree instead of only killing the root handle

#### Scenario: termination result remains diagnosable after tree kill failure
- **WHEN** process-tree termination fails or partially fails on Windows
- **THEN** the system MUST retain runtime diagnostics including pid, wrapper kind, and failure outcome for later inspection

### Requirement: Startup-time node processes MUST be attributable
The system MUST expose enough diagnostics to explain startup-time `node` processes as managed runtime, child resume/runtime helper, or orphan residue.

#### Scenario: startup diagnostics classify visible node processes
- **WHEN** the application finishes startup diagnostics on a machine where multiple `node` processes are visible
- **THEN** the system MUST be able to classify each known startup-time process into a runtime source category instead of leaving it as an unknown process burst
