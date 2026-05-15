# spec-hub-speckit-minimal-hook Specification

## Purpose

Defines the spec-hub-speckit-minimal-hook behavior contract, covering spec-kit Workspace Detection.

## Requirements
### Requirement: spec-kit Workspace Detection

The system SHALL detect spec-kit workspaces and label them with minimal support level.

#### Scenario: Detect spec-kit markers

- **WHEN** workspace contains spec-kit marker files or directory conventions
- **THEN** provider detection SHALL mark workspace as `spec-kit`
- **AND** support level SHALL be set to `minimal`

### Requirement: Read-Only Artifact Mapping

The system SHALL provide read-only artifact browsing for spec-kit workspaces through a normalized view.

#### Scenario: Open change detail in minimal mode

- **WHEN** user opens a change from spec-kit workspace
- **THEN** UI SHALL render available artifacts in read-only mode
- **AND** unmapped fields SHALL be surfaced as metadata without breaking the view

### Requirement: External Passthrough Entry

The system SHALL provide a passthrough entry for spec-kit native workflow commands and documentation.

#### Scenario: Open external workflow entry

- **WHEN** user requests unsupported action in minimal mode
- **THEN** UI SHALL provide external command or documentation jump entry
- **AND** UI SHALL display explicit message that full in-app execution is not supported

### Requirement: Explicit Capability Boundary Disclosure

The system MUST disclose unsupported capability boundaries per tier.

#### Scenario: Minimal tier boundary hint

- **WHEN** actions panel renders in minimal tier
- **THEN** native/ai-only actions SHALL be displayed as unavailable with boundary reason
- **AND** UI SHALL provide upgrade hint toward guided/bridge path

#### Scenario: Tier downgrade becomes visible

- **WHEN** runtime downgrades tier due to doctor or config failure
- **THEN** UI SHALL immediately show effective tier and downgrade reason
- **AND** user SHALL be able to retry or switch route strategy

### Requirement: Tiered Spec-kit Capability Exposure

The system SHALL expose spec-kit support in three tiers: `minimal`, `guided`, and `bridge`.

#### Scenario: Minimal tier is detected

- **WHEN** workspace has spec-kit markers but no executable auto strategy
- **THEN** tier SHALL resolve to `minimal`
- **AND** executable capability SHALL be limited to passthrough path

#### Scenario: Guided tier is detected

- **WHEN** workspace supports AI orchestration for auto actions
- **THEN** tier SHALL resolve to `guided`
- **AND** actions with `ai` strategy SHALL be executable

#### Scenario: Bridge tier is detected

- **WHEN** bridge strategy config is valid and doctor confirms runtime readiness
- **THEN** tier SHALL resolve to `bridge`
- **AND** actions with `native` strategy SHALL be executable

### Requirement: Coexistence-Safe Provider Detection

The system SHALL detect spec-kit capability without overriding existing OpenSpec provider scope.

#### Scenario: OpenSpec and spec-kit are both detectable

- **WHEN** workspace contains valid OpenSpec structure and valid spec-kit markers
- **THEN** system SHALL expose both provider scopes as independently selectable contexts
- **AND** spec-kit detection SHALL NOT downgrade OpenSpec scope capability

