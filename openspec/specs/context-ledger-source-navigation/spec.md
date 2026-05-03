# context-ledger-source-navigation Specification

## Purpose
TBD - created by archiving change extend-context-ledger-source-navigation. Update Purpose after archive.
## Requirements
### Requirement: Context Ledger SHALL Support Source Navigation For Explicit User-Managed Blocks

`Context Ledger` SHALL allow users to reopen the underlying source object for explicit user-managed context blocks without replacing the existing detail inspection surface.

#### Scenario: manual memory source opens memory manager

- **WHEN** a visible `manual_memory` block exposes a source navigation action
- **AND** the user activates that action
- **THEN** the system SHALL open the `memory` panel
- **AND** SHALL focus the corresponding memory record by `sourceRef`

#### Scenario: note-card source opens notes manager

- **WHEN** a visible `note_card` block exposes a source navigation action
- **AND** the user activates that action
- **THEN** the system SHALL open the `notes` panel
- **AND** SHALL focus the corresponding note by `sourceRef`

#### Scenario: file reference source reuses existing file open flow

- **WHEN** a visible `file_reference` block exposes a source navigation action
- **AND** the user activates that action
- **THEN** the system SHALL reuse the existing file open flow for that path

#### Scenario: source detail inspection remains available

- **WHEN** a ledger block already supports `source detail`
- **THEN** source navigation SHALL NOT remove or replace the detail inspection action

