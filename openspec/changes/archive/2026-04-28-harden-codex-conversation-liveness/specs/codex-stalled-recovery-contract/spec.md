## ADDED Requirements

### Requirement: General Codex Turn Silence MUST Settle To Recoverable Liveness State

Codex stalled recovery MUST cover any foreground Codex turn that exceeds a bounded no-progress window, not only queue fusion continuation.

#### Scenario: no progress evidence enters stalled state
- **WHEN** a Codex foreground turn has been started or requested
- **AND** the system receives no terminal event, stream delta, tool event, user-input request, approval request, or equivalent progress evidence within the bounded no-progress window
- **THEN** the turn MUST transition to `stalled`, `dead-recoverable`, or an equivalent recoverable liveness state
- **AND** the thread MUST NOT remain indefinitely in normal processing state

#### Scenario: active execution uses extended no-progress window
- **WHEN** a Codex foreground turn has an active command, tool, file-change, or equivalent execution item
- **AND** the execution item has not emitted a terminal completion event
- **THEN** the base no-progress window MUST NOT settle the turn as stalled
- **AND** the turn MAY only transition to a recoverable stalled state after an execution-active no-progress window that is long enough for normal quiet tool execution

#### Scenario: execution completion releases extended window with partial payload
- **WHEN** a Codex execution item was previously observed with a stable item id
- **AND** a later completion event carries that item id but omits the item type
- **THEN** the execution item MUST be removed from active execution tracking
- **AND** subsequent no-progress settlement MUST use the base no-progress window unless another execution item is still active

#### Scenario: late progress can revive only matching turn identity
- **WHEN** a stalled Codex turn later receives progress evidence
- **THEN** the system MUST only revive or settle the turn if thread identity, turn id when available, and runtime generation still match the active liveness chain
- **AND** stale late evidence MUST be recorded as diagnostic evidence rather than mutating the active successor thread

#### Scenario: stalled state exposes user-safe actions
- **WHEN** a Codex turn enters stalled or dead-recoverable state
- **THEN** the conversation surface MUST expose safe actions such as stop, retry same verified thread, reconnect and retry, or continue fresh according to available liveness evidence
- **AND** unavailable actions MUST be disabled or explained instead of silently doing nothing

### Requirement: Stop After Codex Stall MUST Unblock Future Sends

Stopping a stalled Codex turn MUST produce a deterministic terminal or abandoned lifecycle result so future user messages are not trapped behind the stale in-flight state.

#### Scenario: stop settles stalled turn
- **WHEN** the user stops a Codex turn in stalled or dead-recoverable state
- **THEN** the turn MUST settle as abandoned, interrupted, failed, or equivalent terminal state
- **AND** processing and active-turn markers for that turn MUST be cleared

#### Scenario: next send chooses verified or fresh target
- **WHEN** the user sends a new message after stopping a stalled Codex turn
- **THEN** the system MUST target a verified existing thread or create an explicit fresh continuation target
- **AND** the send MUST NOT reuse a thread identity already classified as unrecoverable
