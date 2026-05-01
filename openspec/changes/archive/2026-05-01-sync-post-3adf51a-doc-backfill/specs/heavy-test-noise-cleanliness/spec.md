## MODIFIED Requirements

### Requirement: Test mode SHALL not emit frontend debug instrumentation noise

Frontend test mode SHALL suppress repo-owned debug instrumentation noise while preserving local development diagnostics outside Vitest.

#### Scenario: model-resolution debug logs stay silent in Vitest
- **WHEN** AppShell or model-selection code executes in Vitest
- **THEN** model-resolution debug diagnostics SHALL NOT print to stdout/stderr
- **AND** local development diagnostics MAY remain available outside test mode

### Requirement: CI SHALL enforce heavy test noise sentry

CI SHALL enforce heavy test noise sentry behavior with parser-level fixtures that protect clean-log acceptance and violation detection.

#### Scenario: parser fixtures protect new sentry rules
- **WHEN** heavy-test-noise parser or allowlist behavior changes
- **THEN** parser-level tests SHALL cover clean logs, repo-owned violations, and allowlisted environment warnings
- **AND** CI SHALL fail on repo-owned noisy output
