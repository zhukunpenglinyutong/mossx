## ADDED Requirements

### Requirement: Bridge MUST Distinguish CLI Cache Contract From App Bundle Contract

Computer Use bridge MUST not treat all nested app-bundle helper paths as the same launch contract.

#### Scenario: cli cache helper is preferred over app bundled helper
- **WHEN** both Codex CLI plugin cache and Codex.app bundled plugin contain Computer Use descriptors
- **THEN** bridge MUST prefer the CLI cache descriptor
- **AND** MUST show the cache descriptor/helper paths in status diagnostics

#### Scenario: direct helper workaround remains rejected
- **WHEN** helper launch contract requires Codex CLI or Codex App parent
- **THEN** bridge guidance MUST NOT instruct users to manually execute `SkyComputerUseClient`
- **AND** MUST explain that Codex CLI is the supported parent path for the CLI plugin cache
