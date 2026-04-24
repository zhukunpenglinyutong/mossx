## ADDED Requirements

### Requirement: App Shell Orchestration Extraction Compatibility
The system SHALL preserve the effective `AppShell` layout and context contracts when orchestration logic is moved into `app-shell-parts` hooks.

#### Scenario: Existing app shell consumers keep the same context field names
- **WHEN** `AppShell` extracts orchestration logic into submodule hooks
- **THEN** `renderAppShell`, `useAppShellSections`, and `useAppShellLayoutNodesSection` MUST continue receiving the same effective field names for the migrated data and actions
- **AND** callers MUST NOT require a context contract migration for that extraction batch

#### Scenario: Extracted side effects preserve current runtime behavior
- **WHEN** workspace search, session radar, activity hydration, or prompt actions are moved into dedicated hooks
- **THEN** their existing side-effect ordering, cleanup behavior, and user-visible outcomes MUST remain unchanged
- **AND** the extraction MUST NOT alter runtime command names, notification payload meaning, or prompt management semantics
