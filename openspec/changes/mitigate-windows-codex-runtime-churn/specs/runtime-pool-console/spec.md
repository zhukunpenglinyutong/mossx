## MODIFIED Requirements

### Requirement: Runtime pool console MUST surface process diagnostics for managed runtimes

The runtime pool console MUST expose the key process diagnostics needed to understand why a runtime exists, how guarded recovery is behaving, and whether observed Windows process overlap is bounded replacement or unhealthy churn.

#### Scenario: runtime row includes process identity

- **WHEN** the runtime pool console renders a managed runtime row
- **THEN** the row MUST include pid, wrapper kind, started time, and last-used time

#### Scenario: runtime row includes guarded startup and replacement context

- **WHEN** the runtime pool console renders a managed runtime row for a workspace currently starting or recently replaced
- **THEN** the row MUST expose startup state, last recovery source, and last replacement reason
- **AND** the row MUST indicate whether a stopping predecessor still exists for that `(engine, workspace)`

#### Scenario: recent churn counters remain visible

- **WHEN** the system has recorded recent spawn, replace, or force-kill activity for a managed runtime pair
- **THEN** the runtime pool console MUST expose bounded recent churn counters for those events
- **AND** the summary MUST remain visible long enough for issue triage after the row refreshes

#### Scenario: recent cleanup diagnostics remain visible

- **WHEN** the system has recorded orphan sweep, force-kill, or shutdown cleanup results
- **THEN** the runtime pool console MUST expose those recent cleanup outcomes in a diagnosable summary
