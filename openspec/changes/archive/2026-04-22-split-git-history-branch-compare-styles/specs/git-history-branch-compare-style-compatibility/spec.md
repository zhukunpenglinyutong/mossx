## ADDED Requirements

### Requirement: Git History Branch Compare Style Extraction Compatibility
The system SHALL preserve the effective branch compare selector contract and user-visible styling when `git-history-branch-compare-*` styles are moved out of `git-history.part1.css` into a dedicated shard file.

#### Scenario: Existing branch compare selectors stay stable after extraction
- **WHEN** `git-history.part1.css` extracts the `git-history-branch-compare-*` namespace into a dedicated CSS shard
- **THEN** the extraction MUST preserve the same class selectors, CSS variable names, and DOM-facing styling contract as before
- **AND** existing git history components MUST NOT require any `className` or import migration for that extraction batch

#### Scenario: Aggregated import order preserves equivalent cascade
- **WHEN** `src/styles/git-history.css` is updated to include the new branch compare shard
- **THEN** the new import MUST appear in a position that preserves the original relative cascade order between `git-history.part1.css`, the extracted branch compare rules, and `git-history.part2.css`
- **AND** the extraction MUST NOT move those rules to a globally later or earlier slot that changes intended override relationships

#### Scenario: Extraction reduces large-file pressure without changing compare semantics
- **WHEN** the branch compare namespace is extracted from `git-history.part1.css`
- **THEN** `git-history.part1.css` MUST fall below the active `styles` policy fail threshold
- **AND** the resulting branch compare appearance and responsive behavior MUST remain equivalent to the pre-split behavior
