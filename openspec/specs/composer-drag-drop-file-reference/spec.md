# composer-drag-drop-file-reference Specification

## Purpose

Defines the composer-drag-drop-file-reference behavior contract, covering Composer SHALL Accept File Tree Drag-Drop For File And Folder References.

## Requirements
### Requirement: Composer SHALL Accept File Tree Drag-Drop For File And Folder References
The system SHALL allow users to drag file-tree nodes (files or folders) into Composer input and SHALL convert them into file-reference tokens using existing reference format.

#### Scenario: Drag file-tree file into composer
- **WHEN** user drags a file node from the right-side file tree and drops it into Composer input area
- **THEN** system SHALL insert the dropped file path as a file reference token
- **AND** the inserted token SHALL be renderable by existing file-tag rendering flow

#### Scenario: Drag file-tree folder into composer
- **WHEN** user drags a folder node from the right-side file tree and drops it into Composer input area
- **THEN** system SHALL insert the dropped folder path as a file reference token
- **AND** message submit flow SHALL remain consistent with existing file-reference behavior

#### Scenario: Drag selected multiple nodes from file tree
- **GIVEN** user has selected multiple file-tree nodes
- **WHEN** user drags from any selected node and drops into Composer input area
- **THEN** system SHALL insert all selected paths as file reference tokens in one drop transaction
- **AND** system SHALL avoid duplicate insertion for repeated paths within the same payload

### Requirement: Composer SHALL Accept External File-System Drag-Drop Including Out-Of-Workspace Paths
The system SHALL accept drag-drop of files and folders from external file managers and SHALL support paths outside current workspace.

#### Scenario: Drag external file outside workspace
- **GIVEN** dropped file path is outside active workspace root
- **WHEN** user drops the file into Composer input area
- **THEN** system SHALL insert the absolute path as a file reference token
- **AND** system MUST NOT require adding the file into workspace before reference insertion

#### Scenario: Drag external folder outside workspace
- **GIVEN** dropped folder path is outside active workspace root
- **WHEN** user drops the folder into Composer input area
- **THEN** system SHALL insert the absolute folder path as a file reference token
- **AND** Composer input SHALL remain editable and submittable after insertion

### Requirement: Drag-Drop Reference Insertion SHALL Reuse Existing Mention Pipeline
The system SHALL reuse the existing file-reference insertion pipeline so that drag-drop and `+` insertion produce consistent token/render/update semantics.

#### Scenario: Drop uses same token semantics as existing insertion
- **WHEN** a valid dropped path is consumed by Composer
- **THEN** inserted content SHALL follow the same reference text format as current file insertion path
- **AND** path mapping/state synchronization SHALL follow existing mention-render contract

#### Scenario: Existing plus-button insertion remains unchanged
- **WHEN** user uses existing file-tree `+` insertion after drag-drop capability is enabled
- **THEN** system SHALL preserve existing insertion behavior and output format
- **AND** no drag-drop side effect SHALL alter prior `+` interaction contract

### Requirement: Invalid Drag Payload SHALL Fail Safely Without Blocking Input
The system SHALL ignore invalid or rejected drag payload entries and SHALL keep Composer stable and interactive.

#### Scenario: Invalid path is rejected
- **WHEN** dropped entry fails current path validation rules
- **THEN** system SHALL reject that entry without inserting it
- **AND** Composer SHALL remain responsive without crash or input lock

#### Scenario: Mixed valid and invalid dropped paths
- **WHEN** a drop payload contains both valid and invalid paths
- **THEN** system SHALL insert only valid paths
- **AND** invalid entries SHALL be skipped with recoverable handling

### Requirement: Drag-Drop Handling Boundary SHALL Be Contained To Composer Input
The system SHALL constrain drag-drop reference insertion to Composer input target area and MUST NOT expand behavior into unrelated UI regions.

#### Scenario: Drop outside composer does not insert reference
- **WHEN** user drops file or folder payload outside Composer input area
- **THEN** system SHALL NOT insert any file reference token into Composer
- **AND** existing interactions of other UI panels SHALL remain unchanged

#### Scenario: Folder drop does not trigger recursive expansion
- **WHEN** user drops a folder path into Composer input area
- **THEN** system SHALL treat it as a single folder-path reference token
- **AND** system MUST NOT trigger recursive directory traversal or bulk child insertion

### Requirement: Composer Drag-Drop SHALL Provide Stable Visual Feedback During Drag Hover
The system SHALL render drag-hover overlay feedback when drag source is potentially insertable into Composer, and SHALL keep feedback stable across repeated drags.

#### Scenario: External drag shows composer overlay before drop
- **WHEN** user drags external file-system payload over Composer input area
- **THEN** system SHALL show drag-hover overlay immediately
- **AND** overlay MAY show generic hint even before path list is fully resolved

#### Scenario: File-tree internal drag shows composer overlay during hover
- **WHEN** user drags file-tree node over Composer input area
- **THEN** system SHALL show drag-hover overlay while hover is active
- **AND** overlay visibility SHALL NOT depend on one-time-only event ordering

### Requirement: Win/macOS Compatibility SHALL Be Deterministic For Drag-Drop Paths
The system SHALL normalize drag-drop paths for Win/macOS differences before reference insertion and SHALL keep insertion behavior stable across both platforms.

#### Scenario: Windows path normalization and matching
- **WHEN** dropped path uses Windows style separators or drive-letter casing variants
- **THEN** system SHALL normalize separators before insertion/matching
- **AND** drive-letter comparison SHALL be case-insensitive

#### Scenario: macOS external drag path remains insertable
- **WHEN** user drags file or folder from Finder into Composer input area on macOS
- **THEN** system SHALL insert a valid absolute-path reference token
- **AND** paths containing spaces SHALL remain intact after insertion

