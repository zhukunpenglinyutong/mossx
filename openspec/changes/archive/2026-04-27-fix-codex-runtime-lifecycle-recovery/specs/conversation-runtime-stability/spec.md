## ADDED Requirements

### Requirement: Internal Codex Runtime Shutdown MUST NOT Masquerade As Foreground Turn Loss

The system MUST distinguish expected internal Codex runtime cleanup from true foreground runtime loss before emitting thread-facing runtime-ended diagnostics.

#### Scenario: internal cleanup without affected work records diagnostics only

- **WHEN** a Codex managed runtime is stopped by internal replacement, stale-session cleanup, settings restart, idle eviction, or app shutdown cleanup
- **AND** there is no active turn, pending request, timed-out request, background thread callback, or foreground work continuity attached to that runtime
- **THEN** the backend MUST NOT emit a `runtime/ended` app-server event for the conversation surface
- **AND** the backend MUST preserve runtime lifecycle evidence in existing runtime diagnostics or ledger state

#### Scenario: active foreground work still receives runtime-ended recovery

- **WHEN** a Codex managed runtime ends while active turn, pending request, timed-out request, background callback, or foreground work continuity exists
- **THEN** the affected work MUST settle through a structured recoverable runtime-ended diagnostic
- **AND** the diagnostic MUST include shutdown source, normalized reason code, pending request count, affected thread or turn ids when available, and exit metadata when available

#### Scenario: expected cleanup still settles pending request state

- **WHEN** a Codex runtime end path discovers pending or timed-out request state
- **THEN** every affected request MUST resolve or fail deterministically
- **AND** the system MUST NOT suppress request settlement merely because the shutdown source was expected or internal
