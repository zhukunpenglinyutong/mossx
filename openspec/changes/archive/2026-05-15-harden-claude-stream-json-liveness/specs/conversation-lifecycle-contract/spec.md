## ADDED Requirements

### Requirement: Claude Stream Startup Failure MUST Deterministically Settle Turn Lifecycle

Within the unified conversation lifecycle, a Claude turn that never establishes a valid realtime stream MUST leave pseudo-processing through a deterministic terminal error.

#### Scenario: no valid claude stream settles processing

- **WHEN** a Claude foreground turn starts in the GUI
- **AND** backend cannot observe any valid Claude stream-json event within the bounded startup window
- **THEN** the turn MUST settle as terminal error
- **AND** the conversation MUST leave ordinary processing state for that turn
- **AND** the user MUST regain an interactive thread state without manually restarting the app

#### Scenario: startup failure remains engine-scoped

- **WHEN** Claude stream startup timeout handling is introduced
- **THEN** Codex, Gemini, and OpenCode lifecycle behavior MUST remain unchanged
- **AND** provider-specific compatibility logic MUST NOT leak into the shared lifecycle layer
