## ADDED Requirements

### Requirement: Claude Thinking Toggle MUST Control Claude Reasoning Presentation

The system MUST treat the Claude thinking toggle as the canonical user intent for whether Claude reasoning content is visible in the conversation canvas.

#### Scenario: Claude thinking disabled hides reasoning presentation
- **WHEN** the active engine is `claude`
- **AND** the resolved Claude `alwaysThinkingEnabled` state is `false`
- **AND** the active conversation contains `reasoning` items from realtime or history
- **THEN** the conversation canvas MUST NOT render visible Claude reasoning body text
- **AND** it MUST NOT render the Claude docked reasoning module for those hidden items

#### Scenario: Claude thinking enabled allows reasoning presentation
- **WHEN** the active engine is `claude`
- **AND** the resolved Claude `alwaysThinkingEnabled` state is `true`
- **AND** the active conversation contains `reasoning` items
- **THEN** the conversation canvas MUST be allowed to render Claude reasoning using the existing reasoning presentation

#### Scenario: legacy hide flag does not override explicit toggle state
- **WHEN** an explicit Claude thinking visibility state is available from the composer or conversation container
- **AND** legacy local storage contains `ccgui.claude.hideReasoningModule`
- **THEN** the system MUST use the explicit Claude thinking visibility state for default product behavior
- **AND** the legacy flag MUST NOT make the visible reasoning state contradict the explicit toggle state

#### Scenario: non-Claude engines are isolated
- **WHEN** the active engine is `codex`, `gemini`, or `opencode`
- **AND** Claude thinking visibility is disabled
- **THEN** the system MUST NOT hide that engine's reasoning presentation solely because of the Claude thinking toggle

### Requirement: Claude Thinking Visibility State MUST Fail Safely

The system MUST recover safely when Claude thinking visibility cannot be read.

#### Scenario: visibility state is unavailable
- **WHEN** the app cannot resolve Claude `alwaysThinkingEnabled` from provider settings or local Claude settings
- **THEN** message sending MUST remain available
- **AND** the conversation canvas MUST use a safe fallback that does not corrupt or delete conversation data

#### Scenario: visibility state changes during an active conversation
- **WHEN** the user changes the Claude thinking toggle while a Claude conversation is open
- **THEN** the conversation canvas MUST re-evaluate Claude reasoning presentation from the latest toggle state
- **AND** already captured reasoning transcript data MUST remain available for presentation if the user re-enables thinking
