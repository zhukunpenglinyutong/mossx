# independent-file-explorer-workspace Specification

## Purpose

Defines the independent-file-explorer-workspace behavior contract, covering Detached explorer window provides a self-contained file browsing workspace.

## Requirements
### Requirement: Detached explorer window provides a self-contained file browsing workspace

The detached file explorer window SHALL render a workspace-scoped file browser with a file tree on the left and a file content area on the right, and it SHALL allow files to be opened without depending on the main window's current panel selection.

#### Scenario: Open file inside detached explorer

- **WHEN** the detached file explorer window is open for a workspace and the user selects a file in the file tree
- **THEN** the selected file is opened in the detached window's file content area
- **AND** the main window does not need to switch to the file panel or editor view to complete the action

#### Scenario: Detached explorer starts with workspace context

- **WHEN** the system opens the detached file explorer window for a workspace
- **THEN** the detached window loads the target workspace context
- **AND** the file tree shown in the detached window belongs to that workspace

### Requirement: Detached explorer manages its own browsing session state

The detached file explorer window MUST maintain its own open tabs, active file, and navigation state independently from the main window.

#### Scenario: Detached window keeps its own open tabs

- **WHEN** the user opens several files in the detached file explorer window
- **THEN** the detached window tracks those open files within its own browsing session
- **AND** the main window's file tabs are not overwritten by the detached window session

#### Scenario: Main window editor changes do not replace detached session

- **WHEN** the user opens or closes files in the main window editor while the detached file explorer window is open
- **THEN** the detached file explorer window keeps its current active file and open tabs unless the user explicitly changes them there

### Requirement: Detached explorer polling follows detached window visibility

The detached file explorer window MUST drive its file-list polling from its own visibility or focus state instead of depending on the main window file panel visibility rules.

#### Scenario: Detached window reduces polling while hidden

- **WHEN** the detached file explorer window becomes hidden or unfocused
- **THEN** the detached explorer reduces or pauses active file polling according to its detached-window policy
- **AND** this behavior does not require the main window file panel to be open

#### Scenario: Detached window resumes polling when visible again

- **WHEN** the detached file explorer window becomes visible or focused again for the same workspace
- **THEN** the detached explorer resumes active polling for that workspace
- **AND** the resumed polling continues to use the detached window's own workspace context

### Requirement: Detached explorer file tree preserves Git status decorations

The detached file explorer window SHALL render Git-aware file status decorations in its file tree using the same status categories and visual semantics as the embedded file tree.

#### Scenario: Detached file tree shows Git status for changed files

- **WHEN** the detached file explorer window displays a workspace that contains tracked file changes
- **THEN** changed files in the detached file tree show Git status decorations (for example modified, added, deleted) with the same semantic mapping used by the embedded file tree
- **AND** users can distinguish changed files from unchanged files directly in the detached tree

#### Scenario: Detached Git decoration stays in sync after refresh

- **WHEN** Git file status changes and the detached file explorer refreshes or polls the workspace
- **THEN** the detached file tree updates its Git decorations to the latest status snapshot
- **AND** stale status colors or markers are not kept after the new status is available

### Requirement: Detached file viewer supports diff-aware color rendering

The detached file explorer window SHALL provide diff-aware color rendering in the file content area so users can visually distinguish added, removed, modified, and context lines while reading opened files.

#### Scenario: Detached viewer renders diff line semantics

- **WHEN** the user opens a file with diff information available in the detached file explorer window
- **THEN** the detached file content area renders line-level diff semantics with distinct colors for added, removed, modified, and context lines
- **AND** the diff color semantics are consistent with the embedded file-viewing surface

#### Scenario: Detached viewer falls back safely when diff data is unavailable

- **WHEN** the user opens a file in the detached file explorer window and diff metadata is not available for that file
- **THEN** the detached file content area still renders readable file content
- **AND** the system does not display incorrect diff coloring that implies unavailable change states

### Requirement: Detached explorer shall detect external file changes for opened tabs

The detached file explorer window MUST detect external on-disk changes for files opened in its tab session and MUST surface state transitions for the active file without requiring manual refresh.

#### Scenario: Active opened file is changed externally

- **WHEN** the active file in detached explorer is modified by an external process
- **THEN** the detached explorer SHALL enter an external-change state for that file within the configured detection window

#### Scenario: Unopened file changes do not trigger editor conflict UI

- **WHEN** a file not opened in detached explorer tabs is modified externally
- **THEN** the system SHALL update workspace snapshots as needed but SHALL NOT show active editor conflict prompt for the current tab

### Requirement: Detached explorer shall auto-sync clean files after external changes

