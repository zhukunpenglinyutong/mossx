## MODIFIED Requirements

### Requirement: Claude Prompt-Overflow Auto Recovery

For Claude engine threads, the runtime MUST attempt one automatic recovery cycle when a turn fails with a prompt-overflow error (`Prompt is too long`), by issuing `/compact` and retrying the original user request once in the same session. This automatic behavior is overflow-scoped recovery and MUST NOT be presented as proactive threshold-based auto-compaction.

#### Scenario: trigger one-shot recovery on prompt overflow
- **WHEN** a Claude thread turn fails and error text indicates prompt overflow
- **THEN** runtime SHALL send one `/compact` request for the same thread/session
- **AND** runtime SHALL retry the original request once after compaction

#### Scenario: stop after one retry
- **WHEN** the retried Claude turn still fails
- **THEN** runtime SHALL surface the final turn error to UI
- **AND** runtime SHALL NOT start a second automatic compact-retry cycle for that turn

#### Scenario: compaction request failure keeps clear terminal outcome
- **WHEN** Claude auto-compaction request fails before retry
- **THEN** runtime SHALL emit a failure result for the current turn
- **AND** runtime SHALL keep the error actionable for manual follow-up retry

#### Scenario: user-facing semantics stay overflow-scoped
- **WHEN** the product describes Claude automatic compaction behavior
- **THEN** the product SHALL describe it as prompt-overflow recovery
- **AND** the product SHALL NOT describe Claude behavior as Codex-style proactive threshold auto-compaction

#### Scenario: manual compact remains available after overflow recovery failure
- **WHEN** Claude prompt-overflow auto recovery fails and returns a terminal error
- **THEN** the user SHALL still be able to manually trigger `/compact` in the same conversation
- **AND** the failure semantics SHALL remain actionable for manual follow-up
