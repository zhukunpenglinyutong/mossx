## ADDED Requirements

### Requirement: Conversation Restore MUST Resolve Engine From Active Thread

When restoring or rendering an existing conversation thread, the system MUST resolve the conversation engine from the active thread identity before falling back to the global engine selector.

#### Scenario: Claude history opens while global engine is Codex

- **WHEN** the global selected engine is `codex`
- **AND** the active thread metadata identifies the thread as `claude`
- **THEN** the conversation render state MUST use `claude`
- **AND** the message surface MUST NOT show Codex history loading or Codex transcript recovery copy for that Claude thread

#### Scenario: thread metadata is unavailable

- **WHEN** an active thread has no usable `selectedEngine` or `engineSource`
- **AND** the thread id does not contain a supported engine prefix
- **THEN** the conversation render state MAY fall back to the global selected engine
- **AND** new-session composer engine selection MUST remain unchanged
