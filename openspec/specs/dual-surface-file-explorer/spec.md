# dual-surface-file-explorer Specification

## Purpose

Defines the dual-surface-file-explorer behavior contract, covering Embedded and detached file explorer surfaces can coexist.

## Requirements
### Requirement: Embedded and detached file explorer surfaces can coexist

The system SHALL support using the embedded right-side file panel and the detached file explorer window at the same time for the same workspace without either surface disabling the other.

#### Scenario: Keep embedded panel while detached window is open

- **WHEN** the user opens a detached file explorer window for a workspace
- **THEN** the embedded file panel remains accessible in the main window
- **AND** the user can continue switching the main window to other tabs without forcing the detached file explorer window to close

#### Scenario: Use both surfaces in parallel

- **WHEN** the embedded file panel and the detached file explorer window are both open for the same workspace
- **THEN** the user can browse files from either surface
- **AND** actions in one surface do not blank, hide, or corrupt the other surface

### Requirement: Detached explorer receives explicit workspace retargeting

The system MUST update the detached file explorer window to the requested workspace when the user invokes detach from a different workspace while the detached file explorer window already exists.

#### Scenario: Retarget detached explorer to another workspace

- **WHEN** the detached file explorer window is already open and the user invokes detach from a different workspace in the main window
- **THEN** the detached file explorer window switches to the newly requested workspace context
- **AND** the detached file explorer window becomes focused

#### Scenario: Retargeting does not break embedded panel state

- **WHEN** the detached file explorer window is retargeted to another workspace
- **THEN** the embedded file panel in the main window keeps following the main window's own active workspace rules
- **AND** the retargeting action does not remove the embedded panel from the main window

### Requirement: Detached explorer session handoff is explicit and recoverable

The system MUST hand off detached explorer workspace context through an explicit session payload that supports both cold-start restore and live retargeting.

#### Scenario: Cold-start detached window restores last requested workspace context

- **WHEN** the system creates the detached file explorer window from a detach action
- **THEN** the detached window receives a persisted workspace session snapshot containing the requested workspace identity
- **AND** the detached window can restore that workspace context even if the live retarget event arrives after the window route is mounted

#### Scenario: Live retarget applies the latest workspace context

- **WHEN** the detached file explorer window is already open and the user detaches from another workspace
- **THEN** the detached window receives the latest workspace session payload for that workspace
- **AND** the latest payload supersedes the previous detached workspace context

