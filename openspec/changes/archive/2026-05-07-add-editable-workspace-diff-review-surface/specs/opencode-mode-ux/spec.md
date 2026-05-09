## MODIFIED Requirements

### Requirement: OpenCode Unified Status Panel

The system MUST provide a unified status panel in OpenCode mode showing key runtime context.

#### Scenario: show OpenCode runtime status

- **WHEN** user enters OpenCode conversation mode
- **THEN** UI MUST show current Session, Agent, Model, Provider, MCP, and Token/Context status

#### Scenario: checkpoint review diff can escalate into editable workspace review

- **WHEN** the bottom checkpoint result surface opens a file-scoped review diff for a live workspace file
- **THEN** the review flow MUST be able to enter editable review mode for that file
- **AND** non-workspace or read-only review targets MUST remain read-only
