## ADDED Requirements

### Requirement: Claude Stream Startup Timeout MUST Terminate Silent Child Process

Claude print-mode runtime MUST terminate and report a terminal error when the child process stays alive without producing any valid `stream-json` event within the bounded startup window.

#### Scenario: silent child exits pseudo-processing

- **WHEN** GUI starts a Claude turn with `claude -p --output-format stream-json`
- **AND** the child process remains alive without any valid stream-json event
- **THEN** backend MUST emit a `turn/error` outcome for the active turn
- **AND** backend MUST terminate the associated Claude child process
- **AND** frontend lifecycle MUST be able to clear processing through the existing terminal error path

#### Scenario: malformed output does not count as liveness

- **WHEN** Claude stdout emits non-json text, malformed JSON, malformed SSE, or equivalent protocol-incompatible output
- **AND** no valid stream-json event is parsed before the startup window expires
- **THEN** backend MUST treat the turn as a stream startup timeout
- **AND** the terminal error SHOULD include a short diagnostic sample without dumping full payloads

#### Scenario: valid first event disables startup timeout

- **WHEN** Claude emits at least one valid stream-json event before the startup window expires
- **THEN** backend MUST continue through the existing stream handling path
- **AND** the startup timeout MUST NOT terminate the child solely because a later normal model operation is slow
