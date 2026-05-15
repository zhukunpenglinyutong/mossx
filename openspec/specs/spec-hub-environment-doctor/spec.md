# spec-hub-environment-doctor Specification

## Purpose

Defines the spec-hub-environment-doctor behavior contract, covering Managed and BYO Mode Selection.

## Requirements
### Requirement: Managed and BYO Mode Selection

The system SHALL support workspace-level runtime mode selection between managed mode and BYO mode.

#### Scenario: Persist mode preference

- **WHEN** user selects runtime mode for a workspace
- **THEN** system SHALL persist selected mode at workspace scope
- **AND** mode SHALL remain effective after app restart

### Requirement: Dependency Health Diagnostics

The system SHALL provide structured diagnostics for required tooling availability and version.

#### Scenario: Bridge command readiness check

- **WHEN** workspace tier target is `bridge`
- **THEN** doctor SHALL verify configured native commands per action
- **AND** diagnostics SHALL expose command status for gate mapping

### Requirement: Safe Degrade to Read-Only

The system MUST degrade to read-only capability when execution prerequisites are not met.

#### Scenario: Doctor reports unhealthy environment

- **WHEN** runtime health state is unhealthy
- **THEN** Spec Hub SHALL keep browsing features available
- **AND** execution actions SHALL be disabled with explicit blocker messages

### Requirement: Recovery Guidance and Retry

The system SHALL provide recovery actions and retry path for failed environment checks.

#### Scenario: User retries after fixing environment

- **WHEN** user completes suggested fix and triggers doctor recheck
- **THEN** system SHALL rerun diagnostics and refresh health state
- **AND** previously blocked actions SHALL become available if prerequisites pass

### Requirement: Spec-kit Auto Strategy Diagnostics

The system SHALL validate spec-kit auto strategy configuration before enabling bridge routes.

#### Scenario: Strategy config invalid

- **WHEN** strategy configuration is malformed or missing required fields
- **THEN** doctor SHALL report structured config error with remediation hint
- **AND** bridge-routed actions SHALL remain blocked

#### Scenario: Strategy config valid

- **WHEN** strategy configuration is valid and dependencies are healthy
- **THEN** doctor SHALL mark bridge readiness as healthy
- **AND** runtime SHALL allow bridge-routed actions by matrix policy

### Requirement: Safe Degrade by Route Priority

The system MUST degrade by route priority when preferred route is unavailable.

#### Scenario: Bridge unavailable but guided available

- **WHEN** bridge readiness fails and ai-guided route is available
- **THEN** effective source SHALL downgrade to `ai`
- **AND** doctor/output SHALL include downgrade reason

#### Scenario: Guided unavailable and passthrough only

- **WHEN** guided route is unavailable and passthrough is the last available route
- **THEN** system SHALL degrade to passthrough-only execution capability
- **AND** doctor SHALL provide remediation checklist for restoring higher-tier routes

### Requirement: Provider-Scoped Diagnostics in Coexistence Workspace

The doctor SHALL report diagnostics by provider scope when OpenSpec and spec-kit coexist.

#### Scenario: Coexistence diagnostics rendering

- **WHEN** workspace has both providers
- **THEN** doctor SHALL produce isolated diagnostics sections for `openspec` and `spec-kit`
- **AND** spec-kit readiness failure SHALL NOT mark OpenSpec scope as unhealthy by default

### Requirement: Cross-Platform Readiness Diagnostics Consistency

The doctor SHALL evaluate spec-kit readiness with consistent rule semantics across macOS and Windows.

#### Scenario: Command/path checks on different platforms

- **WHEN** doctor performs command reachability and path permission checks on macOS or Windows
- **THEN** diagnostics SHALL normalize platform-specific probe results into shared error categories
- **AND** remediation hints SHALL remain actionable without relying on OS-hardcoded assumptions

