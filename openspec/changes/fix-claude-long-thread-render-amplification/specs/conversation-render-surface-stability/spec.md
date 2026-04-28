## ADDED Requirements

### Requirement: Live Conversation Rendering MUST Derive From A Bounded Tail Working Set

When history is collapsed for an active live conversation, message rendering MUST perform expensive presentation derivation on a bounded tail working set instead of the complete thread history.

#### Scenario: live collapsed history uses bounded working set
- **WHEN** a live conversation is processing
- **AND** `showAllHistoryItems` is disabled
- **AND** the conversation contains more items than the visible history window
- **THEN** filtering, reasoning dedupe/collapse, and timeline collapse MUST operate on a bounded tail working set
- **AND** the final rendered result MUST preserve the same visible latest conversation content

#### Scenario: collapsed history count includes omitted working-set prefix
- **WHEN** items before the live working set are omitted from presentation derivation
- **THEN** the collapsed history count MUST include those omitted items
- **AND** users MUST still see an accurate affordance that earlier history is hidden

#### Scenario: sticky live user message remains available
- **WHEN** the latest ordinary user message is outside the tail working set
- **THEN** the renderer MUST retain that user message as the sticky live question candidate
- **AND** the message MUST NOT be lost solely because working-set trimming was applied

#### Scenario: show all history keeps full derivation
- **WHEN** the user enables full history display
- **THEN** the renderer MUST keep using the full conversation item list for presentation derivation
- **AND** working-set trimming MUST NOT hide or reorder history
