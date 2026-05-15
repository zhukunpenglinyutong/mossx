# spec-hub-stable-change-ordering Specification

## Purpose

Defines the spec-hub-stable-change-ordering behavior contract, covering Change List Ordering SHALL Be Metadata-Based.

## Requirements

### Requirement: Change List Ordering SHALL Be Metadata-Based

The system SHALL sort changes by stable metadata timestamp rather than by inferred date prefix in change name.

#### Scenario: Non-date-prefixed change id

- **WHEN** change id does not start with an ISO-like date prefix
- **THEN** system SHALL still place the change using metadata timestamp
- **AND** ordering SHALL remain stable across refreshes

#### Scenario: Equal metadata timestamps

- **WHEN** two changes share the same primary timestamp
- **THEN** system SHALL apply deterministic secondary ordering
- **AND** repeated renders SHALL produce identical order

