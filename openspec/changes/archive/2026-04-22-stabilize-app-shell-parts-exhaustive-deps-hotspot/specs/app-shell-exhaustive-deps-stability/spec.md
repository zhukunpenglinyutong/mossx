## ADDED Requirements

### Requirement: Search and composer callbacks remain stable after dependency remediation
The system SHALL allow `app-shell-parts` search and composer callbacks to include all referenced stable setter dependencies without changing search palette open/close, selection reset, filter toggle, or result-opening behavior.

#### Scenario: Search palette dependencies are completed
- **WHEN** the search palette callbacks and effects in `useAppShellSearchAndComposerSection.ts` are remediated for `react-hooks/exhaustive-deps`
- **THEN** the dependency arrays MUST include the referenced stable setters
- **AND** opening, closing, resetting selection, toggling filters, and opening search results MUST preserve existing behavior

### Requirement: App-shell transition and scheduler hooks remain behavior-compatible after dependency remediation
The system SHALL allow `app-shell-parts` transition and recurring scheduler hooks to include all referenced dependencies without changing home/workspace navigation or recurring kanban execution semantics.

#### Scenario: Transition callbacks are remediated
- **WHEN** `useAppShellSections.ts` completes its kanban panel open and home/workspace transition dependency arrays
- **THEN** the dependency arrays MUST include the referenced transition setters
- **AND** kanban panel navigation and home/workspace switching MUST preserve existing behavior

#### Scenario: Recurring scheduler effect is remediated
- **WHEN** the recurring scheduler effect in `useAppShellSections.ts` includes `kanbanCreateTask` in its dependency array
- **THEN** recurring task auto-completion and chained task creation MUST continue to follow the existing execution semantics
- **AND** the remediation MUST NOT introduce duplicate task creation or task status regression
