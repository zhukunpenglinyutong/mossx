## ADDED Requirements

### Requirement: Claude History Reasoning MUST Respect Thinking Visibility

Claude history restore MUST preserve reasoning transcript data while applying the current Claude thinking visibility state to the user-visible conversation canvas.

#### Scenario: hidden thinking suppresses history reasoning text
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is disabled
- **AND** restored Claude history contains `thinking` or `reasoning` blocks
- **THEN** the system MUST NOT render those reasoning blocks as visible reasoning body text in the conversation canvas
- **AND** the underlying parsed transcript data MUST NOT be physically deleted solely because it is hidden

#### Scenario: visible thinking restores history reasoning text
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is enabled
- **AND** restored Claude history contains `thinking` or `reasoning` blocks
- **THEN** the system MUST be allowed to render those blocks through the existing reasoning presentation

#### Scenario: hidden reasoning does not create empty thread regression
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is disabled
- **AND** restored history contains hidden reasoning plus assistant, tool, approval, or transcript fallback surfaces
- **THEN** the system MUST NOT render the thread as `messages.emptyThread`
- **AND** it MUST preserve the remaining visible transcript surfaces

#### Scenario: reasoning-only history avoids content leakage
- **WHEN** current engine is `claude`
- **AND** Claude thinking visibility is disabled
- **AND** restored history contains only reasoning transcript content and no other visible transcript surface
- **THEN** the system MUST NOT reveal the hidden reasoning body text
- **AND** it SHOULD show a non-content-leaking placeholder instead of treating the transcript as corrupted

### Requirement: Claude History Reasoning Visibility MUST Be Reversible

The system MUST allow Claude history reasoning presentation to follow later visibility changes without requiring the history transcript to be regenerated.

#### Scenario: re-enable thinking after hidden restore
- **WHEN** a Claude history conversation was restored while thinking visibility was disabled
- **AND** the user later enables Claude thinking visibility
- **THEN** the system SHOULD be able to display the previously hidden reasoning from retained transcript data
- **AND** it MUST NOT require creating a new Claude session to recover that reasoning presentation
