# conversation-live-user-bubble-pinning Specification

## Purpose

Define display-only sticky anchoring for the latest ordinary user question during active realtime conversation processing.

## Requirements

### Requirement: Latest User Question SHALL Pin During Realtime Processing

The conversation canvas SHALL keep the latest ordinary user question visible as a sticky top anchor while the active turn is processing.

#### Scenario: latest user question pins after reaching top during realtime processing
- **WHEN** a conversation is processing in realtime
- **AND** the latest ordinary user question bubble scrolls to the top of the message viewport
- **THEN** the system SHALL keep that user question bubble fixed at the top of the message viewport
- **AND** subsequent realtime content SHALL continue scrolling underneath it

#### Scenario: earlier user questions remain normal scroll content
- **WHEN** a conversation is processing in realtime
- **AND** the canvas contains multiple user question bubbles
- **THEN** only the latest ordinary user question bubble SHALL enter the sticky top behavior
- **AND** earlier user question bubbles SHALL remain normal scroll content

### Requirement: User Question Pinning SHALL Recover To Normal Scrolling Outside Realtime

The conversation canvas SHALL remove latest-user-question pinning whenever the view is no longer the active realtime turn.

#### Scenario: pinning is removed after processing completes
- **WHEN** the active conversation turn stops processing
- **THEN** the latest user question bubble SHALL return to normal scroll behavior
- **AND** the message order and payload SHALL remain unchanged

#### Scenario: history restore does not pin user questions
- **WHEN** the user opens or queries a restored conversation history view
- **THEN** user question bubbles SHALL render as normal scroll content
- **AND** no restored user question bubble SHALL be sticky solely because it is the latest user message

### Requirement: User Question Pinning SHALL Be Display-Only

The pinning behavior SHALL be a presentation-layer state and SHALL NOT mutate conversation data, copy text, or runtime contracts.

#### Scenario: copy remains bound to original user message display text
- **WHEN** the latest user question bubble is sticky
- **AND** the user copies that message
- **THEN** the copy action SHALL use the existing user message display text
- **AND** the sticky presentation SHALL NOT alter the copied content

#### Scenario: runtime and history contracts remain unchanged
- **WHEN** latest-user-question pinning is active
- **THEN** the system SHALL NOT require new Tauri commands, storage fields, runtime events, or history loader payload fields
