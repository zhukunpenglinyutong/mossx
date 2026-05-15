# composer-linux-ime-compatibility Specification

## Purpose

Defines the composer-linux-ime-compatibility behavior contract, covering Linux ChatInputBox MUST accept finalized IME text.

## Requirements
### Requirement: Linux ChatInputBox MUST accept finalized IME text

The system MUST allow `ChatInputBox` on Linux to accept and display finalized IME composition text without requiring blur/refocus or falling back to English-only typing.

#### Scenario: Linux committed composition text appears in composer

- **WHEN** a Linux user types Chinese text through an IME and confirms a candidate in `ChatInputBox`
- **THEN** the finalized committed text MUST appear in the composer input
- **AND** the composer MUST remain editable for subsequent input

#### Scenario: Linux input method switch remains usable in focused composer

- **WHEN** a Linux user switches input method mode while `ChatInputBox` keeps focus
- **THEN** the next committed text from the newly active input method MUST appear in the composer
- **AND** the user MUST NOT need to blur or recreate the input box to continue typing

### Requirement: Linux IME control keys MUST NOT be hijacked by composer event interception

The system MUST NOT consume Linux IME candidate-confirmation or composition-control keystrokes as composer submit or DOM-rewrite triggers before the browser input pipeline resolves composition.

#### Scenario: Enter candidate confirm does not prematurely submit

- **WHEN** a Linux IME uses `Enter` to confirm the current candidate while composition is active or still settling
- **THEN** `ChatInputBox` MUST NOT submit the message prematurely
- **AND** the confirmed text MUST remain in the composer as normal input content

#### Scenario: Space candidate confirm does not trigger premature DOM rewrite

- **WHEN** a Linux IME uses `Space` to select or confirm a candidate while composition is active or still settling
- **THEN** the composer MUST NOT run a DOM rewrite that disrupts composition
- **AND** the finalized text MUST remain intact after composition settles

### Requirement: Linux IME submit MUST use the finalized committed snapshot

The system MUST submit the finalized Linux IME text snapshot exactly once after composition is complete.

#### Scenario: Submit after Linux composition sends final text once

- **WHEN** a Linux user finishes IME composition and then triggers send
- **THEN** the system MUST send the finalized committed text snapshot
- **AND** the system MUST send that snapshot exactly once

### Requirement: Linux IME compatibility mode MUST preserve rich input continuity

The system MUST preserve existing `ChatInputBox` rich input behavior on Linux after composition has settled.

#### Scenario: Completion remains usable after Linux IME commit

- **WHEN** a Linux user confirms IME text and then opens a composer completion flow such as file reference or slash command
- **THEN** the completion UI MUST remain functional
- **AND** selecting a completion item MUST continue to update the composer correctly

#### Scenario: Undo history remains valid for committed Linux IME text

- **WHEN** a Linux user confirms IME text and then triggers undo/redo within `ChatInputBox`
- **THEN** the committed text MUST participate in the existing history model
- **AND** the composer MUST NOT lose the finalized text due to an IME-specific history corruption

### Requirement: Linux IME compatibility guard MUST remain platform-isolated

The system MUST scope Linux IME compatibility behavior to Linux and SHALL preserve current macOS and Windows composer event paths.

#### Scenario: macOS and Windows bypass Linux compatibility guard

- **WHEN** `ChatInputBox` runs on macOS or Windows
- **THEN** the Linux-only IME compatibility branch MUST NOT activate
- **AND** the existing platform-specific composer event strategy MUST remain unchanged

