# conversation-realtime-history-parity Specification

## Purpose
TBD - created by archiving change converge-conversation-fact-contract. Update Purpose after archive.
## Requirements
### Requirement: Realtime And History Paths MUST Preserve Visible Transcript Parity

realtime stream, completed settlement, history hydrate, and history reconcile MUST converge equivalent conversation facts to the same visible transcript semantics.

#### Scenario: realtime and history produce the same visible row cardinality

- **WHEN** a turn has already rendered through realtime stream and completed settlement
- **AND** the user reopens the same thread through history hydrate
- **THEN** the visible row cardinality for equivalent user, assistant, reasoning, tool, and control facts MUST remain stable
- **AND** history hydrate MAY only backfill canonical ids, timestamps, metadata, or structured facts

#### Scenario: history reconcile does not become primary duplicate repair

- **WHEN** completed settlement provides an equivalent final assistant snapshot after streaming deltas
- **THEN** local realtime settlement MUST converge the assistant fact before any later history refresh
- **AND** history reconcile MUST NOT be required to remove obvious duplicate assistant prose

#### Scenario: completed snapshot does not append streamed body twice

- **WHEN** an assistant response has streamed visible text
- **AND** a completed payload provides an equivalent final body
- **THEN** the system MUST canonicalize or replace the live fact
- **AND** MUST NOT append the final body as duplicate prose

### Requirement: User Bubble Parity MUST Collapse Optimistic And Authoritative Equivalents

optimistic, queued handoff, shared session, and authoritative history user observations MUST converge when they represent the same user intent.

#### Scenario: queued follow-up bubble converges with authoritative user item

- **WHEN** a queued follow-up is shown optimistically
- **AND** the authoritative user item arrives with equivalent normalized text
- **THEN** the system MUST keep one visible user bubble
- **AND** the authoritative item MAY replace local ids or metadata

#### Scenario: injected context does not create duplicate user rows

- **WHEN** authoritative history includes project memory, note-card, selected-agent, or shared-session wrappers
- **AND** the optimistic user bubble contained only the user-visible intent
- **THEN** normalization MUST treat them as equivalent user facts
- **AND** the visible transcript MUST NOT show duplicate user bubbles

#### Scenario: distinct user messages remain distinct

- **WHEN** two user observations are not equivalent after wrapper stripping and semantic comparison
- **THEN** both messages MUST remain visible
- **AND** parity logic MUST NOT collapse them only because their text is partially similar

### Requirement: Assistant And Reasoning Parity MUST Use Shared Semantic Equivalence

assistant and reasoning facts MUST use shared equivalence rules across realtime, completed, and history sources.

#### Scenario: assistant history replay does not duplicate realtime answer

- **WHEN** realtime path already displayed an assistant answer
- **AND** history replay provides equivalent assistant content
- **THEN** history hydrate MUST converge with the existing assistant fact
- **AND** MUST NOT add a second assistant row with the same body

#### Scenario: reasoning snapshots converge across carriers

- **WHEN** reasoning content arrives as realtime summary, thinking content, completed snapshot, or history hydrate
- **AND** the normalized reasoning content is equivalent for the same turn
- **THEN** the system MUST converge it to one reasoning fact
- **AND** engine-specific display titles MUST NOT change duplicate judgment

#### Scenario: distinct reasoning steps remain distinct

- **WHEN** two reasoning observations describe different steps
- **THEN** the system MUST keep them as distinct reasoning facts
- **AND** shared prefixes or similar wording MUST NOT force a merge

### Requirement: Structured Tool And Control Facts MUST Replay Consistently

structured tool facts and user-readable control events MUST retain their transcript role across realtime and history.

#### Scenario: file changes replay as structured tool facts

- **WHEN** file changes were shown during realtime execution
- **AND** history hydrate replays the same file changes
- **THEN** the system MUST render them as structured tool/file-change facts
- **AND** MUST NOT replay internal resume markers as assistant prose

#### Scenario: modeBlocked remains a control event after history reopen

- **WHEN** a turn entered `modeBlocked` during realtime execution
- **AND** the thread is reopened from history
- **THEN** `modeBlocked` MUST remain a compact control event
- **AND** MUST NOT appear as ordinary assistant text

#### Scenario: request_user_input settled state survives history hydrate

- **WHEN** a `request_user_input` was submitted, timed out, dismissed, cancelled, or marked stale
- **AND** history hydrate replays the thread
- **THEN** the settled state MUST be preserved or reconstructed
- **AND** the request MUST NOT become actionable again unless a new request was emitted

### Requirement: Presentation State MUST Not Become Durable Transcript Fact

presentation-only state MUST remain outside durable transcript parity checks.

#### Scenario: history loading placeholder does not persist as message

- **WHEN** the UI shows a history loading, live placeholder, spinner, or scroll/sticky affordance
- **THEN** that state MUST be classified as presentation-state
- **AND** it MUST NOT become a durable transcript row after hydrate or reopen

#### Scenario: Markdown presentation convergence does not change fact identity

- **WHEN** live rendering uses throttled Markdown, staged Markdown, or plain-text fallback
- **THEN** completion MUST converge to final Markdown presentation
- **AND** the presentation strategy MUST NOT create extra dialogue facts

