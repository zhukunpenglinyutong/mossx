# git-pr-submission-workflow Specification

## Purpose

Defines the git-pr-submission-workflow behavior contract, covering Structured GitHub PR Workflow.

## Requirements

### Requirement: Structured GitHub PR Workflow

The system SHALL provide a structured GitHub PR workflow from the Git panel with explicit parameter confirmation and
staged execution feedback.

#### Scenario: Run workflow after parameter confirmation

- **WHEN** user confirms Create PR parameters
- **THEN** workflow SHALL execute stages in order: `precheck -> push -> create -> comment`
- **AND** UI SHALL receive stage statuses as structured payload

#### Scenario: Comment step failure does not invalidate PR creation

- **WHEN** PR is created successfully but comment step fails
- **THEN** workflow overall result SHALL remain successful for PR creation
- **AND** comment stage SHALL be marked failed/skipped with diagnostic detail

### Requirement: Existing PR Reuse

The workflow SHALL detect and reuse existing PRs for the same head reference before creating a new PR.

#### Scenario: Existing PR found by head reference

- **WHEN** workflow queries existing PRs with same `<head owner>:<head branch>`
- **THEN** system SHALL skip create step and return `status=existing`
- **AND** response SHALL include existing PR metadata (`number/title/url/state`)

### Requirement: Actionable Workflow Result Payload

The workflow SHALL return a complete result payload for success/failure handling.

#### Scenario: Success payload

- **WHEN** workflow succeeds (new or existing PR)
- **THEN** result SHALL include `prUrl` and optional `prNumber`
- **AND** result SHALL include stage details for UI review

#### Scenario: Failure payload

- **WHEN** workflow fails in any stage
- **THEN** result SHALL include `errorCategory` and `nextActionHint`
- **AND** push-related failures SHALL provide `retryCommand` when applicable

