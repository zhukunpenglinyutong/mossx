## MODIFIED Requirements

### Requirement: Activation Lane MUST Support Codex CLI Plugin Contract Verification

Activation lane MUST support verifying the Codex CLI plugin cache contract without executing the helper directly from mossx, and broker execution MUST depend on that verification.

#### Scenario: cli cache contract removes helper bridge blocker
- **WHEN** CLI plugin cache descriptor and helper file are present
- **AND** descriptor args include `mcp`
- **THEN** activation MAY mark helper bridge verified for the current app session
- **AND** MUST keep remaining permission/approval blockers

#### Scenario: cli cache activation avoids direct exec
- **WHEN** helper path belongs to Codex CLI plugin cache
- **THEN** activation MUST NOT spawn `SkyComputerUseClient`
- **AND** MUST return a diagnostic message explaining that Codex CLI is the launch parent

#### Scenario: broker may attempt manual permission resolution
- **WHEN** activation has verified the CLI cache helper contract but only `permission_required` or `approval_required` remains
- **THEN** broker MAY allow an explicit user-triggered Codex run
- **AND** guidance MUST explain that official Codex may still require macOS permissions or allowed-app approval
