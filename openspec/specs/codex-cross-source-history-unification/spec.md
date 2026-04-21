# codex-cross-source-history-unification Specification

## Purpose
TBD - created by archiving change fix-codex-source-switch-runtime-apply-2026-03-31. Update Purpose after archive.
## Requirements
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

### Requirement: Unified History MUST Degrade Gracefully
Failure in one source path MUST NOT collapse the entire Codex history list response.

#### Scenario: one codex root fails but other roots still return entries
- **WHEN** one Codex local history root fails to scan
- **AND** other roots for the same effective scope still succeed
- **THEN** the system MUST continue returning entries from successful roots
- **AND** response MUST indicate fallback or partial-source condition for diagnostics

#### Scenario: live thread/list fails but local aggregate succeeds
- **WHEN** active-source live `thread/list` request fails
- **THEN** system MUST still return local aggregated history entries when available
- **AND** response MUST indicate fallback/partial-source condition for diagnostics

#### Scenario: local scan fails but live thread/list succeeds
- **WHEN** local session scan path fails
- **THEN** system MUST still return live thread entries
- **AND** system MUST NOT return empty list solely due to local scan failure

#### Scenario: local scan fails for one owner workspace but others succeed
- **WHEN** project-scoped Codex history spans main workspace and worktrees
- **AND** local scan fails for one owner workspace but succeeds for others
- **THEN** the system MUST still return entries discovered from successful owner workspaces
- **AND** the failure MUST NOT collapse the whole project-scoped history response

### Requirement: Session Management Codex Catalog MUST Scan Default And Override Roots Together
When session management reads Codex history, it MUST combine workspace-specific override roots and default Codex roots so history is not silently hidden by home/source drift.

#### Scenario: default and override roots are scanned together
- **WHEN** a workspace has an explicit Codex home override and the user opens session management
- **THEN** the system MUST scan both the workspace override roots and the default Codex roots
- **AND** the system MUST deduplicate repeated session identities before returning results

#### Scenario: default-root history remains visible after workspace override is configured
- **WHEN** older Codex sessions for the same workspace still live under default `~/.codex`
- **AND** newer sessions are written under a workspace override root
- **THEN** session management MUST continue showing both sets of history in one unified catalog
- **AND** users MUST NOT need to manually switch source or codex-home configuration to see the older sessions

### Requirement: Unified Codex Session Catalog MUST Preserve Owner Workspace Identity In Project Scope
Project-scoped Codex history entries MUST preserve the workspace that actually owns the session so downstream archive/delete routing can stay correct.

#### Scenario: unified codex entry carries owner workspace id
- **WHEN** a Codex entry is returned in a project-scoped session management catalog
- **THEN** the payload MUST carry the owner workspace id for that session
- **AND** downstream mutation flow MUST be able to route archive or delete to that owner workspace without guessing

### Requirement: Unified History MUST Preserve Known Sessions Under Local-Scan Degradation
When local session scan is unavailable, unified history MUST keep already-known workspace session continuity and expose explicit degradation marker.

#### Scenario: local scan unavailable reuses cached known session identities
- **WHEN** local session scan fails for current workspace
- **AND** system has cached known session identifiers from previous successful scans
- **THEN** unified history merge MUST reuse cached identifiers to keep relevant live entries visible
- **AND** response MUST include `partialSource = "local-session-scan-unavailable"` for diagnostics

#### Scenario: degradation marker clears after local scan recovery
- **WHEN** a subsequent local scan succeeds
- **THEN** system MUST refresh known session identifiers from latest local summaries
- **AND** response MUST NOT keep stale `partialSource` degradation marker

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

