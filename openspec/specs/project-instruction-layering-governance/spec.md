# project-instruction-layering-governance Specification

## Purpose

Defines the project-instruction-layering-governance behavior contract, covering Project Instruction Stack MUST Have Explicit Layer Ownership.

## Requirements
### Requirement: Project Instruction Stack MUST Have Explicit Layer Ownership

The repository SHALL define an explicit ownership model for project instructions so that each documentation layer has a single, stable responsibility boundary.

#### Scenario: Instruction layer boundaries are documented

- **WHEN** a collaborator reads the project entry guidance
- **THEN** the repository SHALL describe the distinct roles of project entry, implementation rules, behavior specs, host adapter config, and runtime artifacts
- **AND** the guidance SHALL identify which layer is the source of truth for each rule category

#### Scenario: Rules are updated in the correct layer

- **WHEN** a collaborator needs to update a frontend/backend implementation rule, behavior requirement, or host-specific hook behavior
- **THEN** the repository SHALL direct that update to the implementation-rule layer, behavior-spec layer, or host-adapter layer respectively
- **AND** the project entry document SHALL NOT require duplicating the same rule正文 across multiple layers

### Requirement: AGENTS Entry MUST Stay Minimal And Pointer-Oriented

The project entry document SHALL remain a minimal operational entrypoint instead of duplicating implementation manuals or workspace snapshots.

#### Scenario: Session-start guidance uses minimal required context

- **WHEN** a new AI or human collaborator starts work in the repository
- **THEN** the project entry document SHALL provide a minimal reading path that starts from itself and then points to the relevant `.trellis/spec/**` or `openspec/**` documents by concern
- **AND** it SHALL NOT instruct default full-tree reading of unrelated rule directories as the primary path

#### Scenario: Implementation detail remains outside AGENTS

- **WHEN** detailed frontend, backend, or cross-layer implementation constraints are needed
- **THEN** the project entry document SHALL point to `.trellis/spec/**` instead of reproducing the detailed rules inline
- **AND** updates to those implementation rules SHALL be made in `.trellis/spec/**` first

### Requirement: Session-Start Injection MUST Stay Minimal And Pointer-Oriented

Host adapter session-start hooks SHALL inject only the minimum repository context needed for initial routing and SHALL point collaborators to deeper rule layers on demand.

#### Scenario: Session-start injects concise state instead of full task dumps

- **WHEN** a new Claude or Codex session starts in the repository
- **THEN** the injected context SHALL include the canonical project entry, a concise current-state summary, and task readiness status
- **AND** it SHALL NOT inline full active-task trees or large workspace journals by default

#### Scenario: Session-start points to rule indexes instead of inlining them

- **WHEN** host adapters inject repository guidance for a new session
- **THEN** the injected context SHALL point to `.trellis/spec/frontend/index.md`, `.trellis/spec/backend/index.md`, `.trellis/spec/guides/index.md`, and the relevant OpenSpec entry documents as read-on-demand surfaces
- **AND** it SHALL NOT inline the full正文 of multiple spec index files as the default session-start payload

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
