## ADDED Requirements

### Requirement: Engine Transcript Records MUST Carry A Classified Channel Before Projection

The system MUST classify engine transcript records by provenance and channel before projecting them into user-visible conversation state.

#### Scenario: dialogue projection requires explicit dialogue channel

- **WHEN** a transcript record is projected as a normal user or assistant message
- **THEN** the system MUST have classified it as `dialogue.user` or `dialogue.assistant`
- **AND** records classified as `control-plane`, `synthetic-runtime`, `diagnostic`, or `quarantine` MUST NOT be projected as normal dialogue

#### Scenario: cross-engine payload fails closed

- **WHEN** a transcript record belongs to one engine's control-plane protocol but is found in another engine's history or runtime stream
- **THEN** the system MUST classify it as contamination or quarantine
- **AND** it MUST NOT use the record as user input, assistant output, session title, first message, or message count evidence

#### Scenario: unknown high-risk runtime record is quarantined

- **WHEN** a transcript record lacks enough provenance to prove it is user or assistant dialogue
- **AND** it contains high-risk runtime structure such as RPC initialize payloads, injected developer instructions, synthetic continuation summaries, or local command wrappers
- **THEN** the system MUST quarantine or hide it
- **AND** it MUST NOT default to rendering the raw text as a chat bubble

### Requirement: Runtime Control Plane MUST Stay Out Of Persistent Dialogue History

The system MUST keep runtime control-plane data separate from persistent dialogue history even when the underlying engine writes both into the same external transcript file.

#### Scenario: launch protocol payload is not persisted as dialogue

- **WHEN** the application sends launch, initialize, capability negotiation, or injected instruction payloads to an engine runtime
- **THEN** those payloads MUST NOT be mirrored into app-owned persistent dialogue history as user messages
- **AND** if the external engine writes them into its own transcript, app restore MUST classify them as control-plane contamination

#### Scenario: continuation summary is not user-authored content

- **WHEN** an engine emits a synthetic continuation, compaction, or resume summary to recover context
- **THEN** the system MUST treat it as `synthetic-runtime`
- **AND** it MUST NOT display it as user-authored dialogue or feed it back as a fresh user request without an explicit engine-owned resume protocol

#### Scenario: user-authored summary text is preserved

- **WHEN** a real user message naturally asks about summaries, previous conversations, app servers, developers, or injected prompts
- **THEN** the system MUST preserve that message
- **AND** it MUST NOT classify the message as contamination solely by keyword matching

### Requirement: Engine History Scanners MUST Apply Isolation Before Session Metadata

The system MUST apply transcript channel isolation before deriving session metadata.

#### Scenario: contaminated first row does not become session title

- **WHEN** a history file begins with a control-plane or synthetic-runtime record
- **THEN** the session scanner MUST NOT use that record as the visible title or first message
- **AND** it MUST continue scanning for the first real dialogue record when present

#### Scenario: control-only transcript is not a normal conversation

- **WHEN** a history transcript contains only control-plane, synthetic-runtime, diagnostic, or quarantine records after classification
- **THEN** the scanner MUST NOT expose it as a normal conversation session
- **AND** it MUST NOT create an empty user-visible chat surface for that transcript

#### Scenario: mixed transcript metadata uses real dialogue only

- **WHEN** a history transcript contains real dialogue mixed with contaminated records
- **THEN** session title, first message, timestamps, and message count MUST be derived from preserved real dialogue and allowed non-dialogue event policy
- **AND** contaminated records MUST NOT inflate message count

### Requirement: Engine Isolation MUST Be Protected By A Cross-Engine Contamination Matrix

The system MUST include regression tests that prove channel isolation for known contamination families and normal text lookalikes.

#### Scenario: contamination matrix covers known payload families

- **WHEN** backend and frontend regression suites run
- **THEN** they MUST cover Codex app-server initialize payloads, injected developer instructions, Claude local command wrappers, synthetic no-response rows, and synthetic continuation or compaction summaries
- **AND** each contaminated fixture MUST prove the record is not projected as normal user or assistant dialogue

#### Scenario: normal lookalike text remains visible

- **WHEN** regression suites include normal user or assistant text mentioning app-server, previous conversation, summary, developer, resume, or local command terminology
- **THEN** that text MUST remain visible as normal dialogue
- **AND** the tests MUST prove the classifier is not a pure keyword blacklist

#### Scenario: gates are CI-compatible

- **WHEN** the change is ready for implementation handoff or merge
- **THEN** focused Rust and Vitest tests for the contamination matrix MUST be runnable locally
- **AND** the same tests MUST be reachable from the repository's existing CI commands or an explicitly added equivalent gate
