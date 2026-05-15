# spec-platform-environment-management Specification

## Purpose

Defines the spec-platform-environment-management behavior contract, covering Environment Doctor for Spec Workspace.

## Requirements

### Requirement: Environment Doctor for Spec Workspace

The system SHALL provide an environment doctor before executing spec workflow actions.

#### Scenario: Diagnose workspace environment

- **WHEN** user opens Spec Hub for a workspace
- **THEN** system SHALL report required runtime availability and version checks
- **AND** diagnosis result SHALL be visible in workspace context

### Requirement: Managed and BYO Modes

The system SHALL support managed mode and BYO mode for environment handling.

#### Scenario: Managed mode for OpenSpec

- **WHEN** workspace provider is OpenSpec and user selects managed mode
- **THEN** system SHALL guide installation and health checks for OpenSpec runtime dependencies
- **AND** system SHALL provide recovery guidance on failures

#### Scenario: BYO mode

- **WHEN** user selects BYO mode
- **THEN** system SHALL use system-installed command path and version
- **AND** system SHALL expose diagnostics without mutating user environment

### Requirement: OpenSpec-First Installation Policy

The system SHALL treat OpenSpec runtime readiness as primary installation target in early phases.

#### Scenario: OpenSpec and spec-kit both detectable

- **WHEN** environment doctor detects both providers
- **THEN** managed installation guidance SHALL prioritize OpenSpec path
- **AND** spec-kit guidance SHALL be presented as minimal-hook compatibility information

