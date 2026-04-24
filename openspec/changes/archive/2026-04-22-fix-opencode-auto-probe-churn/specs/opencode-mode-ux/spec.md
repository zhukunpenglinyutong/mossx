## MODIFIED Requirements

### Requirement: OpenCode Provider Health Check

The system MUST provide provider health checks and explicit connection status in OpenCode mode, and these checks MUST run only from explicit user-triggered refresh actions instead of background sidebar/bootstrap probes.

#### Scenario: test provider connection

- **WHEN** user triggers provider connection test
- **THEN** system MUST show visual connection result
- **AND** on failure MUST display clear error reason

#### Scenario: opening workspace session menu does not auto-probe OpenCode

- **WHEN** user opens the workspace "new session" menu for a connected workspace
- **THEN** system MUST NOT automatically call OpenCode provider-health detection
- **AND** system MUST NOT enter a transient "checking" state unless the user explicitly triggers refresh

#### Scenario: unrelated engine refresh does not probe OpenCode

- **WHEN** the client refreshes Claude-only model state for a pending Claude thread
- **THEN** system MUST NOT trigger OpenCode engine/provider detection as a side effect
- **AND** OpenCode readiness MUST remain unchanged until the user explicitly refreshes it
