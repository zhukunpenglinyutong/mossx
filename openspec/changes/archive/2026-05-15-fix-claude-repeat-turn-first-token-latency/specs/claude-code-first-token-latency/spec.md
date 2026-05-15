## ADDED Requirements

### Requirement: Claude Code First Token Latency MUST Be Phase Observable

The system MUST capture bounded timing evidence for Claude Code turns before the first assistant text delta so repeat-turn latency can be assigned to the correct phase.

#### Scenario: startup phases are recorded without content
- **WHEN** the GUI starts a Claude Code `stream-json` turn
- **THEN** diagnostics MUST be able to record process spawn, stdin write or close, turn start, first stdout line, first valid stream event, and first assistant text delta timing when available
- **AND** the timing evidence MUST NOT include prompt text, assistant text, raw stdout lines, tool payloads, or environment secrets

#### Scenario: missing first text remains distinguishable from render stall
- **WHEN** a Claude Code turn has not emitted an assistant text delta yet
- **THEN** the system MUST NOT classify the wait as a frontend visible-output stall
- **AND** diagnostics MUST keep it in a first-token or startup latency category until assistant text ingress exists

#### Scenario: valid non-text stream activity is not treated as silence
- **WHEN** a Claude Code turn emits valid stream-json events before assistant text
- **THEN** diagnostics MUST distinguish valid-event-without-text from no-stdout or no-valid-event states
- **AND** the turn MUST remain semantically processing unless it reaches a terminal event or timeout

### Requirement: Claude Code First Token Diagnostics MUST Preserve Streaming Semantics

The system MUST add first-token observability without changing Claude Code stream ordering, terminal lifecycle, or stop/retry semantics.

#### Scenario: first text delta still uses realtime path
- **WHEN** the first assistant text delta arrives after startup timing has been recorded
- **THEN** the delta MUST be forwarded through the existing realtime stream path
- **AND** runtime diagnostics or ledger persistence MUST NOT become a prerequisite for emitting that delta

#### Scenario: slow upstream first token is reported without synthetic text
- **WHEN** timing evidence shows stdin was closed and no stdout or no assistant text has arrived for a bounded period
- **THEN** diagnostics MAY report first-token latency
- **AND** the conversation UI MUST NOT fabricate assistant text or collapse the turn into final-only output
