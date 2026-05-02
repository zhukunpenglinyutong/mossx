## MODIFIED Requirements

### Requirement: General Codex Turn Silence MUST Settle To Recoverable Liveness State

Codex stalled recovery MUST cover any foreground Codex turn that exceeds a bounded no-progress window, including `requestUserInput` 提交后的 `resume-pending` 恢复 gap, not only queue fusion continuation. A normal foreground turn without active execution items MUST use a 600-second no-progress window. A backend `resume-pending` user-input resume watcher MUST default to 360 seconds before emitting stalled settlement.

#### Scenario: no progress evidence enters stalled state
- **WHEN** a Codex foreground turn has been started or requested
- **AND** the turn has no active command, tool, file-change, or equivalent execution item
- **AND** the system receives no terminal event, stream delta, tool event, user-input request, approval request, or equivalent progress evidence for 600 seconds
- **THEN** the turn MUST transition to `stalled`, `dead-recoverable`, or an equivalent recoverable liveness state
- **AND** the thread MUST NOT remain indefinitely in normal processing state

#### Scenario: resume-pending timeout releases current foreground continuity
- **WHEN** a Codex foreground turn is waiting on a `requestUserInput` resume chain in `resume-pending` or equivalent state
- **AND** the backend default resume-pending window of 360 seconds expires without new terminal or progress evidence
- **THEN** the turn MUST transition to `stalled`, `dead-recoverable`, or an equivalent recoverable liveness state
- **AND** the old resume-pending chain MUST release current foreground continuity / active-work protection

#### Scenario: active execution uses extended no-progress window
- **WHEN** a Codex foreground turn has an active command, tool, file-change, or equivalent execution item
- **AND** the execution item has not emitted a terminal completion event
- **THEN** the 600-second normal no-progress window MUST NOT settle the turn as stalled
- **AND** the turn MAY only transition to a recoverable stalled state after the 1200-second execution-active no-progress window

#### Scenario: progress evidence resets normal no-progress window
- **WHEN** a Codex foreground turn without active execution receives progress evidence before the 600-second normal timeout
- **THEN** the system MUST measure the normal no-progress window from that latest progress evidence
- **AND** the turn MUST remain eligible to continue receiving progress evidence until the refreshed window expires
