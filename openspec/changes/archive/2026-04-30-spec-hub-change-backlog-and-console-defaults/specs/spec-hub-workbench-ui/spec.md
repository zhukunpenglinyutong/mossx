## ADDED Requirements

### Requirement: Execution Console Default-Collapsed Preference

The system SHALL open Spec Hub with the execution console collapsed by default for a workspace/spec-root scope that has
no saved console visibility preference, while restoring explicit user choice on subsequent visits.

#### Scenario: First visit opens with console collapsed

- **WHEN** user opens Spec Hub in a workspace/spec-root scope with no stored console visibility preference
- **THEN** execution console SHALL render in collapsed state
- **AND** change list and artifact panel SHALL remain immediately readable without requiring a manual collapse action

#### Scenario: Saved console preference is restored

- **WHEN** user has previously expanded or collapsed the execution console in the current workspace/spec-root scope
- **THEN** Spec Hub SHALL restore that saved visibility state on the next render
- **AND** selecting another change or refreshing runtime data SHALL NOT reset the saved preference

### Requirement: Backlog Pool Triage View

The system SHALL provide a backlog pool view for non-archived changes that users want to keep out of the current active
working set without archiving them.

#### Scenario: Move change into backlog pool

- **WHEN** user triggers `Move to backlog pool` for a non-archived change row
- **THEN** the change SHALL appear in the `backlog` filter view
- **AND** the `active` filter SHALL stop listing that change unless backlog membership is removed later

#### Scenario: Return change from backlog pool

- **WHEN** user triggers `Remove from backlog pool` for a backlog member
- **THEN** the change SHALL be removed from the `backlog` filter view
- **AND** it SHALL return to the `active` view whenever its underlying lifecycle status still qualifies as active

#### Scenario: Backlog membership does not replace lifecycle status

- **WHEN** a change belongs to the backlog pool
- **THEN** the row SHALL continue to render its underlying lifecycle status such as `draft`, `ready`, or `blocked`
- **AND** action availability and archive/verify gate semantics SHALL remain derived from the existing lifecycle rules

#### Scenario: Blocked backlog item stays visible in blocked view

- **WHEN** a backlog member is also in blocked lifecycle status
- **THEN** the `blocked` filter SHALL still include that change
- **AND** blocked risk visibility SHALL NOT depend on whether the change also belongs to backlog pool

### Requirement: Backlog Action Accessibility

The system SHALL expose backlog move/remove actions through a context menu affordance without making the action
mouse-only.

#### Scenario: Right click opens triage action

- **WHEN** user performs a secondary click on a change row that supports backlog triage
- **THEN** Spec Hub SHALL present the appropriate backlog action for the row's current membership
- **AND** action labels SHALL distinguish `Move to backlog pool` from `Remove from backlog pool`

#### Scenario: Keyboard-accessible equivalent is available

- **WHEN** a change row is focused without pointer interaction
- **THEN** user SHALL still be able to reach the same backlog action set through a keyboard-accessible equivalent entry
- **AND** the accessible path SHALL preserve the same effect and row context as the pointer menu
