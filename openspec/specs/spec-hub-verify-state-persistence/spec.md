# spec-hub-verify-state-persistence Specification

## Purpose

Defines the spec-hub-verify-state-persistence behavior contract, covering Verify Result SHALL Persist Beyond Session Timeline.

## Requirements

### Requirement: Verify Result SHALL Persist Beyond Session Timeline

The system SHALL persist strict verify outcome as change-scoped evidence that remains available after page reload or
workspace switch.

#### Scenario: Verify success survives reload

- **WHEN** user runs strict verify and the command succeeds
- **THEN** system SHALL persist verify success evidence for the selected change
- **AND** archive gate SHALL still recognize verify as passed after page reload

#### Scenario: Verify failure replaces previous success evidence

- **WHEN** a later strict verify run fails for the same change
- **THEN** system SHALL update persisted verify evidence to failed state
- **AND** archive gate SHALL block archive until a newer passing verify is recorded

### Requirement: Gate SHALL Use Persistent Verify Evidence as Source of Truth

The archive gate MUST use persisted or recomputed verify evidence instead of volatile in-memory timeline as
authoritative input.

#### Scenario: Timeline entries are truncated

- **WHEN** UI timeline evicts old events due to retention limits
- **THEN** archive gate SHALL continue to evaluate verify state from persistent evidence
- **AND** gate result SHALL remain deterministic across sessions

