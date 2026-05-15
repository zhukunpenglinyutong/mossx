## MODIFIED Requirements

### Requirement: Claude Sidebar Listing MUST Be Resilient To Large History Payloads

Claude sidebar session listing MUST treat large inline media payloads and degraded native listing sources as non-blocking optional content and continue projecting valid session summaries from authoritative or last-good Claude session truth.

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

#### Scenario: degraded Claude listing preserves last-good native rows
- **WHEN** the sidebar previously displayed Claude sessions for a workspace from native session truth
- **AND** a later refresh reports `claude-session-timeout`, `claude-session-error`, catalog partial, startup first-page, or an equivalent incomplete Claude source
- **THEN** the sidebar MUST preserve last-good Claude rows that are still in scope
- **AND** the refresh MUST NOT treat the incomplete source as authoritative proof that those sessions no longer exist

#### Scenario: transient empty Claude listing does not clear sidebar truth
- **WHEN** a full-catalog or native refresh returns an empty Claude subset without authoritative delete, archive, hidden, or out-of-scope evidence
- **AND** the system has last-good Claude rows for the workspace
- **THEN** the sidebar MUST keep those last-good rows while exposing degraded or incomplete state
- **AND** it MUST NOT render the workspace as having no Claude sessions solely from that transient empty result

### Requirement: Claude Sidebar Titles MUST Preserve Stable User-Facing Identity

Claude sidebar title projection MUST prevent weaker generic fallback names from overwriting stable mapped, custom, or previously meaningful session titles.

#### Scenario: generic fallback does not overwrite mapped title
- **WHEN** a Claude session has a mapped or custom title
- **AND** a later refresh can only derive a generic title such as `Claude Session` or `Agent N`
- **THEN** the sidebar MUST keep the mapped or custom title
- **AND** the weaker fallback MUST NOT replace it

#### Scenario: existing meaningful title survives lower-confidence refresh
- **WHEN** a Claude sidebar row already has a meaningful non-generic title
- **AND** a later degraded refresh has the same session identity but only a first-message or generic fallback title
- **THEN** the sidebar MUST preserve the meaningful title unless a mapped/custom title or stronger native title is available

### Requirement: Claude Sidebar Continuity MUST Preserve Session Relationships

Claude sidebar continuity MUST preserve parent-child relationship metadata while retaining last-good rows during degraded refreshes.

#### Scenario: parent-child metadata survives continuity merge
- **WHEN** a last-good Claude row contains `parentSessionId`, `parentThreadId`, fork lineage, or equivalent relationship metadata
- **AND** a later incomplete refresh preserves that row through continuity
- **THEN** the preserved row MUST keep the relationship metadata
- **AND** the sidebar MUST NOT flatten parent/child structure solely because the current refresh was incomplete

#### Scenario: authoritative filters still remove preserved rows
- **WHEN** a Claude row is archived, hidden, deleted, control-plane filtered, or proven out of workspace scope by authoritative data
- **THEN** last-good continuity MUST NOT resurrect that row
- **AND** the sidebar MUST honor the authoritative removal/filter decision
