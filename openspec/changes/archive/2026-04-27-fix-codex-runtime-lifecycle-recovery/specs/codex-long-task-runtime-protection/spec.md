## ADDED Requirements

### Requirement: Codex Active Work MUST Gate Runtime-Ended Visibility

Codex active-work protection MUST be the deciding signal for whether runtime loss is user-visible and recoverable on the conversation surface.

#### Scenario: active protected work makes runtime loss visible

- **WHEN** a managed Codex runtime exits while active-work protection or foreground work continuity exists
- **THEN** the conversation surface MUST receive a runtime-ended diagnostic that can drive reconnect, recover, or resend actions
- **AND** active-work protection MUST release only after that fallback settlement is recorded

#### Scenario: internal cleanup after settled work stays invisible to the conversation

- **WHEN** a managed Codex runtime is stopped after all active work has reached terminal settlement
- **AND** no pending foreground request or callback remains
- **THEN** the stop MUST NOT create a new user-visible runtime-ended reconnect card
- **AND** the stop MAY remain visible through runtime pool diagnostics

#### Scenario: stdout eof is correlated with process exit metadata

- **WHEN** Codex stdout closes before a terminal lifecycle event
- **THEN** the host MUST attempt a bounded correlation with child process status
- **AND** the resulting diagnostic MUST include exit code or signal if it is available within that bounded wait
