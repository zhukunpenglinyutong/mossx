## ADDED Requirements

### Requirement: Activation Lane MUST Support Codex CLI Plugin Contract Verification

Activation lane MUST support verifying the Codex CLI plugin cache contract without executing the helper directly from mossx.

#### Scenario: cli cache contract removes helper bridge blocker
- **WHEN** CLI plugin cache descriptor and helper file are present
- **AND** descriptor args include `mcp`
- **THEN** activation MAY mark helper bridge verified for the current app session
- **AND** MUST keep remaining permission/approval blockers

#### Scenario: cli cache activation avoids direct exec
- **WHEN** helper path belongs to Codex CLI plugin cache
- **THEN** activation MUST NOT spawn `SkyComputerUseClient`
- **AND** MUST return a diagnostic message explaining that Codex CLI is the launch parent
