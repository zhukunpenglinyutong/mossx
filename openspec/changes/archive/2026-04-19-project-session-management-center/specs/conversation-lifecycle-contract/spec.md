## ADDED Requirements

### Requirement: Archive Visibility Semantics Must Be Restart-Verifiable

Within the unified conversation lifecycle contract, archive visibility MUST be a restart-verifiable user-visible fact rather than a process-local filter accident.

#### Scenario: archived conversation disappears from default main list after success

- **WHEN** user archives a conversation and receives success
- **THEN** the current default main conversation surfaces MUST remove that conversation
- **AND** removal MUST be observable without requiring a full app restart

#### Scenario: archived conversation stays hidden after app restart

- **WHEN** user restarts the app after a conversation has been archived
- **THEN** the archived conversation MUST remain hidden from default main conversation surfaces
- **AND** the system MUST NOT reintroduce it solely because history is rebuilt from local files or live thread queries

#### Scenario: unarchived conversation becomes visible again

- **WHEN** user successfully unarchives a conversation
- **THEN** the conversation MUST re-enter the default visible conversation set
- **AND** subsequent list rebuilds MUST treat it as active again

### Requirement: Archive Semantics Must Stay Consistent Across Main Conversation Surfaces

The system MUST apply archive visibility semantics consistently across all default main conversation surfaces.

#### Scenario: sidebar home and topbar agree on archived invisibility

- **WHEN** a conversation is archived
- **THEN** sidebar thread list, workspace home recent conversations, and topbar session-tab recovery set MUST all treat it as hidden by default
- **AND** the user MUST NOT observe one surface keeping the archived conversation visible while another removes it after the same refresh cycle

#### Scenario: archiving one conversation does not interrupt unrelated running sessions

- **WHEN** user archives or deletes a conversation from session management
- **THEN** unrelated running conversations MUST keep their lifecycle and processing state unchanged
- **AND** archive visibility updates MUST NOT be implemented by globally resetting workspace conversation state
