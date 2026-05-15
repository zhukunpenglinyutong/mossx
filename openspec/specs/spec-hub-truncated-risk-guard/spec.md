# spec-hub-truncated-risk-guard Specification

## Purpose

Defines the spec-hub-truncated-risk-guard behavior contract, covering Truncated Artifact Reads SHALL Raise Gate Risk Signals.

## Requirements

### Requirement: Truncated Artifact Reads SHALL Raise Gate Risk Signals

The system SHALL treat truncated reads of critical artifacts (`tasks.md` or specs files) as explicit risk signals in
gate evaluation.

#### Scenario: Tasks artifact is truncated

- **WHEN** tasks artifact content is returned with `truncated=true`
- **THEN** gate SHALL downgrade overall status to at least `warn`
- **AND** UI SHALL display actionable guidance to recover full content

#### Scenario: Any specs source is truncated

- **WHEN** one or more spec sources are loaded with `truncated=true`
- **THEN** system SHALL mark spec evidence as incomplete
- **AND** archive-related decisions SHALL not claim full confidence without explicit warning

### Requirement: Truncated Risk SHALL Be Visible in Doctor or Gate Panels

The system MUST expose truncated risk in user-visible diagnostics to avoid silent false-positive readiness.

#### Scenario: User opens gate panel after truncated load

- **WHEN** runtime has active truncated risk flags
- **THEN** gate or doctor panel SHALL render risk message with affected artifact path
- **AND** message SHALL include recovery suggestion (re-read, adjust spec root, or split file)

