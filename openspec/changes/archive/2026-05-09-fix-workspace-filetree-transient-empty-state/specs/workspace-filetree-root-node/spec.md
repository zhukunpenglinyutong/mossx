## ADDED Requirements

### Requirement: Root node empty state MUST require current loaded snapshot
The workspace root node MUST only show an empty-state child when the current workspace file-tree snapshot has completed and contains no files or directories.

#### Scenario: root node remains loading during workspace selection refresh
- **WHEN** user selects a workspace or conversation from the left sidebar
- **AND** the root node is visible before the current workspace file snapshot completes
- **THEN** the root node MUST NOT show the empty-state child
- **AND** the file tree SHALL remain in loading or pending presentation until the snapshot resolves

#### Scenario: root node renders children after delayed snapshot
- **WHEN** the current workspace file snapshot resolves after a delayed refresh
- **THEN** the root node SHALL render the returned files and directories as children
- **AND** page navigation MUST NOT be required to make those children visible
