## MODIFIED Requirements

### Requirement: CI SHALL enforce heavy test noise sentry

The system SHALL provide a CI sentry that runs the heavy regression noise checks on Linux, macOS, and Windows, and fails when repo-owned heavy test noise regresses.

#### Scenario: Repo-owned heavy noise fails the sentry

- **WHEN** the heavy test noise sentry runs in CI
- **THEN** any repo-owned `act(...)` warning, stdout payload leak, or stderr payload leak in the heavy suite SHALL fail the sentry

#### Scenario: Environment-owned warnings stay non-blocking

- **WHEN** the heavy test noise sentry encounters an explicitly allowlisted environment-owned warning
- **THEN** the sentry SHALL report it separately without failing the job

#### Scenario: Noise parser behavior stays testable

- **WHEN** the heavy test noise gate logic changes
- **THEN** parser-level automated tests SHALL validate clean-log acceptance and violation detection before the gate is trusted in CI

#### Scenario: stabilization tests remain low-noise

- **WHEN** this core runtime/realtime stabilization change adds or modifies runtime, realtime, AppShell, or bridge tests
- **THEN** expected noisy diagnostics MUST be asserted or locally muted inside the owning test
- **AND** the change MUST keep `node --test scripts/check-heavy-test-noise.test.mjs scripts/test-batched.test.mjs` and `npm run check:heavy-test-noise` passing
- **AND** the check MUST be compatible with ubuntu-latest, macos-latest, and windows-latest
