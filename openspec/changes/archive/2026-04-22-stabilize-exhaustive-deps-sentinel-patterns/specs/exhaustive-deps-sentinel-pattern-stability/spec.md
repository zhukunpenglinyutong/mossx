## ADDED Requirements

### Requirement: Sentinel-style recompute triggers must become explicit snapshots

Frontend modules SHALL NOT rely on dependency-array-only sentinel values to trigger recomputation when the true source of change is an external snapshot such as `localStorage`, clock ticks, or persisted session history. The consuming computation MUST instead read an explicit snapshot or clock value that explains why recomputation happens.

#### Scenario: Storage-backed model configuration changes

- **WHEN** custom model configuration or Claude model mapping changes in `localStorage`
- **THEN** the model list consumer SHALL refresh from an explicit storage snapshot
- **AND** the recomputing hook SHALL depend on the snapshot data it actually reads
- **AND** the implementation SHALL NOT require a “version-only” sentinel that exists solely to retrigger `useMemo`

### Requirement: Session radar refresh triggers must remain behaviorally stable after sentinel removal

The session radar SHALL preserve both running-duration refresh and persisted-history refresh after sentinel warnings are removed. Timer-driven refresh and history-event-driven refresh MUST remain explicit and independently testable.

#### Scenario: Running session duration refreshes without external rerender

- **WHEN** a session is still processing and no parent rerender occurs
- **THEN** the radar SHALL continue refreshing running duration on its existing timer cadence

#### Scenario: Persisted recent history changes

- **WHEN** the radar history update event is emitted after persisted recent session data changes
- **THEN** the radar SHALL refresh its recent-completed snapshot from persisted storage
- **AND** the merged recent feed SHALL reflect the new persisted entries or dismissal state
