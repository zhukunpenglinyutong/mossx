## ADDED Requirements

### Requirement: Codex Silent Turn Suspicion MUST Remain Non-Terminal Until Authoritative Settlement

Codex conversation liveness MUST model frontend-observed silent turns as non-terminal suspicion until an authoritative runtime, backend, or user action settles the turn.

#### Scenario: frontend silence does not terminalize active turn
- **WHEN** a Codex foreground turn enters `suspected-silent` or an equivalent soft state because the frontend has not observed progress within the configured no-progress window
- **THEN** the turn MUST remain non-terminal
- **AND** active turn identity MUST remain eligible to consume matching realtime progress
- **AND** the system MUST NOT emit terminal external settlement for that turn solely from the frontend suspicion

#### Scenario: backend terminal event overrides suspicion
- **WHEN** a Codex foreground turn is in `suspected-silent`
- **AND** backend emits `turn/completed`, `turn/error`, `turn/stalled`, `runtime/ended`, or an equivalent authoritative terminal event for the same active turn identity
- **THEN** lifecycle MUST settle the turn according to that authoritative event
- **AND** the suspected state MUST be cleared or superseded by the terminal state

#### Scenario: user stop after suspicion settles deterministically
- **WHEN** the user stops a Codex turn that is in `suspected-silent`
- **THEN** the turn MUST settle as abandoned, interrupted, failed, or an equivalent terminal state
- **AND** subsequent sends MUST NOT remain blocked by that old suspected turn

### Requirement: Codex Progress Evidence MUST Include Non-Text Runtime Activity

Codex turn liveness MUST treat normalized runtime activity as progress evidence even when no assistant text delta is visible.

#### Scenario: heartbeat refreshes liveness
- **WHEN** a `processing/heartbeat` or equivalent runtime heartbeat is correlated to the current Codex thread, runtime generation, and active turn when available
- **THEN** the system MUST treat it as progress evidence
- **AND** the no-progress window MUST be measured from that heartbeat

#### Scenario: active status refreshes liveness
- **WHEN** `thread/status/changed`, runtime status, or equivalent event reports active, running, processing, or alive state for the current Codex thread and runtime generation
- **THEN** the system MUST treat it as progress evidence
- **AND** the turn MUST NOT enter suspected-silent based on an older frontend timestamp

#### Scenario: item and tool state refresh liveness
- **WHEN** an item, command, tool, file-change, approval, request-user-input, token usage, or equivalent structured runtime activity changes for the active Codex turn
- **THEN** the system MUST treat that change as progress evidence
- **AND** liveness diagnostics MUST record the progress source when available

### Requirement: Codex Soft-Suspect UI MUST Be Low-Interruption And Self-Recovering

Codex soft-suspect state MUST inform the user without requiring manual debug interaction and MUST recover automatically when matching progress arrives.

#### Scenario: suspected silence shows passive status
- **WHEN** a Codex foreground turn enters `suspected-silent`
- **THEN** UI MUST show passive waiting copy or equivalent low-interruption status
- **AND** UI MUST keep Stop available
- **AND** UI MUST NOT require the user to open a debug panel to continue normal monitoring

#### Scenario: matching late progress clears passive status
- **WHEN** UI is showing suspected-silent status for a Codex turn
- **AND** matching realtime progress arrives for the active turn identity
- **THEN** UI MUST clear suspected-silent status automatically
- **AND** UI MUST return to normal waiting or ingress processing presentation

### Requirement: Codex Silent Liveness Diagnostics MUST Distinguish Suspicion From Settlement

Codex liveness diagnostics MUST preserve the difference between frontend-observed suspected silence and authoritative stalled settlement.

#### Scenario: frontend suspicion records non-terminal source
- **WHEN** a Codex turn enters suspected-silent due to frontend no-progress observation
- **THEN** diagnostics MUST record source `frontend-no-progress-suspected` or an equivalent non-terminal source
- **AND** diagnostics MUST include last progress evidence source and age when available

#### Scenario: authoritative stalled records terminal source
- **WHEN** a Codex turn enters stalled, dead-recoverable, abandoned, runtime-ended, or equivalent terminal liveness state
- **THEN** diagnostics MUST record the authoritative source such as `backend-authoritative-stalled`, `runtime-ended`, or `user-abandoned`
- **AND** diagnostics MUST NOT conflate that source with frontend-only suspected silence

#### Scenario: recovery records suspicion duration
- **WHEN** a suspected-silent Codex turn later receives matching progress or terminal settlement
- **THEN** diagnostics MUST preserve that the turn was previously suspected
- **AND** diagnostics SHOULD include the suspected duration when available
