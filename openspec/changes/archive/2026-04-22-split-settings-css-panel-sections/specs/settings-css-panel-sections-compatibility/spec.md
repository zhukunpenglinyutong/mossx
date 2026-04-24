## ADDED Requirements

### Requirement: Settings CSS Section Split Compatibility
The system SHALL preserve the effective selector contract and user-visible settings panel styling when oversized settings CSS sections are moved into dedicated shard files.

#### Scenario: Existing settings selectors stay stable after section extraction
- **WHEN** `settings.part1.css` or `settings.part2.css` moves a whole panel section into a new shard file
- **THEN** the extraction MUST preserve the same class selectors, CSS variable names, and DOM-facing styling contract as before
- **AND** existing settings components MUST NOT require any `className` or import migration for that extraction batch

#### Scenario: Aggregated import order preserves equivalent cascade
- **WHEN** `src/styles/settings.css` is updated to include new shard files
- **THEN** the new imports MUST appear in positions that preserve the original section-level cascade order
- **AND** the extraction MUST NOT move those rules to a globally later or earlier slot that changes intended override relationships

#### Scenario: Section split reduces file size without changing panel semantics
- **WHEN** retained hard-debt sections are extracted from `settings.part1.css` and `settings.part2.css`
- **THEN** both oversized source files MUST fall below the active `styles` policy fail threshold
- **AND** the resulting settings panel appearance and section semantics MUST remain equivalent to the pre-split behavior
