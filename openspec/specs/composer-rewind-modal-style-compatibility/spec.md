# composer-rewind-modal-style-compatibility Specification

## Purpose

Defines the composer-rewind-modal-style-compatibility behavior contract, covering Composer Rewind Modal Style Extraction Compatibility.

## Requirements
### Requirement: Composer Rewind Modal Style Extraction Compatibility
The system SHALL preserve the effective rewind modal selector contract and user-visible styling when `claude-rewind-modal-*` styles are moved out of `composer.part1.css` into a dedicated shard file.

#### Scenario: Existing rewind modal selectors stay stable after extraction
- **WHEN** `composer.part1.css` extracts the `claude-rewind-modal-*` namespace into a dedicated CSS shard
- **THEN** the extraction MUST preserve the same class selectors, CSS variable names, and DOM-facing styling contract as before
- **AND** existing composer or rewind modal components MUST NOT require any `className` or import migration for that extraction batch

#### Scenario: Aggregated import order preserves equivalent cascade
- **WHEN** `src/styles/composer.css` is updated to include the new rewind modal shard
- **THEN** the new import MUST appear in a position that preserves the original relative cascade order between `composer.part1.css`, the extracted rewind modal rules, and `composer.part2.css`
- **AND** the extraction MUST NOT move those rules to a globally later or earlier slot that changes intended override relationships

#### Scenario: Extraction reduces large-file pressure without changing modal semantics
- **WHEN** the rewind modal namespace is extracted from `composer.part1.css`
- **THEN** `composer.part1.css` MUST fall below the active `styles` policy fail threshold
- **AND** the resulting rewind modal appearance and responsive behavior MUST remain equivalent to the pre-split behavior

