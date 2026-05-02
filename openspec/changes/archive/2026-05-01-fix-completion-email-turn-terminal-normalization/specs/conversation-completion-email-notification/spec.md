## MODIFIED Requirements

### Requirement: Email Intent MUST Bind To A Single Target Turn
The system SHALL bind an enabled email intent to exactly one target turn and automatically clear it after that turn reaches terminal state. Terminal completion events from every supported engine SHALL carry a normalized target turn identity that can be matched against the bound one-shot intent.

#### Scenario: intent before send binds to next submitted turn
- **WHEN** the user enables completion email intent before submitting a message
- **AND** submits the next user message in the same thread
- **THEN** the email intent MUST bind to that submitted turn
- **AND** it MUST NOT bind to any later turn unless the user enables it again

#### Scenario: intent during active generation binds to active turn
- **WHEN** the current thread has an active generating turn
- **AND** the user enables completion email intent
- **THEN** the email intent MUST bind to the active turn identity when available
- **AND** it MUST send only for that active turn's terminal completion

#### Scenario: terminal outcome clears one-shot intent
- **WHEN** the target turn reaches completed, error, interrupted, cancelled, stalled, or equivalent terminal lifecycle state
- **THEN** the system MUST clear the one-shot email intent for that thread
- **AND** a later turn MUST NOT trigger email unless the user enables a new intent

#### Scenario: completed terminal event carries normalized turn identity
- **WHEN** Codex, Claude Code, Gemini, or OpenCode emits a completed terminal event for a foreground turn
- **THEN** the app-server `turn/completed` payload MUST include the same normalized `turnId` that was exposed when the turn started or was accepted by the send-message response
- **AND** lifecycle consumers MUST receive that `turnId` before deciding whether to send a completion email

#### Scenario: completion email sends for non-codex normalized completion
- **WHEN** the user enables completion email intent for a Claude Code, Gemini, or OpenCode turn
- **AND** that turn later emits a completed terminal event with the matching normalized `turnId`
- **THEN** the system MUST attempt exactly one completion email send for that turn
- **AND** the send attempt MUST use the shared backend conversation completion email contract

#### Scenario: missing terminal turn identity does not produce false success
- **WHEN** a completed terminal event is observed without a usable `turnId`
- **AND** a pending completion email intent exists for the thread
- **THEN** the system MUST NOT report a successful completion email send
- **AND** it MUST expose a recoverable skipped or missed-send diagnostic for the missing terminal identity
- **AND** it MUST keep duplicate-send protections intact

#### Scenario: late completion for stale turn cannot send email
- **WHEN** a stale or previously settled turn emits a late completion event
- **AND** the current thread has no matching pending email intent for that turn identity
- **THEN** the system MUST NOT send a completion email
- **AND** the current thread's email intent state MUST remain unchanged
