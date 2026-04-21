## MODIFIED Requirements

### Requirement: Runtime pool console MUST surface process diagnostics for managed runtimes
The runtime pool console MUST expose the key process diagnostics needed to understand why a runtime exists, whether it is protected by active work or only retained while idle, how it was launched, why it entered degraded liveness, and why it ended or remains retained.

#### Scenario: runtime row includes process identity
- **WHEN** the runtime pool console renders a managed runtime row
- **THEN** the row MUST include pid, wrapper kind, started time, and last-used time

#### Scenario: runtime row distinguishes active lease from idle retention

- **WHEN** the runtime pool console renders a managed runtime row
- **THEN** the row MUST expose active turn or stream lease source information separately from idle retention state such as pinned or warm
- **AND** the user MUST be able to tell whether the runtime is protected by active work or only by retention policy

#### Scenario: runtime row shows active-work protection as the primary survival reason

- **WHEN** a managed runtime has both active work and warm or pinned retention flags
- **THEN** the console MUST present active-work protection as the primary reason the runtime cannot be evicted
- **AND** warm or pinned state MUST appear as secondary idle-retention metadata

#### Scenario: runtime row distinguishes silent busy from true idle

- **WHEN** a runtime has no current turn or stream lease
- **AND** the same `workspace + engine` still has an unfinished foreground turn in `startup-pending`, `silent-busy`, `resume-pending`, or equivalent stalled recovery state
- **THEN** the runtime pool console MUST expose that existing runtime row as stalled foreground work rather than plain idle
- **AND** the console MUST show the stalled liveness reason separately from warm or pinned retention metadata

#### Scenario: first implementation does not require workspace ghost rows

- **WHEN** the first implementation of stalled continuity is delivered
- **THEN** the runtime pool console MUST be allowed to represent stalled continuity on the existing `RuntimePoolRow`
- **AND** the contract MUST NOT require introducing a separate workspace-level ghost row for correctness

#### Scenario: runtime row shows abnormal exit context

- **WHEN** the most recent managed runtime for a workspace ended unexpectedly
- **THEN** the runtime pool console MUST expose the normalized exit reason and any available terminal metadata
- **AND** that diagnostic MUST remain visible long enough for issue triage after the row is refreshed

#### Scenario: runtime row shows recent stalled recovery diagnostics

- **WHEN** a managed runtime or workspace recently entered bounded stalled recovery such as `waiting-first-event` or `resume-pending`
- **THEN** the runtime pool console MUST expose that recent stalled recovery reason with correlation metadata
- **AND** the user MUST be able to distinguish it from ordinary idle retention or cleanup history

#### Scenario: recent cleanup diagnostics remain visible
- **WHEN** the system has recorded orphan sweep, force-kill, or shutdown cleanup results
- **THEN** the runtime pool console MUST expose those recent cleanup outcomes in a diagnosable summary
