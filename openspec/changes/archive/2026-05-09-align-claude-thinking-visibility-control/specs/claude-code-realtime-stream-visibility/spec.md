## ADDED Requirements

### Requirement: Claude Runtime Request MUST Receive Disable Thinking Intent

When Claude thinking visibility is explicitly disabled for a Claude Code send, the engine request path MUST pass a request-level disable-thinking intent to the Claude runtime without applying that intent to other engines.

#### Scenario: hidden thinking disables Claude CLI thinking for the request
- **WHEN** a user sends a message through the `claude` engine
- **AND** Claude thinking visibility is explicitly disabled
- **THEN** the frontend MUST pass `disableThinking=true` through the engine send contract
- **AND** the backend MUST start Claude Code with `CLAUDE_CODE_DISABLE_THINKING=1` for that request

#### Scenario: non-Claude sends ignore Claude disable thinking
- **WHEN** a user sends a message through `codex`, `gemini`, or `opencode`
- **AND** Claude thinking visibility is disabled
- **THEN** the engine send contract MUST NOT disable that engine's reasoning behavior

### Requirement: Claude Realtime Reasoning MUST Respect Thinking Visibility

Claude realtime stream handling MUST keep assistant final text progressive visibility intact while applying Claude thinking visibility to realtime reasoning presentation.

#### Scenario: hidden thinking suppresses realtime reasoning rows
- **WHEN** a `Claude Code` turn is running
- **AND** Claude thinking visibility is disabled
- **AND** the runtime emits `thinking_delta`, `reasoning_delta`, or equivalent reasoning events
- **THEN** the frontend MUST NOT render those events as visible reasoning rows in the conversation canvas
- **AND** it MUST NOT render those events in the Claude docked reasoning module

#### Scenario: hidden thinking preserves assistant final text
- **WHEN** a `Claude Code` turn is running
- **AND** Claude thinking visibility is disabled
- **AND** the runtime emits assistant text deltas or final assistant output
- **THEN** the frontend MUST continue rendering assistant text through the existing progressive visibility path
- **AND** hiding reasoning MUST NOT cause the final assistant answer to disappear

#### Scenario: visible thinking allows realtime reasoning rows
- **WHEN** a `Claude Code` turn is running
- **AND** Claude thinking visibility is enabled
- **AND** the runtime emits reasoning events
- **THEN** the frontend MAY render realtime reasoning using the existing reasoning presentation

#### Scenario: reasoning data remains available after visibility toggle
- **WHEN** a `Claude Code` turn has received reasoning events while Claude thinking visibility was disabled
- **AND** the user enables Claude thinking visibility before or after the turn completes
- **THEN** the system SHOULD be able to present retained reasoning data if it is still part of the conversation state
- **AND** it MUST NOT require replaying the runtime stream to recover the presentation

### Requirement: Claude Realtime Reasoning Visibility MUST Be Engine-Scoped

Claude realtime reasoning visibility behavior MUST only apply to Claude Code conversations.

#### Scenario: non-Claude realtime reasoning is unchanged
- **WHEN** a realtime conversation is running for `codex`, `gemini`, or `opencode`
- **AND** Claude thinking visibility is disabled
- **THEN** the frontend MUST keep that engine's existing realtime reasoning behavior unchanged
