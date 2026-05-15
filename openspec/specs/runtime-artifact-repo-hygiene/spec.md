# runtime-artifact-repo-hygiene Specification

## Purpose

Defines the runtime-artifact-repo-hygiene behavior contract, covering Runtime Artifacts MUST NOT Be Versioned As Long-Lived Repository Assets.

## Requirements
### Requirement: Runtime Artifacts MUST NOT Be Versioned As Long-Lived Repository Assets

The repository SHALL treat agent/runtime session artifacts as local-only state unless a separate workflow explicitly promotes them into stable documentation.

#### Scenario: OMX runtime artifacts are excluded from repository history

- **WHEN** `.omx/**` contains session state, generated prompts, research snapshots, or runtime tracking files
- **THEN** those files SHALL be treated as runtime artifacts instead of project governance documents
- **AND** the repository SHALL ignore `.omx/` via `.gitignore`

#### Scenario: Runtime artifact content is not silently rehomed as stable docs

- **WHEN** a collaborator removes runtime artifacts from version control
- **THEN** the cleanup SHALL NOT automatically migrate that content into `openspec/**`, `.trellis/**`, or other long-lived documentation folders
- **AND** any content worth preserving SHALL require an intentional, separate curation step

### Requirement: Repository Hygiene Rules MUST Distinguish Stable Guidance From Generated State

The repository SHALL make the boundary between stable governance guidance and generated runtime state explicit.

#### Scenario: Stable docs remain in canonical governance layers

- **WHEN** a collaborator needs project rules or workflow guidance
- **THEN** the canonical sources SHALL be `AGENTS.md`, `.trellis/spec/**`, and `openspec/**`
- **AND** generated runtime state directories SHALL NOT be referenced as normative guidance sources

#### Scenario: Local agent artifacts use local-only storage semantics

- **WHEN** host tooling or agent runtime produces local session state
- **THEN** that output SHALL default to ignored local-only storage
- **AND** repository hygiene guidance SHALL document that such directories are non-normative artifacts

