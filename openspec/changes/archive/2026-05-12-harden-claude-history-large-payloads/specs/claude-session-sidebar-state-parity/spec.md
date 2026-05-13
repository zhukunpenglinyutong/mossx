## ADDED Requirements

### Requirement: Claude Sidebar Listing MUST Be Resilient To Large History Payloads

Claude sidebar session listing MUST treat large inline media payloads as non-blocking optional content and continue projecting valid session summaries.

#### Scenario: large base64 transcript does not remove sidebar sessions
- **WHEN** one or more Claude JSONL files contain multi-megabyte inline base64 image lines
- **THEN** the sidebar session listing MUST still return valid discoverable Claude sessions for the workspace
- **AND** unrelated Claude sessions MUST NOT disappear solely because one transcript contains a large media payload

#### Scenario: session summary excludes large image payloads
- **WHEN** the system builds Claude sidebar summaries
- **THEN** the summary payload MUST NOT include inline base64 image data or data URI strings
- **AND** it MUST include only bounded metadata such as title preview, timestamps, message count, file size, and attribution fields

#### Scenario: Claude listing failure is source-scoped
- **WHEN** a Claude history file is oversized, malformed, or times out during summary extraction
- **THEN** the system MUST degrade or skip that file without clearing the full workspace thread list
- **AND** the degraded state MUST expose a Claude-specific partial source or diagnostic reason
