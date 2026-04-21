# conversation-completion-notification-sound Specification

## Purpose

Define turn-completion-scoped notification sound behavior so realtime content updates remain silent and each completed turn is audible at most once.

## Requirements

### Requirement: Notification Sound MUST Fire Once Per Completed Conversation Turn

The system MUST play the configured notification sound at most once for each completed conversation turn, and the trigger MUST be bound to terminal turn completion rather than streaming content updates.

#### Scenario: streaming content does not trigger notification sound

- **WHEN** a conversation receives agent message completion or content snapshot events before the turn reaches `turn/completed`
- **THEN** the system MUST NOT play the notification sound for those content events

#### Scenario: completed turn triggers one notification sound

- **WHEN** a conversation turn emits `turn/completed`
- **THEN** the system MUST play the notification sound once when notification sounds are enabled

#### Scenario: duplicate completed event for same turn is ignored

- **WHEN** the same `workspaceId`, `threadId`, and `turnId` emits `turn/completed` more than once
- **THEN** the system MUST play the notification sound no more than once for that turn

#### Scenario: consecutive completed turns remain audible

- **WHEN** the same conversation thread completes two different turns
- **THEN** the system MUST allow one notification sound for each distinct completed turn

#### Scenario: disabled notification sounds remain silent

- **WHEN** notification sounds are disabled
- **THEN** the system MUST NOT play the notification sound for streaming content events or completed turn events
