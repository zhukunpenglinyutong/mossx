# spec-platform-adapter-openspec Specification

## Purpose

Defines the spec-platform-adapter-openspec behavior contract, covering OpenSpec Action Execution Adapter.

## Requirements

### Requirement: OpenSpec Action Execution Adapter

The system SHALL provide an OpenSpec adapter that supports change actions and validation in a structured way.

#### Scenario: Execute OpenSpec action from Action Rail

- **WHEN** user triggers `continue`, `apply`, `verify`, or `archive` in Spec Hub
- **THEN** adapter SHALL execute the mapped OpenSpec command
- **AND** adapter SHALL return structured execution result (`success`, `output`, `error`)

### Requirement: Preflight Blocker Detection

The adapter SHALL evaluate preconditions before action execution.

#### Scenario: Missing tasks for apply

- **WHEN** user attempts `apply` but required tasks context is missing
- **THEN** adapter SHALL block execution
- **AND** adapter SHALL return blocker details for UI rendering

### Requirement: Structured Validation Output

The adapter SHALL expose strict validation results in structured form.

#### Scenario: Validation fails

- **WHEN** strict validate returns failures
- **THEN** adapter SHALL return failed target, reason, and actionable hints
- **AND** UI SHALL be able to locate the affected change/spec from the payload

