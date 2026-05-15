## ADDED Requirements

### Requirement: Memory Reference fallback recall integrity

When production semantic retrieval is unavailable, the system SHALL still perform reliable lexical fallback retrieval for Memory Reference and MUST NOT discard obvious recall-intent memories solely because the raw user query is not a contiguous substring.

#### Scenario: Identity recall does not depend on exact substring

- **GIVEN** current workspace Project Memory contains a record whose content includes `我是陈湘宁`
- **WHEN** the user enables Memory Reference and sends `我是谁`
- **THEN** the system SHALL consider that memory as a candidate
- **AND** the injected retrieval pack SHALL include the memory if it is within the selected fallback budget

#### Scenario: Broad fallback candidates precede local ranking

- **WHEN** semantic retrieval has no production provider
- **THEN** Memory Reference SHALL fetch a broad workspace candidate set without raw query filtering
- **AND** the broad fallback scan SHALL be allowed to continue across bounded pages when the first page is full
- **AND** SHALL apply local multi-field ranking before deciding that no related project memory exists

#### Scenario: Fallback remains bounded

- **WHEN** Memory Reference fetches broad fallback candidates
- **THEN** the candidate request SHALL use an explicit bounded page size
- **AND** the total fallback scan SHALL stop at an explicit maximum item count
- **AND** the final injected records SHALL remain capped by the existing Memory Scout selection budget

#### Scenario: Identity recall avoids assistant self-introduction false positives

- **GIVEN** a memory only proves that the assistant said `我是 Codex`
- **WHEN** the user sends `我是谁`
- **THEN** the system SHALL NOT promote that memory as user identity evidence
