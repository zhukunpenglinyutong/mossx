## MODIFIED Requirements

### Requirement: OpenCode Provider Health Check

The system MUST provide provider health checks and explicit connection status in OpenCode mode, and these checks MUST run only from explicit user-triggered refresh actions instead of background sidebar/bootstrap probes. On Windows, any explicit readiness or refresh action that resolves a launcher-like OpenCode candidate MUST fail safely with diagnostics instead of activating an external foreground window.

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

#### Scenario: Windows explicit refresh does not bring OpenCode to foreground

- **WHEN** the user explicitly triggers OpenCode refresh or readiness on Windows
- **AND** the resolved OpenCode candidate is launcher-like or unsafe for background CLI probing
- **THEN** the system MUST return a stable diagnostic result for the current OpenCode status surface
- **AND** it MUST NOT bring an external OpenCode window to the foreground

#### Scenario: healthy explicit refresh still works on supported Windows CLI candidate

- **WHEN** the user explicitly triggers OpenCode refresh or readiness on Windows
- **AND** the resolved OpenCode candidate is a background-safe CLI
- **THEN** the system MUST continue the explicit refresh flow successfully
- **AND** it MUST preserve the existing OpenCode manual refresh interaction model
