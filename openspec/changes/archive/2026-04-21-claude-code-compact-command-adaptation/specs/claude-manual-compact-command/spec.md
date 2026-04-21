## ADDED Requirements

### Requirement: Claude Manual Compact Command Routing

The product MUST treat `/compact` as a first-class manual command when the active conversation is a Claude thread.

#### Scenario: route `/compact` through Claude command path
- **WHEN** the active conversation belongs to `Claude Code`
- **AND** the user submits `/compact`
- **THEN** the product MUST route the request through the Claude-specific compact command path
- **AND** the request MUST stay bound to the same Claude thread/session lineage

#### Scenario: manual compact bypasses prompt assembly side effects
- **WHEN** the user submits `/compact` in a Claude conversation
- **THEN** the product MUST send the command without prompt expansion side effects
- **AND** the product MUST NOT attach user-selected images or unrelated prompt composition state to that command

#### Scenario: non-claude engines are not remapped by this capability
- **WHEN** the active conversation is not a Claude conversation
- **AND** the user submits `/compact`
- **THEN** this Claude-specific command routing capability MUST NOT hijack the request
- **AND** existing engine-specific behavior MUST remain unchanged

#### Scenario: active Claude thread is rebound before command dispatch
- **WHEN** the active engine is Claude
- **AND** the current active thread is incompatible with Claude command dispatch
- **THEN** the product MUST resolve an existing Claude-compatible thread before sending `/compact`
- **AND** the command MUST NOT be sent to a non-Claude thread

#### Scenario: no compactable Claude thread yields actionable failure
- **WHEN** the user submits `/compact`
- **AND** the product cannot resolve an existing Claude-compatible thread
- **THEN** the product MUST show an actionable failure message
- **AND** the product MUST NOT create a new thread solely to execute `/compact`

### Requirement: Claude Manual Compact Feedback

Claude manual `/compact` execution MUST produce deterministic user-visible feedback.

#### Scenario: successful manual compact reuses existing lifecycle feedback
- **WHEN** Claude manual `/compact` is accepted and the runtime emits compaction lifecycle signals
- **THEN** the product MUST surface the existing compacting / compacted lifecycle feedback
- **AND** the conversation MUST continue using the existing `Context compacted.` semantic path
- **AND** the product MUST NOT append a second dedicated success message for the same completion

#### Scenario: manual compact precondition failure is actionable
- **WHEN** the user submits `/compact`
- **AND** the product cannot resolve an existing Claude-compatible thread
- **THEN** the product MUST show an actionable failure message
- **AND** the conversation MUST NOT enter a stuck processing state

#### Scenario: manual compact terminal failure is explicit
- **WHEN** Claude manual `/compact` reaches a terminal error
- **THEN** the product MUST surface a clear failure outcome to the user
- **AND** the user MUST NOT be left guessing whether compaction started successfully
