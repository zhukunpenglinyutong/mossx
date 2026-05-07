## MODIFIED Requirements

### Requirement: Git Diff Panel MUST Expose Stable File Preview Affordances

The Git diff panel MUST expose explicit file-scoped preview affordances, and live workspace file review flows opened from those affordances MUST be able to escalate into editable review without breaking existing Git actions or selection semantics.

#### Scenario: file preview action is explicit from changed file rows

- **WHEN** a changed file row is visible in the Git diff panel
- **THEN** the row SHALL expose an explicit preview/open action
- **AND** the action SHALL be distinguishable from include/exclude, stage, unstage, discard, and selection controls

#### Scenario: commit scope outline stays visible in dense panels

- **WHEN** the user is selecting files for commit scope in a dense or high-contrast layout
- **THEN** selected commit-scope controls SHALL have a visible outline or equivalent state boundary
- **AND** the state SHALL remain distinguishable from hover-only styling

#### Scenario: file-scoped review entry can open editable review for live workspace diff

- **WHEN** the user opens a file-scoped live workspace diff review entry from the Git panel
- **THEN** the system MUST allow that review flow to enter editable review mode for the same file
- **AND** saving from that review flow MUST refresh the Git panel's live diff state
