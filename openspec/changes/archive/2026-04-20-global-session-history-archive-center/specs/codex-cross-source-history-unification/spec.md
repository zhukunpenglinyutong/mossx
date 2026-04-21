## MODIFIED Requirements

### Requirement: Codex Thread History MUST Be Unified Across Sources Per Workspace

For the same effective history surface, Codex history list MUST aggregate entries across available sources/providers and present them in one deterministic view.

#### Scenario: global history center aggregates codex entries across sources

- **WHEN** global session history reads Codex history
- **THEN** the system MUST aggregate available Codex entries across supported local sources/providers
- **AND** the system MUST return one deterministic result set instead of source-separated lists

#### Scenario: source switch does not hide old history in global center

- **WHEN** user has history generated under source A and source B, and current active source is B
- **THEN** entries from source A MUST remain visible in global history
- **AND** user MUST NOT need source rollback or app restart to view source A history

### Requirement: Unified History MUST Preserve Source Identity Metadata

Unified Codex history entries MUST include source/provider identity metadata for global history, related-session attribution, and diagnostics.

#### Scenario: global entry exposes source metadata

- **WHEN** an entry is returned in global Codex history
- **THEN** payload MUST include source/provider identity when available
- **AND** frontend MAY render this as source badge without altering canonical identity

### Requirement: Unified History MUST Apply Deterministic Deduplication And Ordering

Aggregation MUST produce stable canonical entries under repeated refresh, mixed-source duplicates, and mixed-root duplicates.

#### Scenario: same logical session from multiple roots is merged deterministically

- **WHEN** one logical Codex session is discovered from multiple roots or sources
- **THEN** the system MUST keep one canonical entry by deterministic merge rules
- **AND** canonical selection MUST be repeatable across identical inputs

## ADDED Requirements

### Requirement: Global Codex History MUST Scan Default And Override Roots Together

When global history or project attribution reads Codex history, it MUST combine default Codex roots and workspace override roots so visible history is not silently narrowed by home/source drift.

#### Scenario: global center includes sessions from default and override roots

- **WHEN** older Codex sessions still live in default `~/.codex`
- **AND** newer sessions are written under an override root
- **THEN** global history MUST include both sets in one unified result
- **AND** repeated identities MUST be deduplicated before returning

### Requirement: Unified Codex History MUST Degrade Gracefully Across Roots And Sources

Failure in one root or source path MUST NOT collapse the entire global Codex history response.

#### Scenario: one root fails but others remain queryable

- **WHEN** one Codex root fails to scan
- **AND** other roots or sources still succeed
- **THEN** the system MUST continue returning successful entries
- **AND** response MUST expose partial-source or equivalent degradation information

#### Scenario: metadata-missing entry remains available for non-destructive surfaces

- **WHEN** an entry lacks `cwd` or source metadata
- **THEN** the system MUST still include it in unified global history when the entry is otherwise readable
- **AND** downstream attribution MAY classify it as `unassigned`
