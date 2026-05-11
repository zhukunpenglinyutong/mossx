## ADDED Requirements

### Requirement: Claude History MUST Format User-Meaningful Local Control Events

Claude history restore MUST project user-meaningful Claude CLI local control events as formatted control-event rows or compact status tags instead of rendering raw XML-like command text as normal user or assistant chat messages.

#### Scenario: resume failure is shown as a formatted event

- **WHEN** a Claude history transcript contains a local command sequence for `/resume` followed by `<local-command-stdout>Session ... was not found.</local-command-stdout>`
- **THEN** the system MUST NOT render `<command-name>` or `<local-command-stdout>` as ordinary user message text
- **AND** it MUST render a formatted control event that communicates the resume failure

#### Scenario: model switch stdout is shown as a formatted event

- **WHEN** a Claude history transcript contains local command stdout indicating a model switch such as `Set model to ...`
- **THEN** the system MUST NOT expose the raw `<local-command-stdout>` wrapper
- **AND** it MUST render a compact formatted event preserving the user-visible model change

#### Scenario: interrupted marker remains readable without becoming normal assistant text

- **WHEN** a Claude history transcript contains a user interruption marker such as `[Request interrupted by user]`
- **THEN** the system MUST render it as a non-dialogue event row or status tag
- **AND** it MUST NOT treat the marker as assistant final answer content

### Requirement: Claude History MUST Hide Internal-Only Control Records

Claude history restore MUST filter internal-only control records from the user-visible conversation surface.

#### Scenario: internal metadata records are hidden

- **WHEN** a Claude history transcript contains records with types such as `permission-mode`, `file-history-snapshot`, `last-prompt`, `queue-operation`, `attachment`, or system subtypes such as `stop_hook_summary` and `turn_duration`
- **THEN** those records MUST NOT appear as visible conversation messages
- **AND** their presence MUST NOT cause the history thread to render as empty when real conversation content exists

#### Scenario: synthetic no-response assistant is hidden

- **WHEN** a Claude history transcript contains an assistant message with model `<synthetic>` and content `No response requested.`
- **THEN** the system MUST hide that synthetic assistant row
- **AND** it MUST NOT use it as evidence of a real assistant response

#### Scenario: control-only transcript is omitted or non-chat surfaced

- **WHEN** a Claude history transcript contains no real user or assistant conversation after internal-only records are filtered and no user-meaningful local control event remains
- **THEN** the system MUST NOT expose it as a normal chat conversation
- **AND** it MUST NOT render a blank message surface as if the transcript were corrupted

### Requirement: Claude History Local Control Classification MUST Preserve Real Conversation

Claude history local control classification MUST be high-confidence and MUST preserve normal conversation content.

#### Scenario: mixed transcript keeps real user and assistant messages

- **WHEN** a Claude history transcript contains real user and assistant messages mixed with local command control events and internal-only records
- **THEN** the system MUST preserve the real user and assistant messages
- **AND** it MUST only format or hide the non-dialogue records according to their classification

#### Scenario: normal text mentioning command terms is preserved

- **WHEN** a real user or assistant message naturally mentions terms such as `resume`, `stdout`, `local-command`, or `app-server`
- **THEN** the system MUST preserve that message
- **AND** it MUST NOT filter or reclassify the message solely by keyword matching

#### Scenario: platform-independent behavior

- **WHEN** equivalent Claude history JSONL content is restored on Windows, macOS, or Linux
- **THEN** local control event formatting and internal record filtering MUST follow the same classification rules
- **AND** platform differences MUST NOT require separate visible-message semantics

#### Scenario: path style and line endings do not alter classification

- **WHEN** equivalent Claude history JSONL content uses macOS-style paths, Windows-style paths, LF line endings, or CRLF line endings
- **THEN** local control event classification MUST produce equivalent visible conversation semantics
- **AND** path strings MUST NOT be parsed with platform-specific separators to decide whether a row is hidden, formatted, or preserved

### Requirement: Claude History Visibility Regression Gates MUST Be CI-Compatible

Claude history transcript visibility changes MUST include regression gates that can run in the existing CI model or an explicitly added equivalent gate.

#### Scenario: focused backend and frontend tests are included by CI

- **WHEN** Claude history local-control classification behavior changes
- **THEN** focused Rust tests for `engine::claude_history` and focused Vitest tests for `claudeHistoryLoader` MUST be added or updated
- **AND** those tests MUST be reachable from the repository's CI backend/frontend test commands, not only from manual local commands

#### Scenario: Windows compatibility is validated without Windows-only semantics

- **WHEN** the regression suite covers Windows-oriented Claude history samples
- **THEN** the expected visible transcript semantics MUST match macOS/Linux samples for equivalent JSONL
- **AND** the implementation MUST NOT add a Windows-only filtering branch to mask a classifier contract gap
