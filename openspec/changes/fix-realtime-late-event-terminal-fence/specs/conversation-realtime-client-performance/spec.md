## ADDED Requirements

### Requirement: Client Scheduling MUST Respect Terminal Turn Fences

Client-side realtime batching, throttling, and scheduled rendering MUST preserve terminal lifecycle semantics by checking terminal turn fences at the point where queued work executes.

#### Scenario: batched realtime operations observe terminal state at flush time
- **WHEN** realtime delta operations are buffered for client-side batching
- **AND** the associated turn reaches terminal state before the batch flushes
- **THEN** the batch flush MUST drop operations for the terminal turn
- **AND** the flush MUST NOT re-open processing or append stale visible output for that turn

#### Scenario: scheduled normalized event observes terminal state at dispatch time
- **WHEN** a normalized realtime event is queued through client scheduling before terminal settlement
- **AND** the event executes after the same turn has reached terminal state
- **THEN** the scheduled dispatch MUST skip state mutation for the terminal turn
- **AND** the thread's completed, errored, or stalled lifecycle result MUST remain unchanged

#### Scenario: integration path preserves completed state after late normalized update
- **WHEN** a full `useThreads` realtime path processes final assistant completion and turn completion
- **AND** a late normalized update for the same turn arrives afterward
- **THEN** the thread MUST remain non-processing
- **AND** the previously visible final assistant output MUST NOT be replaced or extended by the stale update

### Requirement: Realtime Performance Routing MUST Preserve Exact Turn Filtering

Realtime client performance and fallback routing optimizations MUST preserve exact turn identity so terminal filtering remains correct under high-frequency or delayed event delivery.

#### Scenario: fallback routing keeps turn id through optional handler shapes
- **WHEN** fallback routing adapts an event to agent completion, reasoning, command output, terminal interaction, or file-change handlers
- **THEN** the adapted call MUST pass through the original `turnId` when present
- **AND** the handler signature MUST remain typechecked across call sites

#### Scenario: event-handler prefilter avoids unnecessary scheduled work
- **WHEN** the event handler receives a raw item, normalized event, or agent delta for a turn already known as terminal
- **THEN** the handler MUST skip downstream realtime scheduling for that event
- **AND** no additional high-frequency client work MUST be created for the terminal turn

#### Scenario: rollback preserves baseline-compatible processing
- **WHEN** batching or scheduling optimizations are disabled by runtime flags
- **THEN** terminal turn filtering MUST still protect direct realtime execution paths
- **AND** the client MUST preserve baseline-compatible event handling for non-terminal turns
