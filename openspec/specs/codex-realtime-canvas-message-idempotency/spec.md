# codex-realtime-canvas-message-idempotency Specification

## Purpose
Define the idempotency contract for Codex realtime assistant message ingestion, so alias events, fallback ids, near-duplicate snapshots, and terminal reconciliation converge without duplicating visible assistant output.

## Requirements
### Requirement: Codex Realtime Assistant Events MUST Be Idempotent
Codex realtime assistant message ingestion MUST converge duplicate or alias event shapes for the same semantic assistant response into a single conversation item.

#### Scenario: delta completed and terminal fallback converge
- **WHEN** a Codex turn emits assistant content through `item/agentMessage/delta`
- **AND** the same assistant content is later observed through `item/completed` or `turn/completed`
- **THEN** the conversation state MUST contain exactly one visible assistant message for that semantic response
- **AND** terminal metadata MAY update the existing item instead of appending another item

#### Scenario: snapshot before delta converges
- **WHEN** a Codex turn emits an `agentMessage` snapshot through `item/started` or `item/updated`
- **AND** equivalent assistant content is later observed through a streaming delta or completion event
- **THEN** the conversation state MUST merge those observations into the same assistant message
- **AND** the user MUST NOT see two adjacent assistant bubbles containing the same response

#### Scenario: fallback id does not create duplicate assistant bubble
- **WHEN** Codex terminal fallback uses a generated item id such as a turn id or `assistant-final-*`
- **AND** an equivalent assistant message already exists in the same thread for the current turn
- **THEN** the fallback MUST update or be ignored in favor of the existing assistant message
- **AND** it MUST NOT append a second assistant message solely because the fallback id differs

#### Scenario: snapshot tail repeat converges inside one assistant message
- **WHEN** a Codex assistant snapshot or completion contains `prefix + response block + repeated response block`
- **AND** the repeated trailing block is equivalent or near-equivalent to the previous response block
- **THEN** the conversation state MUST keep one readable copy of that response block inside the assistant message
- **AND** the user MUST NOT see the same list, permission guidance, or closing summary repeated inside one bubble

#### Scenario: streaming delta repeat converges after an inline sentence boundary
- **WHEN** a Codex assistant delta appends a second copy of the same response after an existing closing sentence
- **AND** the boundary appears inline, such as `...Use。 Computer Use ...`
- **THEN** duplicate normalization MUST split the inline sentence boundary for comparison
- **AND** the conversation state MUST keep one readable copy of the response block

#### Scenario: streaming delta repeat converges when the first prefix is truncated
- **WHEN** a Codex assistant delta repeats the same response but the first copy starts with a truncated prefix, such as `Use...` instead of `Computer Use...`
- **AND** the repeated response body contains equivalent tool result summaries, permission guidance, or action steps
- **THEN** duplicate normalization MUST treat the truncated prefix and full prefix as the same duplicate block when the shorter text is substantial
- **AND** the conversation state MUST keep one readable copy of the response block

#### Scenario: upsert snapshot alias converges across different item ids
- **WHEN** a Codex assistant snapshot arrives through `upsertItem` with a different item id
- **AND** a recent assistant message in the same thread has structurally near-equivalent paragraphs, list items, or permission guidance
- **THEN** the reducer MUST merge the snapshot into the existing assistant item
- **AND** it MUST NOT append a second assistant bubble solely because the snapshot id differs

#### Scenario: upsert snapshot alias converges when it starts with the previous bridge sentence
- **WHEN** a Codex assistant snapshot alias starts with the previous assistant closing or bridge sentence
- **AND** the remainder repeats the same structured response block with near-equivalent wording
- **THEN** reducer duplicate detection MUST evaluate the collapsed merge result
- **AND** it MUST merge the alias into the existing assistant item when the result converges to roughly one response block

#### Scenario: terminal history reconciliation replaces dirty realtime state
- **WHEN** a Codex realtime turn reaches `turn/completed`
- **AND** local realtime state may contain duplicate or aliased assistant output
- **THEN** the client MUST schedule at most one delayed history-detail reconciliation for that Codex thread and turn
- **AND** the reconciliation MUST reuse the existing thread history/resume path to replace local realtime items with persisted history items
- **AND** assistant item completion alone MUST NOT trigger history reconciliation while the turn is still streaming or processing
- **AND** the reconciliation MUST NOT run for Claude, Gemini, OpenCode, or shared-session threads

### Requirement: Codex Assistant Segmentation MUST Preserve Real Separate Messages
Codex duplicate protection MUST NOT collapse genuinely separate assistant segments that are separated by tool activity or contain non-equivalent assistant content.

#### Scenario: tool-separated assistant segments remain separate
- **WHEN** a Codex turn contains assistant text, then a tool item, then different assistant text
- **THEN** the conversation state MUST preserve separate assistant message segments
- **AND** duplicate protection MUST NOT merge them only because they belong to the same thread

#### Scenario: non-equivalent assistant content remains separate
- **WHEN** two assistant messages in a Codex thread have different semantic content
- **THEN** the conversation state MUST preserve both messages
- **AND** duplicate protection MUST only apply to equivalent or near-equivalent repeated content
