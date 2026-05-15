## MODIFIED Requirements

### Requirement: Special Directory Classification For Progressive Loading
The system SHALL classify dependency directories and build-artifact directories as special directories for progressive loading, while allowing the general progressive file tree protocol to mark ordinary directories as progressively loadable when their child state is unknown or partial.

#### Scenario: classify known dependency directories as special
- **WHEN** workspace scanning encounters directory names in dependency set (`node_modules`, `.pnpm-store`, `.yarn`, `bower_components`, `vendor`, `.venv`, `venv`, `env`, `__pypackages__`, `Pods`, `Carthage`, `.m2`, `.ivy2`, `.cargo`)
- **THEN** system SHALL mark these directories as `special=true`
- **AND** system SHALL assign `specialKind=dependency`
- **AND** system SHALL expose them as progressively loadable without requiring initial descendant scan

#### Scenario: classify known build artifact directories as special
- **WHEN** workspace scanning encounters directory names in build-artifact set (`target`, `dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.svelte-kit`, `.angular`, `.parcel-cache`, `.turbo`, `.cache`, `.gradle`, `CMakeFiles`, `cmake-build-*`, `bin`, `obj`, `__pycache__`, `.pytest_cache`, `.mypy_cache`, `.tox`, `.dart_tool`)
- **THEN** system SHALL mark these directories as `special=true`
- **AND** system SHALL assign `specialKind=build_artifact`
- **AND** system SHALL expose them as progressively loadable without requiring initial descendant scan

#### Scenario: non-special directories preserve regular classification unless scan state is incomplete
- **WHEN** workspace scanning encounters source or documentation directories not in special sets
- **THEN** system SHALL keep regular directory classification
- **AND** system MUST NOT force special directory classification on those directories
- **AND** system MAY mark those directories as progressively loadable when their child state is unknown or partial under the general file tree protocol

### Requirement: Initial Workspace Listing Shall Not Preload Special Subtrees
The system SHALL avoid preloading descendants of special directories in initial workspace file listing, while wrapping all top-level entries under a single workspace root node and preserving recoverable child state for ordinary directories whose descendants were not fully scanned.

#### Scenario: initial listing includes workspace root and special nodes without deep descendants
- **WHEN** client requests initial workspace file tree payload
- **THEN** response SHALL include one workspace root node whose children contain special directory nodes
- **AND** response SHALL exclude descendants under those special directories until explicit expansion request
- **AND** response SHALL mark those special directory nodes as unknown or progressively loadable

#### Scenario: expanding workspace root does not eagerly preload special descendants
- **WHEN** user expands workspace root node
- **THEN** system SHALL only reveal already listed direct children under root
- **AND** system MUST NOT recursively preload descendants of special directories

#### Scenario: regular directories keep existing listing behavior while scan is complete
- **WHEN** client requests initial workspace file tree payload for non-special directories
- **AND** the scan confirms their current child state
- **THEN** system SHALL preserve existing listing semantics for those non-special directories
- **AND** existing file open and tree rendering flows SHALL remain compatible

#### Scenario: regular directories become expandable when scan is partial
- **WHEN** client requests initial workspace file tree payload for non-special directories
- **AND** the scan budget prevents confirming their child state
- **THEN** system SHALL preserve those directories in the tree as unknown or partial
- **AND** the client SHALL allow explicit expansion to request direct children

### Requirement: Special Directory Expansion Shall Use One-Level On-Demand Fetch
The system SHALL fetch only direct children when a special directory or a progressively loadable directory is expanded.

#### Scenario: first expansion triggers single-level child fetch
- **WHEN** user expands a special directory whose child state is unknown
- **THEN** client SHALL call dedicated directory-child query command
- **AND** backend SHALL return only direct child files and directories for the requested path

#### Scenario: nested expansion continues progressively
- **WHEN** user expands a child directory returned from previous fetch
- **THEN** system SHALL fetch next level for that child directory only
- **AND** system MUST NOT recursively fetch the full subtree in one request

#### Scenario: special subtree child not in special-name whitelist still expands progressively
- **WHEN** a directory is returned under a previously expanded special directory (for example `node_modules/@scope`)
- **AND** that directory name itself is not in special directory whitelist
- **THEN** client SHALL still treat it as progressively loadable in current special subtree
- **AND** expanding it SHALL request only its direct children

#### Scenario: ordinary progressively loadable child expands with same command
- **WHEN** a non-special directory is marked unknown or partial by the general file tree protocol
- **THEN** expanding it SHALL use the same dedicated directory-child query command
- **AND** backend SHALL return only direct child files and directories for that requested path

#### Scenario: repeated expansion reuses cached children
- **WHEN** user collapses and re-expands an already loaded progressively loadable directory
- **THEN** client SHALL reuse cached child nodes by default
- **AND** system SHALL avoid duplicate fetch unless user triggers refresh
