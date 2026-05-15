# git-commit-details Specification

## Purpose

Defines the git-commit-details behavior contract, covering Commit Metadata Panel.

## Requirements

### Requirement: Commit Metadata Panel

The system SHALL display full metadata for selected commit.

#### Scenario: Metadata render

- **WHEN** user selects a commit
- **THEN** panel shows full hash, author, committer (if different), timestamps, full message, and parent hashes

#### Scenario: Parent navigation

- **WHEN** user clicks a parent hash
- **THEN** system jumps to that parent commit in history list

---

### Requirement: File Changes List

The system SHALL list changed files for selected commit.

#### Scenario: File row content

- **WHEN** details load completes
- **THEN** each file row shows path, change type (A/M/D/R), additions and deletions count

#### Scenario: Compact directory chain rendering

- **WHEN** a directory path has no direct file and only one child directory
- **THEN** the file tree displays that chain as merged label (for example `a.b.c`)

#### Scenario: Default file selection

- **WHEN** file list is non-empty
- **THEN** first file is selected by default

#### Scenario: Click file opens diff modal

- **WHEN** user clicks a file item in the changed files tree
- **THEN** system opens a modal diff preview for that file
- **AND** commit message pane remains in the details layout

---

### Requirement: Diff View Modes

The system SHALL support unified and split diff presentation.

#### Scenario: Unified default

- **WHEN** user opens commit details
- **THEN** diff uses unified mode by default

#### Scenario: Switch to split mode

- **WHEN** user toggles diff mode
- **THEN** diff rerenders in split mode and preserves selected file

#### Scenario: Persist mode preference

- **WHEN** user changes diff mode
- **THEN** preference is reused for subsequent file diffs

---

### Requirement: Asynchronous Diff Computation

Diff fetching SHALL be asynchronous and cancellable from UI perspective.

#### Scenario: Loading indicator

- **WHEN** diff request is running
- **THEN** diff area shows loading state

#### Scenario: Cancel stale request

- **WHEN** user switches to another commit/file before previous request finishes
- **THEN** previous response is ignored and SHALL NOT overwrite latest selection

#### Scenario: Timeout handling

- **WHEN** diff request exceeds timeout threshold (30s)
- **THEN** system shows timeout error and retry action

---

### Requirement: Large Diff Guardrail

The system SHALL protect UI from extremely large diff payloads.

#### Scenario: Truncated large diff

- **WHEN** file diff exceeds 10,000 lines
- **THEN** system displays truncated content and warning message

---

### Requirement: Binary File Handling

The system SHALL handle binary files gracefully.

#### Scenario: Non-text file changed

- **WHEN** selected file is binary
- **THEN** system displays `Binary file changed. Diff preview unavailable.`

---

### Requirement: Diff Chunk Navigation

The system SHALL provide chunk-level navigation within current diff.

#### Scenario: Next/previous chunk

- **WHEN** user clicks `Next Chunk` or `Previous Chunk`
- **THEN** viewport scrolls to corresponding changed chunk

#### Scenario: Keyboard chunk navigation

- **WHEN** user presses `n` or `p` in diff focus
- **THEN** system jumps to next/previous chunk

---

### Requirement: Copy Utilities

The system SHALL provide copy actions for troubleshooting and collaboration.

#### Scenario: Copy commit hash

- **WHEN** user clicks `Copy Hash`
- **THEN** full hash is copied to clipboard

#### Scenario: Copy commit message

- **WHEN** user clicks `Copy Message`
- **THEN** full commit message is copied

#### Scenario: Copy file path

- **WHEN** user copies file path from file list item
- **THEN** selected path is copied

---

### Requirement: Diff Statistics Summary

The system SHALL display summary statistics for selected commit.

#### Scenario: Summary render

- **WHEN** details are loaded
- **THEN** summary includes total files changed, total additions, total deletions

