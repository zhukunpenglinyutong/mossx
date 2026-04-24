## ADDED Requirements

### Requirement: Claude Code Live Text MUST Remain Progressively Visible On Windows
The system MUST preserve progressive visible assistant text for `Claude Code` realtime conversations on Windows once the first assistant delta has been received.

#### Scenario: first delta is followed by continued visible text progression
- **WHEN** a `Claude Code` turn is running on Windows
- **AND** the runtime has emitted at least one assistant text delta for the active turn
- **THEN** the frontend MUST continue making assistant text updates visible during processing
- **AND** the UI MUST NOT remain stuck on only the first few characters until the terminal completed event arrives

#### Scenario: completed output does not become the only visible update
- **WHEN** a `Claude Code` turn emits multiple assistant deltas before completion
- **THEN** the live assistant message MUST reflect intermediate text growth before `turn/completed`
- **AND** the final completed message MUST reconcile with the streamed text without replacing a stalled live surface as the first meaningful output

#### Scenario: degraded prefix stub does not replace a more readable same-turn live surface
- **WHEN** a `Claude Code` turn on Windows has already rendered a longer live assistant body in the current turn
- **AND** the live surface later regresses to a shorter prefix or stub while `visible-output-stall-after-first-delta` evidence is active
- **THEN** the frontend MUST preserve or recover the most recent more-readable same-turn live surface
- **AND** the shorter stub MUST NOT become the only meaningful visible assistant output before completion

### Requirement: Claude Code Stream Visibility Mitigation MUST Be Engine-Level And Model-Independent
The system MUST activate Claude Code stream visibility protection from engine/platform evidence, not from model or provider identity.

#### Scenario: Windows native Claude path can activate mitigation without provider fingerprint
- **WHEN** the active engine is `claude`
- **AND** the platform is Windows
- **AND** stream evidence shows visible output stalled after the first delta
- **THEN** the system MUST be able to activate the Claude Code stream visibility mitigation profile
- **AND** activation MUST NOT require `providerId`, `providerName`, `baseUrl`, or `model` to match a provider-specific fingerprint

#### Scenario: model changes do not change the bug classification
- **WHEN** a Windows `Claude Code` conversation shows the same first-delta-then-stall behavior across different models
- **THEN** diagnostics MUST classify the issue as a Claude Code stream visibility problem
- **AND** the system MUST NOT create separate root-cause categories solely from model identity

### Requirement: Claude Code Stream Visibility Mitigation MUST Preserve Conversation Semantics
The system MUST reduce visible output stalls without changing Claude Code conversation semantics.

#### Scenario: mitigation preserves ordering and terminal outcome
- **WHEN** Claude Code stream visibility mitigation is active
- **THEN** assistant text deltas, reasoning/tool items, and terminal completion MUST preserve their logical order
- **AND** the final visible assistant text MUST match the turn outcome that would be produced without mitigation

#### Scenario: processing controls remain available during mitigation
- **WHEN** mitigation is active and the turn is still processing
- **THEN** waiting/ingress/processing indicators and stop controls MUST remain available
- **AND** the user MUST still be able to tell that Claude Code is actively working
