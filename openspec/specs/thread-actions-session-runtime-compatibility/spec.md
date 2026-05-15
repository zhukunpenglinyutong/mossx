# thread-actions-session-runtime-compatibility Specification

## Purpose

Defines the thread-actions-session-runtime-compatibility behavior contract, covering Thread Actions Session Runtime Extraction Compatibility.

## Requirements
### Requirement: Thread Actions Session Runtime Extraction Compatibility

The system SHALL preserve the effective action surface and thread lifecycle outcomes when session runtime actions are moved out of `useThreadActions` into a feature-local hook.

#### Scenario: Claude history reload preserves transcript-heavy readable items

- **WHEN** `useThreadActions` reloads a `Claude` history session
- **AND** the restored history payload is transcript-heavy, with many `reasoning` / `tool` rows and very few assistant text rows
- **THEN** the runtime MUST still hydrate a readable history surface for that thread
- **AND** the reload path MUST NOT settle into an effective empty-thread render solely because ordinary assistant text is sparse