If the active file has no unsaved local edits, the detached explorer MUST auto-reload to latest on-disk content and SHALL provide a non-blocking visibility cue.

#### Scenario: Clean active file auto refreshes

- **WHEN** external change is detected and current editor buffer is clean
- **THEN** the editor content SHALL reload from disk automatically and remain readable without manual action

#### Scenario: Auto-sync cue remains non-blocking

- **WHEN** clean file auto-sync completes
- **THEN** the UI SHALL show a lightweight sync cue and SHALL NOT block continued reading or navigation

### Requirement: Detached explorer shall protect dirty buffers from silent overwrite

If the active file contains unsaved local edits, the detached explorer MUST NOT overwrite the buffer silently and MUST require explicit user decision.

#### Scenario: Dirty active file receives external change

- **WHEN** external change is detected while the active file buffer is dirty
- **THEN** the system SHALL present conflict actions including reload-from-disk, keep-local, and compare-before-decision

#### Scenario: Conflict resolution converges state

- **WHEN** the user selects one conflict action
- **THEN** the external-change state, dirty indicator, and visible content SHALL converge to a consistent post-action state

### Requirement: External change handling shall enforce Win/mac compatibility normalization

The external-change pipeline MUST normalize paths and deduplicate events with platform-aware semantics to avoid duplicate or missed prompts on Windows and macOS.

#### Scenario: Windows path case variance is treated as same file

- **WHEN** external events arrive for the same Windows file path using different case forms
- **THEN** the system SHALL resolve them as one logical file and SHALL NOT create duplicate conflict prompts

#### Scenario: macOS rename-plus-change burst is coalesced

- **WHEN** macOS emits sequential rename/change events for one save operation
- **THEN** the system SHALL debounce/coalesce the burst and SHALL emit at most one effective conflict/sync transition for that save

### Requirement: Detached explorer shall degrade gracefully when watcher is unavailable

The detached explorer MUST fall back to bounded polling when watcher delivery is unavailable and MUST preserve conflict-protection guarantees.

#### Scenario: Watcher unavailable triggers fallback

- **WHEN** watcher initialization or delivery fails
- **THEN** the system SHALL switch to bounded polling for detached active file updates without disabling external-change awareness

#### Scenario: Fallback still honors dirty protection

- **WHEN** fallback polling detects an external change for a dirty active file
- **THEN** the system SHALL apply the same no-silent-overwrite conflict prompt behavior as watcher mode

### Requirement: External-change scope shall remain isolated to detached window context

External-change actions triggered by this capability MUST be limited to the detached window's current workspace and opened tabs.

#### Scenario: No cross-window forced refresh

- **WHEN** detached explorer processes an external-change event
- **THEN** it SHALL NOT force refresh or conflict prompt in unrelated windows

#### Scenario: No cross-workspace contamination

- **WHEN** detached explorer is bound to workspace A
- **THEN** external-change handling for this capability SHALL ignore events from workspace B

### Requirement: Detached file viewer SHALL inherit the shared rendering contract

The detached file explorer window MUST render opened files through the same shared rendering contract used by the main window file view so that preview kind, edit capability, and fallback semantics stay aligned across both surfaces.

#### Scenario: detached window uses the same rendering kind as the main file view
- **WHEN** the same workspace file is opened in the detached explorer and in the main window file view
- **THEN** the detached file content area MUST resolve the same rendering kind as the main file view
- **AND** it MUST NOT rely on a detached-only file-type decision table

#### Scenario: detached window preserves fallback parity for unsupported files
- **WHEN** the user opens an unsupported or partially supported file in the detached explorer
- **THEN** the detached window MUST show the same fallback class of result as the main file view
- **AND** it MUST NOT fail into a blank or misleading view while the main surface falls back safely

### Requirement: Detached file viewer SHALL keep renderer state aligned during session transitions

The detached file explorer window MUST keep renderer state aligned with its own active tab, active file, and restore lifecycle so that switching files or restoring the window does not leak stale render state.

#### Scenario: detached tab switches do not leak previous renderer state
- **WHEN** the user switches between detached tabs whose files use different rendering kinds
- **THEN** the detached viewer MUST rebind renderer state to the newly active file
- **AND** stale preview content, stale controls, or stale syntax markers from the previous tab MUST NOT remain visible

#### Scenario: detached session restore rehydrates a valid renderer state
- **WHEN** the detached file explorer window restores a saved session or receives a refreshed detached session payload
- **THEN** the reopened active file MUST render through a valid renderer state for that file
- **AND** the detached viewer MUST NOT require the user to reopen the file manually to recover from restore

