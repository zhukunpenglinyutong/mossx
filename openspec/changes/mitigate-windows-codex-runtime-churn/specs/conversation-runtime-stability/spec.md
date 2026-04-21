## MODIFIED Requirements

### Requirement: Runtime Recovery Guard MUST Bound Automatic Reacquire And Reconnect

For each `workspace + engine` pair, the host runtime MUST apply a bounded, source-aware recovery guard so automatic session reacquire, reconnect, and runtime-dependent retry paths cannot form an unbounded storm loop.

#### Scenario: concurrent automatic recovery sources collapse into a single guarded leader

- **WHEN** multiple automatic sources such as thread list refresh, workspace restore, focus refresh, or implicit reconnect target the same `workspace + engine`
- **THEN** the system MUST elect at most one in-flight guarded recovery leader for that pair
- **AND** all other automatic sources MUST reuse the leader result, wait, or receive a guarded degraded outcome instead of spawning another recovery attempt

#### Scenario: repeated recovery failures enter cooldown quarantine

- **WHEN** automatic runtime reacquire or reconnect fails repeatedly for the same `workspace + engine`
- **THEN** the system MUST stop unbounded immediate retries after the configured recovery budget is exhausted
- **AND** the pair MUST enter a cooldown or quarantine state before another automatic recovery attempt is allowed

#### Scenario: startup pending does not recursively trigger a second automatic reconnect

- **WHEN** the runtime for a `workspace + engine` pair is already in a startup-pending guarded attempt
- **THEN** timeout or degraded reads from other automatic sources MUST NOT begin a second automatic reconnect for that pair
- **AND** those sources MUST surface a pending-start or equivalent guarded degraded state instead

#### Scenario: successful recovery clears degraded guard state

- **WHEN** a guarded `workspace + engine` pair completes a successful health probe or runtime-dependent action after previous failures
- **THEN** the system MUST clear the accumulated automatic recovery failure state
- **AND** subsequent operations MUST resume from a healthy recovery budget

### Requirement: Last-Good Continuity MUST Survive Partial Runtime-Dependent Read Failures

Conversation list, reopen, and history surfaces MUST preserve the last successful visible snapshot when runtime-dependent reads fail partially, while explicitly marking the surface as degraded.

#### Scenario: thread list fallback keeps last visible snapshot

- **WHEN** a thread list refresh fails after the client already has a previously successful visible list
- **THEN** the system MUST keep the last successful list available to the user
- **AND** the surface MUST indicate that the current list is degraded or partially stale

#### Scenario: thread list waiter path preserves last-good snapshot while leader recovers

- **WHEN** a thread list refresh arrives while another guarded automatic recovery attempt is already leading for the same `workspace + engine`
- **THEN** the thread list surface MUST preserve the last successful visible snapshot instead of clearing or duplicating the recovery attempt
- **AND** the surface MUST remain explicitly diagnosable as waiting on guarded recovery

#### Scenario: startup-pending list timeout does not masquerade as stale disconnect

- **WHEN** a thread list live read times out while the same `workspace + engine` is still inside a startup-pending guarded attempt
- **THEN** the system MUST classify that read as startup-related degraded continuity rather than a confirmed stale disconnect
- **AND** the host MUST NOT escalate that timeout into a new automatic reconnect storm

#### Scenario: history reload failure does not masquerade as empty truth

- **WHEN** reopen or history reload encounters partial source or root failure after a previous successful load
- **THEN** the system MUST preserve the last successful visible history snapshot
- **AND** the system MUST NOT silently replace that state with an unexplained empty result

### Requirement: Stability Evidence MUST Be Correlatable Across Existing Diagnostics Surfaces

Runtime failures covered by this capability MUST leave enough correlated evidence in existing diagnostics surfaces to support issue triage and manual debugging.

#### Scenario: runtime failure writes correlated runtime evidence

- **WHEN** a runtime-dependent action fails under the stability contract
- **THEN** runtime diagnostics MUST record the relevant `workspaceId`, `engine`, action type, and recovery state
- **AND** the evidence MUST be queryable through the existing runtime log or equivalent diagnostics surface

#### Scenario: guarded recovery evidence preserves source and guard outcome

- **WHEN** an automatic recovery attempt is started, waited on, cooled down, or quarantined
- **THEN** the correlated evidence MUST preserve the triggering source, guard state, and whether the caller became leader or waiter
- **AND** operators MUST be able to distinguish automatic storm suppression from ordinary runtime failure

#### Scenario: thread-facing diagnostics preserve the same failure dimensions

- **WHEN** the frontend records thread/session or renderer diagnostics for the same failure chain
- **THEN** those diagnostics MUST preserve matching correlation dimensions such as workspace, thread, action identity, or guarded degraded source when available
- **AND** operators MUST be able to relate frontend and runtime evidence without inventing a second incident storage system
