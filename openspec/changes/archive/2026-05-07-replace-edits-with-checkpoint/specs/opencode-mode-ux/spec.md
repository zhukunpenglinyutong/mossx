## MODIFIED Requirements

### Requirement: OpenCode Unified Status Panel

The system MUST provide a unified status panel in OpenCode mode showing key runtime context.

#### Scenario: show OpenCode runtime status

- **WHEN** user enters OpenCode conversation mode
- **THEN** UI MUST show current Session, Agent, Model, Provider, MCP, and Token/Context status

#### Scenario: legacy edits area is replaced by checkpoint result surface

- **WHEN** OpenCode mode renders the status panel region that previously exposed `Edits`
- **THEN** system MUST expose the new `Checkpoint/Result` surface instead of legacy `Edits`
- **AND** the panel MUST prioritize verdict, evidence, risks, and next actions over raw file-list repetition

#### Scenario: checkpoint continues to reuse canonical file-change facts

- **WHEN** OpenCode status panel checkpoint shows changed-file evidence
- **THEN** file counts and `+/-` aggregates MUST reuse canonical conversation file facts
- **AND** introducing checkpoint MUST NOT create a parallel file-change summary contract
