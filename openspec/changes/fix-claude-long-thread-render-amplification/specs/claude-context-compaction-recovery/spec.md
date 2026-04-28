## ADDED Requirements

### Requirement: Claude Prompt Overflow Compaction UI MUST Remain Explicit And Recoverable

Claude prompt-overflow auto-compaction MUST keep frontend state explicit, bounded, and recoverable so users do not perceive compaction as a frozen conversation.

#### Scenario: compacting event shows active compacting state
- **WHEN** frontend receives `thread/compacting` for a Claude thread
- **THEN** the thread MUST enter context compacting state promptly
- **AND** the message surface MUST be able to show a compacting indicator

#### Scenario: compacted event clears compacting state
- **WHEN** frontend receives `thread/compacted` for the same Claude thread
- **THEN** the thread MUST leave context compacting state
- **AND** it MUST append the existing deduped `Context compacted.` semantic message

#### Scenario: compaction failure settles to stable error state
- **WHEN** frontend receives `thread/compactionFailed`
- **THEN** the thread MUST leave context compacting state
- **AND** the UI MUST surface a recoverable error instead of leaving a permanent processing or compacting indicator
