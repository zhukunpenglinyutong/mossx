## MODIFIED Requirements

### Requirement: Runtime pool console MUST surface process diagnostics for managed runtimes

The runtime pool console MUST expose the key process diagnostics needed to understand why a runtime exists, whether it is protected by active work or only retained while idle, how it was launched, and why it ended or remains retained.

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

#### Scenario: runtime row shows abnormal exit context

- **WHEN** the most recent managed runtime for a workspace ended unexpectedly
- **THEN** the runtime pool console MUST expose the normalized exit reason and any available terminal metadata
- **AND** that diagnostic MUST remain visible long enough for issue triage after the row is refreshed

#### Scenario: recent cleanup diagnostics remain visible

- **WHEN** the system has recorded orphan sweep, force-kill, or shutdown cleanup results
- **THEN** the runtime pool console MUST expose those recent cleanup outcomes in a diagnosable summary

### Requirement: Runtime pool console MUST allow budget and retention tuning

The settings surface MUST allow users to configure runtime budget and retention parameters for managed runtimes without changing the survival contract of actively protected work.

#### Scenario: user adjusts runtime budget

- **WHEN** the user changes the configured hot or warm runtime budget
- **THEN** the system MUST persist the new budget and apply it to subsequent runtime orchestration decisions

#### Scenario: reducing budget does not clone or instantly duplicate runtimes

- **WHEN** the user lowers a runtime budget value
- **THEN** the system MUST apply the new limit through orchestrator eviction or release rules instead of creating new runtime instances

#### Scenario: user adjusts warm ttl

- **WHEN** the user updates the warm retention TTL in the runtime pool console
- **THEN** the system MUST persist the new TTL and use it for subsequent cooling decisions

#### Scenario: warm ttl never overrides an active lease

- **WHEN** a managed runtime still has an active turn lease or stream lease
- **THEN** warm retention TTL and budget overflow rules MUST NOT evict that runtime
- **AND** the console MUST continue to represent the runtime as active-work protected rather than merely warm
