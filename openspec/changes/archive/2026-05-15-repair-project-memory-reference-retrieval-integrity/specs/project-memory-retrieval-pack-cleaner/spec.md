## ADDED Requirements

### Requirement: Retrieval pack receives repaired fallback candidates

The system SHALL preserve Retrieval Pack and Cleaner contracts when Memory Reference candidates are selected by repaired lexical fallback ranking.

#### Scenario: Identity fallback candidate becomes source record

- **GIVEN** repaired fallback ranking selects an identity-related Project Memory record
- **WHEN** Memory Reference injects context into the main conversation
- **THEN** the selected memory SHALL be represented as a Retrieval Pack source record with stable `[Mx]` index
- **AND** the user-visible message SHALL remain the original user question

#### Scenario: Diagnostics do not leak memory body

- **WHEN** Memory Reference logs fallback retrieval diagnostics
- **THEN** diagnostics SHALL include status, mode, counts, ids, or elapsed time only
- **AND** diagnostics SHALL NOT include full `userInput`, `assistantResponse`, `cleanText`, or cleaned context
