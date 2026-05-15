# git-commit-history Specification

## Purpose

Defines the git-commit-history behavior contract, covering Paginated History Loading.

## Requirements
### Requirement: Paginated History Loading

The system SHALL load commit history incrementally in pages.

#### Scenario: Initial load

- **WHEN** panel opens
- **THEN** system loads first page (default 100 commits)

#### Scenario: Load next page

- **WHEN** user scrolls near list bottom
- **THEN** system loads next page and appends rows

#### Scenario: Stable pagination snapshot

- **WHEN** user continues paging within one view session
- **THEN** system uses a stable snapshot to avoid duplicate or missing rows during refresh

---

### Requirement: Commit Graph and Metadata Row

Each commit row SHALL include graph semantics and metadata columns.

#### Scenario: Row content

- **WHEN** a commit row is rendered
- **THEN** row shows graph node/edge, subject, refs, author, and relative time

#### Scenario: Merge commit graph

- **WHEN** commit has multiple parents
- **THEN** graph includes branch merge edges in row rendering

---

### Requirement: Search by Query Tokens

The system SHALL support free-text and tokenized search.

#### Scenario: Search by subject text

- **WHEN** user enters plain text in search
- **THEN** commits are filtered by subject/message substring (case-insensitive)

#### Scenario: Search by author token

- **WHEN** user enters `author:<name>`
- **THEN** system filters commits authored by matching user

#### Scenario: Search by hash

- **WHEN** user enters full or partial hash
- **THEN** system filters commits by hash prefix/substring match

---

### Requirement: Structured Filters

The system SHALL support branch and date filters for commit history.

#### Scenario: Branch filter

- **WHEN** user selects a branch from branch list
- **THEN** middle column shows commits reachable from that branch

#### Scenario: Date range filter

- **WHEN** user sets date range
- **THEN** system returns only commits within range

#### Scenario: Clear filters

- **WHEN** user clears filters
- **THEN** system returns to default history of current branch

---

### Requirement: Jump to Commit

The system SHALL allow jumping to target commit by hash or reference.

#### Scenario: Jump by hash

- **WHEN** user inputs hash and confirms
- **THEN** system scrolls to and selects matching commit

#### Scenario: Jump by reference

- **WHEN** user inputs branch/tag reference
- **THEN** system resolves reference and selects tip commit

#### Scenario: Target not found

- **WHEN** hash/reference does not exist
- **THEN** system shows `Commit not found`

---

### Requirement: Commit Context Menu Actions

The commit row context menu SHALL expose grouped history actions with deterministic order, and SHALL include the
priority actions `Copy Revision Number` and `Reset Current Branch to Here`.

#### Scenario: Open context menu

- **WHEN** user right-clicks a commit row
- **THEN** menu SHALL include grouped actions in fixed order:
    - `Quick`: `Copy Revision Number`, `Copy Commit Message`
    - `Branch`: `Create Branch from Here`, `Reset Current Branch to Here...`
    - `Write`: `Cherry-Pick`, `Revert Commit`

#### Scenario: Copy revision number

- **WHEN** user clicks `Copy Revision Number`
- **THEN** full selected commit hash SHALL be copied to clipboard
- **AND** system SHALL provide success feedback

#### Scenario: Reset action is confirmation-first

- **WHEN** user clicks `Reset Current Branch to Here...`
- **THEN** system SHALL open reset confirmation dialog
- **AND** system SHALL NOT execute git reset before explicit confirm

#### Scenario: Context menu and action button group stay consistent

- **WHEN** selected commit or repository operation state changes
- **THEN** context menu action availability SHALL match the linked commit action button group
- **AND** disabled reason text SHALL remain consistent between both entry points

### Requirement: Selection Persistence

The system SHALL preserve selected commit state across panel toggles.

#### Scenario: Persist selection

- **WHEN** user selects a commit and closes panel
- **THEN** selected commit hash is persisted

#### Scenario: Restore selection

- **WHEN** user reopens panel
- **THEN** system reselects previous commit if still available in current filter scope

---

### Requirement: Relative Time Formatting

Commit time SHALL be displayed in user-friendly relative format.

#### Scenario: Recent time

- **WHEN** commit age < 24 hours
- **THEN** time uses `minutes ago` or `hours ago`

#### Scenario: Older time

- **WHEN** commit age >= 7 days
- **THEN** time uses absolute date format (for example `Jan 15, 2026`)

