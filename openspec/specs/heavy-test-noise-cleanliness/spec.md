# heavy-test-noise-cleanliness Specification

## Purpose
Define executable contracts that keep heavy Vitest regression output signal-clean and CI-enforced.
## Requirements
### Requirement: Heavy regression SHALL suppress repo-owned act storm noise

The heavy Vitest regression suite SHALL avoid repo-owned `act(...)` warning storms caused by test harness timing or unflushed asynchronous state updates in known hotspot suites.

#### Scenario: AskUserQuestionDialog submit flow stays signal-clean

- **WHEN** the heavy suite runs the `AskUserQuestionDialog` submit path
- **THEN** the test SHALL complete without triggering runaway timer-driven `act(...)` warnings from the countdown interval

#### Scenario: SpecHub hotspot warnings stay contained at the test boundary

- **WHEN** the heavy suite runs the covered `SpecHub` hotspot render and interaction cases
- **THEN** the test SHALL await, flush, or locally contain the resulting `act(...)` warning path at the test boundary instead of leaking it to the global output

### Requirement: Test mode SHALL not emit frontend debug instrumentation noise

Frontend DEV instrumentation SHALL preserve local development diagnostics while suppressing debug stdout/stderr noise during Vitest runs.

#### Scenario: useThreadMessaging debug logs stay silent in Vitest

- **WHEN** `useThreadMessaging` executes in test mode
- **THEN** DEV-only debug logs such as model-resolution and turn-start diagnostics SHALL not be printed to heavy suite stdout

#### Scenario: model-resolution debug logs stay silent in Vitest

- **WHEN** AppShell or model-selection code executes in Vitest
- **THEN** model-resolution debug diagnostics SHALL NOT print to stdout/stderr
- **AND** local development diagnostics MAY remain available outside test mode

#### Scenario: Development diagnostics remain available outside test mode

- **WHEN** frontend code runs in development mode outside Vitest
- **THEN** the existing debug instrumentation MAY still emit logs for local diagnostics

### Requirement: Expected warning paths SHALL be handled at test boundaries

Expected error-path diagnostics and intentional library warnings SHALL be asserted, muted locally, or otherwise contained within the relevant tests instead of polluting the global heavy regression output.

#### Scenario: Expected stderr is scoped to the owning test

- **WHEN** a test intentionally exercises an error branch such as runtime bridge failure or detached window rejection
- **THEN** the resulting diagnostics SHALL be asserted or muted within that test file rather than leaking as repeated heavy suite stderr noise

#### Scenario: Intentional library warnings are locally contained

- **WHEN** a test intentionally exercises malformed markdown math or equivalent library warning paths
- **THEN** the warning SHALL be contained at the test boundary without altering product behavior

### Requirement: CI SHALL enforce heavy test noise sentry

The system SHALL provide a CI sentry that runs the heavy Vitest regression suite and fails when repo-owned heavy test noise regresses.

#### Scenario: Repo-owned heavy noise fails the sentry

- **WHEN** the heavy test noise sentry runs in CI
- **THEN** any repo-owned `act(...)` warning, stdout payload leak, or stderr payload leak in the heavy suite SHALL fail the sentry

#### Scenario: Environment-owned warnings stay non-blocking

- **WHEN** the heavy test noise sentry encounters an explicitly allowlisted environment-owned warning
- **THEN** the sentry SHALL report it separately without failing the job

#### Scenario: Noise parser behavior stays testable

- **WHEN** the heavy test noise gate logic changes
- **THEN** parser-level automated tests SHALL validate clean-log acceptance and violation detection before the gate is trusted in CI

#### Scenario: parser fixtures protect new sentry rules

- **WHEN** heavy-test-noise parser or allowlist behavior changes
- **THEN** parser-level tests SHALL cover clean logs, repo-owned violations, and allowlisted environment warnings
- **AND** CI SHALL fail on repo-owned noisy output
