## ADDED Requirements

### Requirement: File tree refresh state SHALL distinguish pending from empty
The system SHALL distinguish an unconfirmed workspace file-tree snapshot from a confirmed empty snapshot.

#### Scenario: workspace switch enters pending state
- **WHEN** the active workspace changes while the right-side file tree is visible
- **THEN** the file tree SHALL enter a pending or loading state for the new workspace
- **AND** it MUST NOT render the confirmed-empty copy until the new workspace file snapshot has completed

#### Scenario: confirmed empty workspace still shows empty state
- **WHEN** the active workspace file snapshot completes with no files and no directories
- **THEN** the file tree SHALL render the empty-state copy for that workspace

### Requirement: File tree refresh SHALL ignore stale workspace responses
The system MUST prevent an older workspace file-list response from overwriting the active workspace file-tree snapshot.

#### Scenario: stale response returns after fast workspace switch
- **WHEN** workspace A file-list request is still in flight
- **AND** the user switches to workspace B before workspace A responds
- **THEN** workspace A response MUST be ignored
- **AND** workspace B file-tree state MUST remain authoritative

### Requirement: Connection refresh MUST NOT create false empty tree
The system SHALL keep file-tree loading semantics stable when workspace connection state changes during selection or refresh.

#### Scenario: connected state briefly changes during active workspace refresh
- **WHEN** the active workspace remains the same
- **AND** its connection state changes before a fresh file snapshot is confirmed
- **THEN** the file tree MUST NOT render a false empty-state copy
- **AND** the next successful file snapshot SHALL replace the pending state

### Requirement: File tree non-empty detection SHALL include directories
The system SHALL treat directories as valid file-tree entries for loading and empty-state decisions.

#### Scenario: workspace contains directories but no files
- **WHEN** a workspace file snapshot contains one or more directories and no files
- **THEN** the file tree SHALL render those directories
- **AND** it MUST NOT render the empty-state copy
