## ADDED Requirements

### Requirement: Workspace-Scoped Console Visibility Preference

The runtime SHALL persist execution console visibility per workspace/spec-root scope and expose a deterministic initial
state when no preference exists yet.

#### Scenario: Runtime seeds collapsed default for new scope

- **WHEN** runtime initializes Spec Hub state for a workspace/spec-root scope with no stored console visibility
  preference
- **THEN** runtime SHALL expose `collapsed=true` as the initial execution console state
- **AND** UI consumers SHALL treat it as the default preference for that scope

#### Scenario: Runtime restores explicit console choice

- **WHEN** a stored execution console visibility preference exists for the current workspace/spec-root scope
- **THEN** runtime SHALL restore that stored boolean on load
- **AND** change selection or data refresh SHALL NOT overwrite it unless the user toggles the console again

### Requirement: Workspace-Scoped Backlog Membership Overlay

The runtime SHALL maintain backlog pool membership as a workspace/spec-root scoped organization overlay that is
independent from lifecycle status derivation.

#### Scenario: Backlog membership is persisted as overlay data

- **WHEN** user moves a change into or out of backlog pool
- **THEN** runtime SHALL persist the change id in the current workspace/spec-root backlog overlay
- **AND** the change's lifecycle status in runtime snapshot SHALL remain unchanged

#### Scenario: Refresh prunes stale backlog membership

- **WHEN** runtime refreshes change summaries and a stored backlog id no longer exists in the current scope or is now
  archived
- **THEN** runtime SHALL remove that stale id from backlog membership overlay
- **AND** UI SHALL NOT render orphan backlog entries after the refresh

#### Scenario: Filter derivation combines overlay and lifecycle facts

- **WHEN** runtime builds filter-specific change collections
- **THEN** the `backlog` view SHALL include non-archived backlog members from the overlay
- **AND** the `blocked` view SHALL still include blocked changes regardless of whether they are also backlog members
