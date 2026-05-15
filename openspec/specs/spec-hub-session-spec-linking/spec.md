# spec-hub-session-spec-linking Specification

## Purpose

Defines the spec-hub-session-spec-linking behavior contract, covering New Session MUST Inherit Resolved Spec Root.

## Requirements
### Requirement: New Session MUST Inherit Resolved Spec Root

The system SHALL inject workspace `resolvedSpecRoot` into new session startup context for spec visibility checks.

#### Scenario: Start session with external configured spec root

- **GIVEN** workspace has custom `resolvedSpecRoot` configured in Spec Hub
- **WHEN** user creates a new session in the same workspace
- **THEN** session startup SHALL include that path in spec scanning target set
- **AND** assistant spec visibility decision SHALL be based on that injected path

#### Scenario: Start session with default spec root

- **GIVEN** workspace has no custom spec root and defaults to `<workspace>/openspec`
- **WHEN** user creates a new session
- **THEN** session SHALL use default resolved root
- **AND** behavior SHALL remain backward compatible for existing in-workspace OpenSpec projects

### Requirement: Session-Level Spec Visibility Probe

The system SHALL perform session-level probe for linked spec root and expose structured results.

#### Scenario: Probe succeeds

- **WHEN** linked spec root exists and has valid structure
- **THEN** probe result SHALL be `visible`
- **AND** assistant SHALL answer that spec is accessible in current session

#### Scenario: Probe fails due to invalid root

- **WHEN** linked spec root is missing, inaccessible, or malformed
- **THEN** probe result SHALL be structured (`invalid` or `permissionDenied` or `malformed`)
- **AND** session SHALL provide actionable remediation options

#### Scenario: Visible probe does not show repair noise

- **WHEN** probe status is `visible`
- **THEN** session context card SHALL NOT show rebind/default repair actions
- **AND** guidance text SHALL indicate active root is already usable

### Requirement: No Silent Fallback on Session Link Failure

The system MUST avoid silent fallback to inferred paths when explicit session link is present but invalid.

#### Scenario: Explicit link invalid

- **GIVEN** session has explicit linked spec root from Spec Hub
- **WHEN** probe on linked root fails
- **THEN** system SHALL surface blocking status in session startup summary
- **AND** system SHALL NOT report “spec unavailable” based only on legacy inferred path rules

### Requirement: Session Repair Actions for Spec Link

The system SHALL provide in-session repair actions for failed spec linking.

#### Scenario: Rebind to current Spec Hub path

- **WHEN** session detects invalid link and user chooses rebind action
- **THEN** system SHALL fetch latest workspace `resolvedSpecRoot` and rerun probe
- **AND** session status SHALL update in-place without restarting app

#### Scenario: Restore default spec root

- **WHEN** user chooses restore-default action
- **THEN** system SHALL switch link target to `<workspace>/openspec`
- **AND** probe result and assistant answer SHALL reflect updated target

