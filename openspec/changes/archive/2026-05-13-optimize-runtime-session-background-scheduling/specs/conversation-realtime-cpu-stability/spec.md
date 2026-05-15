## ADDED Requirements

### Requirement: Inactive Running Sessions MUST Use Background Render Budget
The client MUST apply a background render budget to inactive running sessions so high-frequency realtime output does not drive foreground-priority visible rendering while preserving event semantics.

#### Scenario: inactive running session does not render every output delta
- **WHEN** a session is running but is not the active visible session
- **AND** realtime output deltas continue to arrive for that session
- **THEN** the client MUST avoid rendering each output delta through high-cost visible output surfaces
- **AND** the client MUST continue updating lightweight session metadata such as running state, last activity, buffered output count, and error summary

#### Scenario: active session keeps foreground realtime rendering
- **WHEN** a running session is the active visible session
- **THEN** the client MUST preserve foreground realtime rendering for user-visible output and send-critical controls
- **AND** background render budgeting MUST NOT delay composer input, approval controls, stop controls, or visible error state

### Requirement: Background Output Buffer MUST Be Lossless And Ordered
Inactive running session output buffering MUST preserve accepted realtime event semantics while allowing render work to be flushed later in bounded chunks.

#### Scenario: buffered output converges without loss after returning foreground
- **WHEN** output events are accepted while a running session is inactive
- **AND** the user switches that session back to foreground
- **THEN** buffered output MUST converge to the same logical conversation output as foreground processing
- **AND** output MUST NOT be lost, duplicated, or reordered within the same thread, turn, and item lineage

#### Scenario: semantic boundary events are not coalesced away
- **WHEN** buffered events include completion, approval, error, tool boundary, generated image boundary, or history reconciliation events
- **THEN** the client MUST preserve those semantic boundaries
- **AND** the client MUST NOT discard them merely because adjacent output deltas are snapshot-equivalent

### Requirement: Foreground Restore MUST Flush Heavy Output In Bounded Chunks
When a background running session becomes active, heavy output restoration MUST be scheduled in bounded chunks rather than synchronously flushing all buffered render work.

#### Scenario: session shell becomes interactive before heavy output completes
- **WHEN** a background running session is switched to foreground with buffered heavy output
- **THEN** the client MUST render the interactive session shell and critical controls before completing heavy output hydration
- **AND** heavy output hydration MUST yield between chunks to avoid blocking foreground interaction

#### Scenario: restoring work yields to new user interaction
- **WHEN** heavy output hydration is in progress
- **AND** the user types, sends, stops a task, approves an action, or switches sessions again
- **THEN** the client MUST prioritize the new foreground interaction
- **AND** stale or low-priority hydration work MUST be cancelled, deferred, or resumed safely
