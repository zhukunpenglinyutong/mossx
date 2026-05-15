# claude-context-compaction-recovery Specification

## Purpose

Defines the claude-context-compaction-recovery behavior contract, covering Claude Prompt-Overflow Auto Recovery.

## Requirements
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

### Requirement: Claude Compaction Lifecycle Event Mapping

The Claude runtime MUST map Claude CLI compaction lifecycle signals to existing thread compaction events so frontend can reuse current status flow.

#### Scenario: map compacting signal
- **WHEN** Claude stream emits a `system` event with compacting status
- **THEN** runtime SHALL emit `thread/compacting` for the active Claude thread
- **AND** frontend compaction state handler SHALL be able to consume it without protocol changes

#### Scenario: map compact boundary signal to compacted completion
- **WHEN** Claude stream emits `compact_boundary`
- **THEN** runtime SHALL emit `thread/compacted` for the same Claude thread
- **AND** frontend SHALL append the existing `Context compacted.` semantic message through current reducer flow

### Requirement: Claude-Only Boundary Guard

This capability MUST be strictly isolated to Claude engine threads.

#### Scenario: codex threads bypass claude recovery logic
- **WHEN** the active thread is Codex
- **THEN** Claude prompt-overflow auto recovery SHALL NOT execute
- **AND** existing Codex compaction/runtime behavior SHALL remain unchanged

#### Scenario: opencode and gemini threads bypass claude recovery logic
- **WHEN** the active thread is OpenCode or Gemini
- **THEN** Claude prompt-overflow auto recovery SHALL NOT execute
- **AND** existing OpenCode/Gemini error and compaction semantics SHALL remain unchanged

### Requirement: Lightweight Compacting Visibility Hint

The UI SHALL show a lightweight compacting hint for Claude threads while reusing existing state flow and without introducing new heavy UI structures.

#### Scenario: show compacting hint without new panel
- **WHEN** a Claude thread enters compacting state
- **THEN** frontend SHALL be able to render a lightweight compacting hint
- **AND** frontend SHALL NOT require introducing a dedicated new compaction panel

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

