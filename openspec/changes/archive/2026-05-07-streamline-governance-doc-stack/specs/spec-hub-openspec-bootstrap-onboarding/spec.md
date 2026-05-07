## MODIFIED Requirements

### Requirement: Project Context Update and Traceability

The system SHALL support ongoing updates of project context after initialization while keeping OpenSpec workspace entry guidance concise and non-duplicative.

#### Scenario: Update project context after project evolution

- **WHEN** user edits project context in Spec Hub after bootstrap
- **THEN** system SHALL persist the updated context to OpenSpec-managed project information files
- **AND** system SHALL preserve traceable update metadata (such as time and summary) for future audits

#### Scenario: README remains a concise OpenSpec entrypoint

- **WHEN** collaborators open the OpenSpec workspace README
- **THEN** the README SHALL act as a short navigation entrypoint to workspace directories, key commands, and the detailed governance overview
- **AND** the detailed governance overview SHALL live in `openspec/project.md` instead of being duplicated in full inside `openspec/README.md`
