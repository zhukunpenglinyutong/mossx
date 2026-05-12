## ADDED Requirements

### Requirement: Claude History Restore MUST Defer Large Inline Image Payloads

Claude history restore MUST preserve readable transcript content while avoiding eager renderer delivery of large inline base64 image payloads.

#### Scenario: large inline image becomes deferred placeholder
- **WHEN** a Claude JSONL message contains an inline base64 image payload above the eager inline budget
- **THEN** history restore MUST return a deferred image placeholder or equivalent media descriptor
- **AND** it MUST NOT return the large base64 payload or data URI in the default history restore response
- **AND** the surrounding user, assistant, reasoning, and tool transcript content MUST remain readable

#### Scenario: small inline image compatibility is preserved
- **WHEN** a Claude JSONL message contains an inline image payload within the eager inline budget
- **THEN** history restore MAY keep using the existing inline image representation
- **AND** existing small-image history behavior MUST remain backward compatible

#### Scenario: deferred image carries stable locator metadata
- **WHEN** history restore defers a Claude image payload
- **THEN** the deferred media descriptor MUST include enough locator metadata to request that specific image later
- **AND** the locator MUST distinguish the session, source message or line, content block, and media type when available

### Requirement: Claude Deferred History Image MUST Be Loadable On Demand

The system MUST allow a user to manually hydrate one deferred Claude history image without reloading all large image payloads for the session.

#### Scenario: user clicks deferred image placeholder
- **WHEN** the conversation curtain displays a deferred Claude image placeholder
- **AND** the user requests to load it
- **THEN** the system MUST request only the selected image payload from the backend
- **AND** it MUST replace or expand the placeholder with the hydrated image when the backend returns a valid payload

#### Scenario: stale deferred image locator is recoverable
- **WHEN** the user requests a deferred Claude image
- **AND** the underlying JSONL file or block no longer matches the locator
- **THEN** the system MUST show a recoverable image-load error for that placeholder
- **AND** it MUST NOT clear the restored conversation transcript
