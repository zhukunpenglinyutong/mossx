## ADDED Requirements

### Requirement: Claude Live Assistant Delta MUST Avoid Per-Delta Full Thread Derivation

Claude live assistant text updates MUST avoid full thread canonical derivation for repeated pure text deltas when the thread structure is unchanged.

#### Scenario: repeated text delta uses reducer fast path
- **WHEN** a Claude live turn appends text delta to an existing assistant message with the same item id
- **AND** the update does not introduce a new conversation item or change item kind
- **THEN** the reducer MUST update only the affected assistant item
- **AND** it MUST NOT run full `prepareThreadItems(...)` for that delta

#### Scenario: boundary events return to canonical derivation
- **WHEN** the assistant message completes, a structured item is inserted, or a legacy/canonical id migration is required
- **THEN** the reducer MUST run the canonical derivation path
- **AND** final thread items MUST preserve existing semantics for dedupe, truncation, generated image anchoring, and final metadata

#### Scenario: fast path preserves final metadata guard
- **WHEN** an existing finalized assistant message receives additional live text while the thread is still processing
- **THEN** the reducer MUST clear stale final metadata before showing the message as live again
- **AND** it MUST NOT leave a streaming assistant message marked as final
