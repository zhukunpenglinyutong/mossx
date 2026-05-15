# spec-platform-speckit-hook Specification

## Purpose

Defines the spec-platform-speckit-hook behavior contract, covering Minimal Compatibility Hook for Spec-Kit.

## Requirements

### Requirement: Minimal Compatibility Hook for Spec-Kit

The system SHALL expose spec-kit through a minimal compatibility hook instead of full parity support.

#### Scenario: Mark minimal support level

- **WHEN** workspace provider is detected as spec-kit
- **THEN** system SHALL mark support level as `minimal`
- **AND** UI SHALL clearly indicate limited capability scope

### Requirement: Read-Only Artifact Access

The minimal hook SHALL provide read-only artifact visibility for spec-kit workspaces.

#### Scenario: View artifacts in minimal mode

- **WHEN** user opens a spec-kit workspace in Spec Hub
- **THEN** system SHALL allow read-only artifact browsing
- **AND** unsupported artifact fields SHALL be surfaced as metadata without breaking UI

### Requirement: Passthrough Entry for External Workflow

The minimal hook SHALL provide passthrough entry points to external spec-kit workflow commands/docs.

#### Scenario: Trigger unsupported action

- **WHEN** user selects an action that is not natively supported in minimal mode
- **THEN** UI SHALL provide passthrough command/document entry guidance
- **AND** UI SHALL NOT present the action as natively executed by CodeMoss

