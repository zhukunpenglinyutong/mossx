## ADDED Requirements

### Requirement: Linux AppImage Artifact MUST Avoid Bundled Wayland Client Library ABI Conflicts

The release pipeline MUST ensure the final Linux AppImage artifact does not bundle Wayland client libraries known to conflict with host Mesa/EGL stacks on rolling Linux distributions.

#### Scenario: release AppImage removes bundled libwayland libraries before upload

- **WHEN** the Linux release workflow builds an AppImage
- **THEN** the workflow MUST remove `usr/lib/libwayland-*` from the extracted AppImage payload before upload
- **AND** the final uploaded AppImage MUST NOT contain `usr/lib/libwayland-*`

#### Scenario: updater signature is generated after AppImage pruning

- **WHEN** the Linux release workflow modifies the AppImage payload after Tauri bundling
- **THEN** it MUST discard any pre-prune signature
- **AND** it MUST sign the pruned AppImage artifact
- **AND** update metadata MUST reference the signature for the pruned artifact

#### Scenario: pruning remains Linux AppImage scoped

- **WHEN** macOS or Windows release jobs run
- **THEN** they MUST NOT run the AppImage Wayland library pruning step
- **AND** their artifact signing and packaging flows MUST remain unchanged

#### Scenario: local Linux build applies the same pruning policy

- **WHEN** a developer runs the local Linux AppImage build helper
- **THEN** the helper MUST run the same Wayland library pruning step after Tauri creates the AppImage
- **AND** it MUST fail with a clear diagnostic if the AppImage cannot be repacked
