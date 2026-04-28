## MODIFIED Requirements

### Requirement: Tree Hierarchy Interaction

Tree mode SHALL support folder expand/collapse, file selection, and section-scoped commit inclusion toggles.

#### Scenario: Expand folder

- **WHEN** user expands a folder node
- **THEN** its child folders/files SHALL be visible

#### Scenario: Collapse folder

- **WHEN** user collapses a folder node
- **THEN** its descendants SHALL be hidden

#### Scenario: Folder checkbox reflects descendant commit inclusion state

- **WHEN** tree mode renders a folder inside one section
- **THEN** its checkbox SHALL reflect descendant file inclusion as `none`, `partial`, or `all`
- **AND** toggling that checkbox SHALL apply only to descendant files inside the same section

#### Scenario: File metadata visibility

- **WHEN** tree mode renders file nodes
- **THEN** each node SHALL show file status and additions/deletions summary

### Requirement: Backward Compatibility for Git Actions

Existing Git actions and commit inclusion controls SHALL remain available in both view modes without breaking current diff workflows.

#### Scenario: Stage/Unstage/Revert in tree mode

- **WHEN** user performs stage/unstage/revert from tree mode
- **THEN** operation behavior SHALL match flat mode semantics

#### Scenario: Commit inclusion controls remain available in both modes

- **WHEN** user switches between `flat` and `tree`
- **THEN** both modes SHALL expose explicit controls to include or exclude files from the next commit

#### Scenario: View switch preserves section-scoped inclusion truth

- **WHEN** user stages / unstages files or changes commit inclusion in one mode and then switches view mode
- **THEN** the other mode SHALL reflect the same section-scoped inclusion state
- **AND** staged / unstaged file counts SHALL remain consistent after the switch
