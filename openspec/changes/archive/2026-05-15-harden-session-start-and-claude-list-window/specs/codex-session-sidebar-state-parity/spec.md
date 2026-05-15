## ADDED Requirements

### Requirement: Codex New Conversation Start MUST Be Idempotent While In Flight

When the frontend starts a new Codex conversation for the same workspace and folder, concurrent callers MUST reuse the same in-flight backend start instead of creating multiple backend sessions.

#### Scenario: concurrent codex starts reuse one backend session
- **WHEN** two or more callers invoke new Codex conversation creation for the same workspace before the first backend start resolves
- **THEN** the system MUST call the backend start command only once
- **AND** all callers MUST receive the same created thread id
- **AND** the sidebar MUST materialize only one new Codex conversation

#### Scenario: in-flight reuse preserves activation request
- **WHEN** a caller reuses an in-flight Codex start and requests activation
- **THEN** the resolved shared thread MUST become active for that workspace
- **AND** the system MUST NOT dispatch a second create/materialize side effect for that same thread

#### Scenario: failed in-flight start can be retried
- **WHEN** an in-flight Codex start fails
- **THEN** the in-flight guard MUST be released
- **AND** a later user action MAY attempt a new backend start
