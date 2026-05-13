## ADDED Requirements

### Requirement: Realtime Terminal Fence Preserves Terminal Lifecycle

The frontend conversation lifecycle MUST prevent realtime work belonging to a terminal turn from re-opening processing or mutating that turn's live state after the turn has reached `completed`, `error`, or `stalled`.

#### Scenario: late realtime delta cannot reopen processing
- **WHEN** a turn has been marked terminal by completed, error, or stalled settlement
- **AND** a realtime delta for the same thread and turn arrives later
- **THEN** the frontend MUST NOT call `markProcessing(true)` for that thread because of the stale delta
- **AND** the stale delta MUST NOT append live assistant, reasoning, tool, command, terminal, or file-change output for that terminal turn

#### Scenario: queued realtime work self-cancels after terminal settlement
- **WHEN** realtime work was accepted before terminal settlement but executes later through a timer batch or scheduled transition
- **AND** the work belongs to the now-terminal turn
- **THEN** the frontend MUST drop the work at execution time
- **AND** the terminal lifecycle state MUST remain settled

#### Scenario: raw item handler skips terminal turn before downstream mutation
- **WHEN** a raw item snapshot enters the event handler for a turn that is already terminal
- **THEN** the event handler MUST skip the event before invoking downstream item/realtime mutation handlers
- **AND** downstream continuation evidence or live processing side effects MUST NOT be produced for that stale event

#### Scenario: newer active turn is not blocked by old terminal fence
- **WHEN** a newer turn starts on the same thread after an older turn has been marked terminal
- **THEN** realtime events carrying the newer turn id MUST continue through normal realtime handling
- **AND** the terminal fence for the older turn MUST NOT suppress the newer turn's visible output or lifecycle state

### Requirement: Final Assistant Evidence Enables Conservative Completion Settlement

When normal `turn/completed` settlement is rejected but final assistant output is already visible, the frontend MUST allow a conservative fallback settlement only when no newer active turn exists for the thread.

#### Scenario: rejected completion with visible final output settles stale processing
- **WHEN** `turn/completed` is rejected by the normal active-turn guard
- **AND** final assistant output evidence exists for the same diagnostic turn
- **AND** the thread has no newer active turn
- **THEN** the frontend MUST clear residual processing state for that thread
- **AND** the frontend MUST keep the assistant output in final completed state
- **AND** the fallback settlement MUST emit diagnostic evidence that it was applied

#### Scenario: fallback settlement does not clear newer active turn
- **WHEN** `turn/completed` for an older turn is rejected
- **AND** final assistant output evidence exists for the older turn
- **AND** the same thread already has a newer active turn
- **THEN** the frontend MUST NOT clear processing for the thread through fallback settlement
- **AND** the newer active turn marker MUST remain intact

### Requirement: Terminal Fence Requires Turn Identity Propagation

Realtime event routing MUST preserve available `turnId` values from legacy and normalized fallback event paths to the final frontend handlers that apply terminal turn filtering.

#### Scenario: fallback output event keeps turn identity
- **WHEN** command output, terminal interaction, file-change output, reasoning delta, agent delta, or fallback assistant completion is routed through a legacy or normalized fallback path
- **THEN** the routed handler call MUST include the event's `turnId` when the source event provides it
- **AND** terminal turn filtering MUST be able to apply exact-turn matching to that event

#### Scenario: missing turn identity does not overblock newer events
- **WHEN** a realtime event does not provide a usable `turnId`
- **THEN** the frontend MUST avoid treating that event as an exact match for an unrelated terminal turn
- **AND** newer turn events with explicit turn ids MUST remain preferred for terminal fence decisions
