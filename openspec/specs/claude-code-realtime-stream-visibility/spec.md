# claude-code-realtime-stream-visibility Specification

## Purpose

Define the Windows-facing Claude Code stream visibility contract so live assistant text remains progressively visible once realtime text ingress has begun.

## Requirements

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
