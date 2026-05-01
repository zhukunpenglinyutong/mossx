## MODIFIED Requirements

### Requirement: Spec Hub Artifact Reader SHALL Keep Dedicated Reading Controls Non-Intrusive

The Spec Hub artifact reader SHALL expose navigation and detached entry controls without forcing unrelated main-surface navigation or persistent visual clutter.

#### Scenario: detached entry does not force main surface navigation
- **WHEN** a global Spec Hub entry is activated from the sidebar, file tree, or header shortcut
- **THEN** the system SHALL prefer opening or focusing the detached Spec Hub reader
- **AND** it SHALL NOT force the main app surface away from chat, Git, or files solely to show Spec Hub

#### Scenario: reader navigation remains collapsed by default
- **WHEN** a long proposal, design, tasks, verification, or spec artifact opens
- **THEN** artifact outline / quick-jump navigation SHALL be available
- **AND** it SHALL default to a non-intrusive collapsed state unless the user explicitly expands it
