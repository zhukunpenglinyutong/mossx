## MODIFIED Requirements

### Requirement: Last-Good Continuity MUST Survive Partial Runtime-Dependent Read Failures

Conversation list, reopen, and history surfaces MUST preserve the last successful visible snapshot when runtime-dependent reads fail partially, omit a previously visible subset, or otherwise return a degraded partial result, while explicitly marking the surface as degraded.

#### Scenario: thread list partial omission preserves last visible subset
- **WHEN** a thread list refresh returns a non-empty result
- **AND** the result omits one or more previously visible entries from the same surface
- **AND** the refresh is classified as degraded, partial, waiter-bound, or equivalent non-authoritative subset result
- **THEN** the system MUST preserve the omitted entries from the last successful visible snapshot
- **AND** the surface MUST indicate that the current list is degraded or partially stale

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
