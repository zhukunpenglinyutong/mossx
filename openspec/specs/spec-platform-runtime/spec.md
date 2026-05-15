# spec-platform-runtime Specification

## Purpose

Defines the spec-platform-runtime behavior contract, covering Unified Spec Runtime Model.

## Requirements

### Requirement: Unified Spec Runtime Model

The system SHALL provide a unified runtime model for spec workspaces, changes, artifacts, and actions.

#### Scenario: Build runtime snapshot from workspace

- **WHEN** user opens a workspace in Spec Hub
- **THEN** system SHALL build a runtime snapshot containing `workspace`, `changes`, `artifacts`, and `actions`
- **AND** runtime snapshot SHALL include provider and support-level metadata

### Requirement: OpenSpec-First Provider Resolution

The system SHALL prioritize OpenSpec as full-support provider and treat spec-kit as minimal-support provider.

#### Scenario: OpenSpec workspace detected

- **WHEN** workspace contains valid OpenSpec structure
- **THEN** provider SHALL be marked `openspec`
- **AND** support level SHALL be `full`

#### Scenario: spec-kit workspace detected without OpenSpec

- **WHEN** workspace matches spec-kit structure but does not match OpenSpec
- **THEN** provider SHALL be marked `speckit`
- **AND** support level SHALL be `minimal`

### Requirement: Deterministic Change Status Machine

The system SHALL compute change status using deterministic rules.

#### Scenario: Draft status

- **WHEN** proposal exists but design/spec/tasks are incomplete
- **THEN** change status SHALL be `draft`

#### Scenario: Ready status

- **WHEN** proposal, design, specs, and tasks are complete
- **THEN** change status SHALL be `ready`

#### Scenario: Blocked status

- **WHEN** environment is unhealthy or required artifacts are missing for action execution
- **THEN** change status SHALL be `blocked`
- **AND** blockers SHALL include explicit reasons for UI display

