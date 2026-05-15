# workspace-filetree-root-node Specification

## Purpose

Defines the workspace-filetree-root-node behavior contract, covering File Tree SHALL Expose A Single Workspace Root Node.

## Requirements
### Requirement: File Tree SHALL Expose A Single Workspace Root Node
The system SHALL render exactly one workspace root node at the top of the right-side file tree and place all current top-level entries under that root.

#### Scenario: initial render shows workspace root
- **WHEN** user opens any workspace session with file tree visible
- **THEN** file tree SHALL render a single root node using current workspace display name
- **AND** existing top-level files and directories SHALL be rendered as direct children of that root node

#### Scenario: root uniqueness is preserved
- **WHEN** file tree data is refreshed or reloaded
- **THEN** system SHALL keep exactly one root node in the rendered tree
- **AND** system MUST NOT duplicate root wrapper nodes

### Requirement: Workspace Root Node SHALL Support Expand Collapse
The system SHALL support expand/collapse interaction on workspace root node with default-expanded behavior.

#### Scenario: root defaults to expanded
- **WHEN** file tree is rendered for a newly opened workspace session
- **THEN** workspace root node SHALL be expanded by default
- **AND** root children SHALL be visible without extra clicks

#### Scenario: collapse and re-expand root
- **WHEN** user collapses the workspace root node and then expands it again
- **THEN** root children SHALL be hidden while collapsed and visible after expand
- **AND** previously loaded descendant expansion state SHALL be restored

### Requirement: Root Context Menu SHALL Reuse Existing Directory Actions
The system SHALL bind root-node context menu to existing directory action pipeline instead of introducing a separate action implementation.

#### Scenario: root context menu contains existing directory actions
- **WHEN** user opens context menu on workspace root node
- **THEN** menu SHALL include the same directory actions already available for regular directories
- **AND** menu SHALL include at least `新建文件`, `创建副本`, `复制路径`, `在访达中显示`, `移到废纸篓`

#### Scenario: root context menu actions follow existing command chain
- **WHEN** user executes an action from root context menu
- **THEN** frontend SHALL dispatch the same command handlers used by existing directory menu actions
- **AND** backend execution path SHALL remain compatible with current file operation contracts

### Requirement: Root Node Path Resolution MUST Be Workspace-Scoped
The system MUST resolve workspace root node path to the active workspace absolute root and enforce workspace boundary safety.

#### Scenario: root-bound actions target workspace root path
- **WHEN** user triggers root context action that requires filesystem path
- **THEN** system SHALL resolve target path to active workspace root directory
- **AND** operation SHALL execute against that resolved path only

#### Scenario: escaped path is rejected for root operations
- **WHEN** root-related operation payload contains traversal or out-of-workspace target
- **THEN** system MUST reject the request with recoverable error
- **AND** file tree SHALL remain interactive

### Requirement: File Search Input SHALL Be Embedded In Top Tool Row
The system SHALL place the file-search input in the same top tool row as workspace root header controls instead of rendering it as a dedicated second row.

#### Scenario: search input is rendered in top row
- **WHEN** file tree top area is rendered
- **THEN** search input SHALL appear in the top tool row
- **AND** system MUST NOT render a standalone second-row search bar

#### Scenario: search input does not overlap right-side controls
- **WHEN** top row contains file count and action buttons
- **THEN** search input SHALL remain visible and editable
- **AND** placeholder text SHALL NOT be clipped or covered by right-side controls

### Requirement: Root Header Area SHALL Stay Sticky During File List Scrolling
The system SHALL keep the root header area fixed at the top of the file tree while only the file list content scrolls vertically.

#### Scenario: root header stays fixed while list scrolls
- **WHEN** user scrolls the file list vertically
- **THEN** root header area SHALL remain visible at the top of the file tree viewport
- **AND** only the list content area SHALL move with scroll

#### Scenario: sticky layer keeps interaction available
- **WHEN** list content passes under the sticky root header area
- **THEN** sticky header z-order SHALL stay above list content
- **AND** root actions and controls SHALL remain clickable during scrolling

