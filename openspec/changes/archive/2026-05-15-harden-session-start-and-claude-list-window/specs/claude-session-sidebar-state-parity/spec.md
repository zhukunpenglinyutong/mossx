## ADDED Requirements

### Requirement: Claude Native Sidebar Listing MUST Respect Project Session Display Window

Claude native sidebar listing MUST NOT use a hardcoded fetch window smaller than the user's configured project session display count or the documented stable catalog window.

#### Scenario: configured project display count expands native Claude fetch window
- **GIVEN** a workspace is configured to display more project session roots than the old native Claude hardcoded limit
- **WHEN** the sidebar refreshes Claude native session summaries
- **THEN** the native Claude list request MUST use an effective limit that can cover the configured display count
- **AND** real Claude sessions within that window MUST NOT disappear solely because the native list used a smaller hardcoded value

#### Scenario: display count remains presentation rather than membership
- **WHEN** the user changes the project session display count
- **THEN** the setting MUST affect collapsed root visibility
- **AND** it MUST NOT change project membership, folder assignment, archive filtering, hidden binding filtering, or parent-child session relationships

#### Scenario: effective native window stays bounded
- **WHEN** the configured display count is missing, invalid, or larger than the supported project window
- **THEN** the frontend MUST sanitize the value through the existing project display count bounds
- **AND** native Claude listing MUST remain bounded by the shared catalog page size or an equivalent documented cap
