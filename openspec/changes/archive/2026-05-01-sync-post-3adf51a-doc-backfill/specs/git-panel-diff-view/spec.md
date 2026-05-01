## MODIFIED Requirements

### Requirement: Git Diff Panel MUST Expose Stable File Preview Affordances

The Git diff panel MUST provide explicit file preview affordances and visible commit-scope state boundaries in dense change lists.

#### Scenario: file preview action is explicit from changed file rows
- **WHEN** a changed file row is visible in the Git diff panel
- **THEN** the row SHALL expose an explicit preview/open action
- **AND** the action SHALL be distinguishable from include/exclude, stage, unstage, discard, and selection controls

#### Scenario: commit scope outline stays visible in dense panels
- **WHEN** the user is selecting files for commit scope in a dense or high-contrast layout
- **THEN** selected commit-scope controls SHALL have a visible outline or equivalent state boundary
- **AND** the state SHALL remain distinguishable from hover-only styling
