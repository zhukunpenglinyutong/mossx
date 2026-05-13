## ADDED Requirements

### Requirement: Realtime Turn Terminal Settlement MUST Clear Pseudo-Processing Safely
Realtime conversation lifecycle consumers MUST settle terminal turn state deterministically when a turn reaches completed or error state, while protecting newer active turns from accidental cleanup.

#### Scenario: completed turn clears processing after final assistant output
- **WHEN** a realtime turn has produced final assistant output
- **AND** the corresponding turn reaches completed terminal state
- **THEN** the thread lifecycle state MUST clear processing mode
- **AND** the active turn id for that completed turn MUST be cleared

#### Scenario: alias thread completion settles all matching identities
- **WHEN** a terminal completion event is associated with a finalized or canonical thread
- **AND** a pending or alias thread still carries the same active turn id
- **THEN** lifecycle settlement MUST clear processing state for both matching thread identities
- **AND** external completion side effects MUST run only once for the terminal turn

#### Scenario: fallback settlement does not clear newer turn
- **WHEN** final assistant completion evidence exists for an older turn
- **AND** the target thread has a newer active turn id
- **THEN** fallback settlement MUST NOT clear processing for the newer turn
- **AND** the rejected settlement MUST remain diagnosable

### Requirement: Turn Completion Guard Rejections MUST Be Observable
When terminal settlement refuses to clear processing, the system MUST emit enough structured evidence to distinguish a correct guard rejection from a stuck pseudo-processing bug.

#### Scenario: turn mismatch records settlement rejection
- **WHEN** a `turn/completed` event is received
- **AND** its turn id does not match the current thread or alias active turn
- **THEN** the client MUST record a settlement rejection with the requested thread id, alias thread id if any, terminal turn id, active turn ids, processing states, and rejection reason

#### Scenario: successful settlement records cleared target identities
- **WHEN** a terminal completion event successfully clears processing
- **THEN** the client MUST record which thread identities were settled
- **AND** the evidence MUST be correlatable with workspace, thread, engine, and turn
