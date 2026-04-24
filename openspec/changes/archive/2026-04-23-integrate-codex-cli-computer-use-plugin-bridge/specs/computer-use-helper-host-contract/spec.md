## ADDED Requirements

### Requirement: Host Contract Diagnostics MUST Recognize Codex CLI Signed Parent Evidence

Host-contract diagnostics MUST account for the OpenAI-signed Codex CLI native parent that launches the Computer Use MCP server.

#### Scenario: codex cli native parent satisfies helper parent team evidence
- **WHEN** helper path is from CLI plugin cache
- **AND** OpenAI-signed Codex CLI native binary evidence is available
- **THEN** diagnostics MAY return `handoff_verified` as diagnostic evidence
- **AND** MUST NOT imply mossx directly executed the helper

#### Scenario: missing cli parent evidence remains conservative
- **WHEN** helper path is from CLI plugin cache but Codex CLI parent evidence cannot be established
- **THEN** diagnostics MUST remain conservative
- **AND** MUST NOT return `ready`
