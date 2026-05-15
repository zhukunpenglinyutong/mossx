## ADDED Requirements

### Requirement: Semantic availability honesty

The system SHALL report production semantic retrieval only when a real production local embedding provider is available and used by the Memory Reference send path.

#### Scenario: No provider is lexical fallback

- **WHEN** the user sends a Memory Reference query and no production semantic provider is configured
- **THEN** semantic retrieval SHALL be reported as unavailable or absent
- **AND** retrievalMode SHALL remain `lexical`
- **AND** the system MUST NOT label lexical fallback as semantic or hybrid retrieval

#### Scenario: Test provider is not production capability

- **WHEN** semantic tests use fake or test-scoped providers
- **THEN** those tests SHALL NOT be used as evidence that production vector retrieval is enabled
- **AND** production send-path tests SHALL verify behavior without `allowTestProvider`
