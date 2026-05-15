## MODIFIED Requirements

### Requirement: Large-File Regression Sentry

The system SHALL provide CI sentry checks that enforce domain-aware hard gates and baseline-aware debt growth controls, while keeping near-threshold watch output visible for triage.

#### Scenario: Hard gate for new oversized debt

- **WHEN** a pull request introduces a new file whose line count exceeds the matched policy fail threshold
- **THEN** CI sentry MUST fail the check
- **AND** remediation guidance MUST be shown in logs

#### Scenario: Hard gate for growing legacy debt

- **WHEN** a file already tracked in the baseline exceeds the matched policy fail threshold and its current line count is greater than the baseline line count
- **THEN** CI sentry MUST fail the check
- **AND** the failure output MUST show both the baseline line count and the current line count

#### Scenario: stabilization extraction does not create replacement hubs

- **WHEN** this core runtime/realtime stabilization change extracts AppShell, realtime, runtime, bridge, fixture, or test code
- **THEN** new modules MUST be split by responsibility rather than becoming replacement hub files
- **AND** the change MUST keep `node --test scripts/check-large-files.test.mjs`, `npm run check:large-files:near-threshold`, and `npm run check:large-files:gate` passing
- **AND** touched near-threshold files MUST be reduced, kept stable, or documented with explicit follow-up rationale

#### Scenario: large-file sentry remains cross-platform

- **WHEN** large-file governance checks run in CI
- **THEN** parser tests, near-threshold watch, and hard-debt gate MUST run on ubuntu-latest, macos-latest, and windows-latest
- **AND** file matching and path output MUST remain platform-neutral
