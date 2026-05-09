## ADDED Requirements

### Requirement: Claude History MUST Filter Cross-Engine Control Plane Contamination

Claude history parsing MUST filter Codex or GUI control-plane payloads before projecting user-visible sessions or messages.

#### Scenario: control-plane payload is not used as first message
- **WHEN** a Claude JSONL entry contains control-plane text such as JSON-RPC `initialize`, `clientInfo.name=ccgui`, `capabilities.experimentalApi`, `developer_instructions`, or Codex `app-server` launch text
- **THEN** the backend scanner MUST NOT use that text as the session first user message
- **AND** it MUST NOT derive a user-visible session title from that text

#### Scenario: control-plane-only transcript is omitted from session list
- **WHEN** a Claude history transcript contains no real user or assistant conversation after filtering control-plane entries
- **THEN** the backend MUST omit that transcript from the visible Claude session list
- **AND** the frontend MUST NOT recreate a visible conversation from the filtered entries

#### Scenario: mixed transcript keeps valid messages
- **WHEN** a Claude history transcript contains real conversation messages and control-plane contamination
- **THEN** the backend MUST keep the valid conversation messages
- **AND** the frontend loader MUST keep the valid conversation messages if it receives a mixed payload

#### Scenario: normal Claude messages are not over-filtered
- **WHEN** a real user message mentions terms such as `app-server` without matching high-confidence control-plane structure
- **THEN** the system MUST keep that message visible
- **AND** it MUST NOT hide normal conversation content solely because it contains a keyword

### Requirement: Claude History Contamination Filtering MUST Be Cross-Platform

Claude history contamination filtering MUST behave consistently on Windows and macOS because polluted JSONL shape is engine-protocol based rather than OS-specific.

#### Scenario: Windows polluted transcript is filtered
- **WHEN** Windows Claude history contains Codex control-plane payloads produced through wrapper, PATH, or proxy misrouting
- **THEN** the system MUST filter those payloads using the same contamination rules
- **AND** it MUST avoid showing `app-server` or `developer` pseudo sessions

#### Scenario: macOS polluted transcript is filtered
- **WHEN** macOS Claude history contains Codex control-plane payloads produced through custom binary or PATH misrouting
- **THEN** the system MUST filter those payloads using the same contamination rules
- **AND** it MUST preserve real Claude conversation content in mixed transcripts

### Requirement: Claude History Filtering MUST Be Protected By CI Gates

Claude history contamination filtering MUST be covered by backend and frontend tests.

#### Scenario: backend tests cover session scanner behavior
- **WHEN** backend tests exercise Claude history scanning
- **THEN** they MUST prove control-plane-only JSONL transcripts do not produce visible session summaries
- **AND** they MUST prove mixed transcripts retain real user messages

#### Scenario: frontend tests cover loader fallback behavior
- **WHEN** frontend tests exercise Claude history loader parsing
- **THEN** they MUST prove control-plane messages are skipped
- **AND** they MUST prove normal Claude messages remain visible
