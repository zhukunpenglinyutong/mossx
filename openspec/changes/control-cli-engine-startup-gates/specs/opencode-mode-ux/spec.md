## MODIFIED Requirements

### Requirement: OpenCode Provider Health Check

The system MUST provide provider health checks and explicit connection status in OpenCode mode, and these checks MUST run only from explicit user-triggered refresh actions instead of background sidebar/bootstrap probes. On Windows, any explicit readiness or refresh action that resolves a launcher-like OpenCode candidate MUST fail safely with diagnostics instead of activating an external foreground window. Across all supported desktop platforms, startup detection MUST avoid unnecessary repeated OpenCode CLI processes before the user explicitly enters OpenCode-specific flows.

#### Scenario: startup detection does not fan out multiple OpenCode probes

- **WHEN** the desktop client boots and OpenCode is enabled
- **THEN** the system MUST use lightweight OpenCode availability detection during startup
- **AND** it MUST NOT chain status detect, commands fallback, and model refresh into repeated startup-time CLI launches unless the user explicitly enters an OpenCode flow

#### Scenario: disabled OpenCode closes entry surfaces and runtime probing

- **WHEN** the user disables OpenCode from the CLI validation settings
- **THEN** the system MUST close OpenCode entry surfaces in selector and workspace creation flows
- **AND** it MUST NOT execute OpenCode detect, model refresh, provider health, or status snapshot probing as part of normal app startup and refresh flows

#### Scenario: disabled OpenCode commands return stable diagnostics

- **WHEN** a client path still calls an OpenCode-specific command while OpenCode is disabled
- **THEN** the system MUST return a stable disabled diagnostic
- **AND** it MUST NOT fall through to OpenCode CLI execution as a fallback
