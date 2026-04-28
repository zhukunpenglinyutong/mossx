## ADDED Requirements

### Requirement: Runtime Pool Manual Intervention MUST Preserve Shutdown Attribution

Runtime Pool actions MUST distinguish explicit user intervention from internal runtime cleanup so diagnostics and reconnect-card eligibility remain accurate.

#### Scenario: user close is attributed as user manual shutdown

- **WHEN** the user closes a Codex runtime from Runtime Pool
- **THEN** the stop path MUST attribute the shutdown as user-requested manual intervention
- **AND** if that close interrupts active foreground work, the resulting diagnostic MUST remain eligible for recoverable reconnect or resend UI

#### Scenario: release to cold is attributed separately from replacement cleanup

- **WHEN** the user releases a Codex runtime to cold from Runtime Pool
- **THEN** the stop path MUST preserve a manual release attribution distinct from internal replacement or stale-session cleanup
- **AND** Runtime Pool diagnostics MUST be able to show that the stop came from manual release when exit evidence is recorded

#### Scenario: pin controls intent not only live row state

- **WHEN** the user pins or unpins a runtime from Runtime Pool
- **THEN** that action MUST update the orchestrator's pin intent for the `(engine, workspace)` pair
- **AND** the visible row MUST reflect the current pin intent after runtime removal and recreation
