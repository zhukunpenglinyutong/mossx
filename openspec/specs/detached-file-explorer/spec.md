# detached-file-explorer Specification

## Purpose

Defines the detached-file-explorer behavior contract, covering User can open a detached file explorer from the embedded file panel.

## Requirements
### Requirement: User can open a detached file explorer from the embedded file panel

The system SHALL keep the existing right-side embedded file panel available and SHALL let the user open a detached file explorer window from the workspace root row inside that panel.

#### Scenario: Open detached explorer from embedded panel

- **WHEN** the user is viewing the embedded file panel for a workspace and clicks the detach control on the workspace root row
- **THEN** the system opens or focuses a detached file explorer window for that workspace
- **AND** the embedded file panel remains available in the main window

#### Scenario: Reuse existing detached explorer window

- **WHEN** a detached file explorer window is already open and the user clicks the detach control again from the embedded file panel
- **THEN** the system MUST focus the existing detached file explorer window instead of creating an additional detached file explorer window

### Requirement: Detached explorer uses a single fixed window identity

The system MUST manage the detached file explorer as a single reusable window identified by a fixed window label instead of spawning unbounded new windows for repeated detach actions.

#### Scenario: Repeated detach reuses the same detached window identity

- **WHEN** the user triggers detach multiple times for the same workspace during the same app session
- **THEN** the system reuses the existing detached file explorer window identity
- **AND** the system does not create a second detached file explorer window for that action sequence

### Requirement: Detached explorer window can be closed without removing the embedded panel

The system SHALL let the user close the detached file explorer window without changing the availability of the embedded file panel in the main window.

#### Scenario: Close detached explorer window

- **WHEN** the user closes the detached file explorer window from its own window controls or close action
- **THEN** the detached file explorer window is dismissed
- **AND** the embedded file panel in the main window remains available for the same workspace

