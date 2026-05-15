# conversation-completion-email-notification Specification

## Purpose

Defines the conversation-completion-email-notification behavior contract, covering Composer MUST Expose Thread-Scoped One-Shot Email Intent.

## Requirements
### Requirement: Composer MUST Expose Thread-Scoped One-Shot Email Intent
The system SHALL expose an email icon toggle in the conversation composer that represents a one-shot completion email intent for the current conversation/thread only.

#### Scenario: email intent button is visible in composer
- **WHEN** the user views a conversation composer where messages can be sent
- **THEN** the system MUST render an email icon button in the composer control area
- **AND** the button MUST have accessible label or tooltip copy that identifies the one-shot completion email behavior

#### Scenario: selected state is scoped to current thread
- **WHEN** the user enables completion email intent in thread A
- **AND** switches to thread B
- **THEN** the composer MUST render thread B's independent email intent state
- **AND** thread B MUST NOT inherit thread A's selected state

#### Scenario: returning to thread restores unsent intent
- **WHEN** the user enables completion email intent in thread A
- **AND** switches away before the target turn reaches terminal state
- **AND** returns to thread A
- **THEN** the composer MUST render the email button as selected for thread A

### Requirement: Email Intent MUST Bind To A Single Target Turn
The system SHALL bind an enabled email intent to exactly one target turn and automatically clear it after that turn reaches terminal state.

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

#### Scenario: late completion for stale turn cannot send email
- **WHEN** a stale or previously settled turn emits a late completion event
- **AND** the current thread has no matching pending email intent for that turn identity
- **THEN** the system MUST NOT send a completion email
- **AND** the current thread's email intent state MUST remain unchanged

### Requirement: Completion Email MUST Contain Final Turn Content And File Change Summary
The system SHALL send a completion email containing the final user/assistant turn pair and the target turn's visible `fileChange` card summary only.

#### Scenario: completed turn sends user and assistant content
- **WHEN** a target turn reaches terminal completion
- **AND** the email sender is enabled and configured
- **THEN** the system MUST send an email to the configured default recipient
- **AND** the email body MUST include the target turn's last user message
- **AND** the email body MUST include the target turn's completed assistant answer

#### Scenario: file change cards are summarized in email
- **WHEN** the target turn contains visible `fileChange` cards
- **THEN** the email body MUST include a readable summary of those `fileChange` facts
- **AND** `fileChange` summaries MUST include changed file paths when available

#### Scenario: non-file-change activity is excluded from email
- **WHEN** the target turn contains `commandExecution`, diff, review, generated image, explore, or equivalent non-`fileChange` visible cards
- **THEN** the email body MUST NOT include those tool call or activity details

#### Scenario: email body uses current visible conversation facts
- **WHEN** live and history sources disagree during terminal settlement
- **THEN** the email body MUST be assembled from the same normalized conversation facts used by the visible message surface after terminal settlement
- **AND** it MUST NOT invent missing assistant text or tool activity from unrelated threads

#### Scenario: empty assistant completion does not send misleading success
- **WHEN** the target turn reaches terminal completion but no assistant answer or visible completion content can be resolved
- **THEN** the system MUST avoid sending a misleading successful completion email
- **AND** it MUST clear the one-shot intent with a recoverable user-visible failure or skipped-send state

### Requirement: Email Sending MUST Use The Shared Backend Sender Contract
The system SHALL send conversation completion emails through the existing backend email sender contract rather than exposing SMTP secret or transport logic to the frontend.

#### Scenario: frontend calls typed tauri bridge only
- **WHEN** the frontend requests a conversation completion email send
- **THEN** it MUST use a typed function in `src/services/tauri.ts`
- **AND** feature components and hooks MUST NOT call Tauri `invoke()` directly

#### Scenario: backend reads secret only inside email module
- **WHEN** a conversation completion email send is requested
- **THEN** the backend MUST use the saved email sender settings and credential store inside the email sender boundary
- **AND** frontend payloads, app settings JSON, logs, toasts, and diagnostics MUST NOT contain SMTP secret values

#### Scenario: disabled or incomplete email settings fail before smtp send
- **WHEN** the email sender is disabled, not configured, missing secret, or has invalid recipient settings
- **THEN** the send attempt MUST return a structured email error
- **AND** the system MUST NOT attempt SMTP delivery when validation fails before transport

### Requirement: Email Failures MUST Be Recoverable And Non-Blocking
The system SHALL treat completion email delivery as a side effect that cannot block conversation lifecycle settlement.

#### Scenario: send failure does not hide completed answer
- **WHEN** the target turn completes successfully
- **AND** the completion email send fails
- **THEN** the assistant answer and tool cards MUST remain visible
- **AND** the thread lifecycle MUST remain terminally settled
- **AND** the UI MUST expose a recoverable failure indication

#### Scenario: duplicate terminal events send at most once
- **WHEN** equivalent terminal completion events are observed multiple times for the same target turn
- **THEN** the system MUST attempt at most one completion email send for that one-shot intent
- **AND** duplicate events MUST NOT produce duplicate emails

#### Scenario: send timeout is bounded
- **WHEN** SMTP delivery for a completion email exceeds the backend bounded timeout
- **THEN** the send MUST fail with a structured timeout error
- **AND** the composer and thread UI MUST remain interactive

#### Scenario: no opt-in means no send
- **WHEN** a conversation turn reaches completion without an enabled one-shot email intent
- **THEN** the system MUST NOT send a completion email
- **AND** it MUST NOT create hidden email intent state for that thread

