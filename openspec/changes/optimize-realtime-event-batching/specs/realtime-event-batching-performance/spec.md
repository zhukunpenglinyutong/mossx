## ADDED Requirements

### Requirement: Realtime Batching MUST Preserve First-Token Semantics

The first user-visible assistant delta for a turn MUST be delivered without batching delay.

#### Scenario: first assistant delta flushes immediately

- **WHEN** the first assistant text delta for a turn arrives
- **THEN** it MUST be delivered to the UI path immediately
- **AND** batching MUST NOT make `S-RS-FT.firstTokenLatency` worse than the recorded fixture baseline

### Requirement: Batching MUST Preserve Event Order And Final Content

Coalescing MUST preserve the order and final content of realtime text/tool deltas.

#### Scenario: coalesced deltas produce the same final message

- **WHEN** multiple deltas are coalesced
- **THEN** the final assistant/tool content MUST equal the content produced by immediate processing
- **AND** relative order MUST be preserved

### Requirement: Terminal Events MUST Flush Pending Batches

Turn completion, interruption, error, and dedup settlement MUST flush pending deltas before final state is committed.

#### Scenario: completion flushes pending deltas

- **WHEN** a terminal event arrives while deltas are pending
- **THEN** pending deltas MUST be applied before the terminal state is visible

### Requirement: Dedup Semantics MUST Remain Stable

Batching MUST NOT change dedup identity or the recorded meaning of `S-RS-PE.dedupHitRatio = 0.25`.

#### Scenario: dedup ratio remains semantically stable

- **WHEN** the realtime extended baseline runs
- **THEN** dedup behavior MUST match existing replay expectations
- **AND** duplicate responses MUST NOT reappear because of delayed batches

### Requirement: Batching MUST Not Redefine Canonical Runtime Events

This capability MUST change delivery cadence only; it MUST NOT introduce new canonical realtime event names or a domain EventBus.

#### Scenario: normalized event contract remains unchanged

- **WHEN** batching is enabled
- **THEN** `NormalizedThreadEvent` shape and adapter normalization tests MUST continue to pass
- **AND** `openspec validate optimize-realtime-event-batching --strict --no-interactive` MUST pass
