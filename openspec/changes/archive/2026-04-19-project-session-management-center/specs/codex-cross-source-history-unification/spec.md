## MODIFIED Requirements

### Requirement: Codex Thread History MUST Be Unified Across Sources Per Workspace
For the same workspace scope, Codex history list MUST aggregate entries across available sources/providers and present them in one default view.

#### Scenario: aggregate live and local entries into one list
- **WHEN** thread list is requested for a workspace
- **THEN** system MUST aggregate active-source live thread list and workspace-scoped local Codex session summaries
- **AND** system MUST return a single unified list instead of source-separated lists

#### Scenario: source switch does not hide old history by default
- **WHEN** user has history generated under source A and source B, and current active source is B
- **THEN** entries from source A MUST remain visible in unified list
- **AND** user MUST NOT need app restart or source rollback to view source A history entries

#### Scenario: session catalog query pages unified history with stable cursor
- **WHEN** session management reads Codex history for a workspace
- **THEN** the unified history capability MUST support cursor-based continuation over the aggregated result set
- **AND** repeated reads with identical inputs MUST preserve deterministic ordering across pages

### Requirement: Unified History MUST Preserve Source Identity Metadata
Unified history entries MUST include source/provider identity metadata for UI labeling and diagnostics.

#### Scenario: unified entry exposes source metadata
- **WHEN** an entry is returned by unified history list
- **THEN** entry payload MUST include non-empty source/provider identity field when available
- **AND** frontend MAY render this as source badge without altering entry identity

#### Scenario: unified entry includes source label and size metadata when available
- **WHEN** unified list entry can be enriched from local session summary
- **THEN** entry payload SHOULD expose `sourceLabel` for compact source/provider display
- **AND** entry payload SHOULD expose `sizeBytes` for thread size visibility in list UI

#### Scenario: unified entry exposes archive metadata when available
- **WHEN** an entry participates in session management catalog queries
- **THEN** the payload MUST expose archive visibility facts such as `archived` and/or `archivedAt`
- **AND** frontend MUST be able to distinguish active and archived entries without guessing from source paths

### Requirement: Unified History MUST Apply Deterministic Deduplication And Ordering
Aggregation MUST produce stable list behavior under repeated refresh and mixed-source duplicates.

#### Scenario: duplicate entry candidates are merged deterministically
- **WHEN** same logical session/thread appears from multiple aggregated sources
- **THEN** system MUST keep one canonical list entry by deterministic merge rules
- **AND** canonical selection MUST be repeatable across identical inputs

#### Scenario: unified list ordering is stable by recency
- **WHEN** unified list is returned with mixed-source entries
- **THEN** entries MUST be sorted by deterministic recency rule (newest first)
- **AND** repeated fetch without data change MUST keep identical order
