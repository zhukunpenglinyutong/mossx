## ADDED Requirements

### Requirement: OpenSpec Main Specs MUST Preserve Human-Readable Hygiene

The repository SHALL keep main OpenSpec specs readable and inventory-safe after archive or sync operations.

#### Scenario: Archived specs have meaningful Purpose text

- **WHEN** a change is synced or archived into `openspec/specs/**`
- **THEN** each resulting main `spec.md` file SHALL contain a meaningful `## Purpose` section
- **AND** the Purpose section SHALL NOT keep archive-generated `TBD` placeholder text

#### Scenario: Capability inventory excludes empty directories

- **WHEN** collaborators inspect first-level directories under `openspec/specs/`
- **THEN** each capability directory SHALL contain a real `spec.md` with at least one requirement
- **AND** empty capability directories SHALL be removed instead of being treated as mainline capabilities
