# spec-hub-openspec-bootstrap-onboarding Specification

## Purpose

Defines the spec-hub-openspec-bootstrap-onboarding behavior contract, covering OpenSpec Bootstrap Guidance for Unsupported Workspace.

## Requirements
### Requirement: OpenSpec Bootstrap Guidance for Unsupported Workspace

The system SHALL provide an in-hub bootstrap guide when a workspace has no detectable OpenSpec structure.

#### Scenario: Show bootstrap entry in unknown workspace

- **WHEN** user opens Spec Hub and provider detection result is `unknown`
- **THEN** Spec Hub SHALL display an initialization guide entry instead of only static unsupported hints
- **AND** the guide SHALL provide explicit paths for `legacy project` and `new project`

### Requirement: Guided OpenSpec Initialization Execution

The system SHALL execute and report OpenSpec initialization in a structured way.

#### Scenario: Initialize OpenSpec from guide

- **WHEN** user confirms initialization from the bootstrap guide
- **THEN** system SHALL execute OpenSpec initialization command in current workspace context
- **AND** execution result SHALL include command, success state, and failure reason for rendering in execution console

#### Scenario: Refresh runtime after successful init

- **WHEN** OpenSpec initialization succeeds
- **THEN** runtime SHALL refresh workspace spec snapshot automatically
- **AND** provider status SHALL transition from `unknown` to `openspec` without requiring page re-entry

### Requirement: Project Context Collection During Bootstrap

The system SHALL collect project background context as part of bootstrap.

#### Scenario: Collect context for legacy project

- **WHEN** user selects `legacy project` bootstrap path
- **THEN** guide SHALL request project background fields including domain, architecture, constraints, key commands, and
  owners
- **AND** collected values SHALL be persisted into a project context artifact for later proposal/design reuse

#### Scenario: Collect context for new project

- **WHEN** user selects `new project` bootstrap path
- **THEN** guide SHALL provide a minimal context collection template suitable for greenfield setup
- **AND** user SHALL be able to complete bootstrap without pre-existing OpenSpec files

### Requirement: Project Context Update and Traceability

The system SHALL support ongoing updates of project context after initialization while keeping OpenSpec workspace entry guidance concise and non-duplicative.

#### Scenario: Update project context after project evolution

- **WHEN** user edits project context in Spec Hub after bootstrap
- **THEN** system SHALL persist the updated context to OpenSpec-managed project information files
- **AND** system SHALL preserve traceable update metadata (such as time and summary) for future audits

#### Scenario: README remains a concise OpenSpec entrypoint

- **WHEN** collaborators open the OpenSpec workspace README
- **THEN** the README SHALL act as a short navigation entrypoint to workspace directories, key commands, and the detailed governance overview
- **AND** the detailed governance overview SHALL live in `openspec/project.md` instead of being duplicated in full inside `openspec/README.md`

