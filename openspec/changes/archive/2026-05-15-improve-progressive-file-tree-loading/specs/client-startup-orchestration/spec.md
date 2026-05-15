## MODIFIED Requirements

### Requirement: Heavy startup data SHALL be loaded on demand or within idle budget
The client SHALL defer heavy startup data sources unless the relevant UI is visible, the user explicitly requests the data, or idle budget is available, and deferred file tree hydration SHALL remain discoverable through explicit unknown or partial directory state.

#### Scenario: git diffs are not preloaded unconditionally
- **WHEN** the app starts and the Git diff panel is not visible
- **THEN** git diff preload SHALL NOT run in the critical or first-paint phases
- **AND** git diff loading SHALL require panel visibility, explicit user action, or an idle-prewarm budget

#### Scenario: complete file tree is not loaded unconditionally
- **WHEN** a workspace has a large file tree or the file panel is not visible
- **THEN** complete file tree loading SHALL be deferred to on-demand or idle-prewarm work
- **AND** the visible shell MAY use cached, shallow, or skeleton file state while hydration continues
- **AND** any visible directory whose children are not fully known SHALL remain discoverable as unknown or partial rather than being rendered as permanently empty

#### Scenario: visible file tree recovers deferred children on expansion
- **WHEN** the visible file tree contains a directory from cached, shallow, or partial file state
- **AND** the user expands that directory
- **THEN** the client SHALL load direct children on demand within the file tree interaction path
- **AND** the action SHALL NOT require waiting for complete workspace tree hydration

#### Scenario: catalog prewarm runs after shell interactivity
- **WHEN** skills, prompts, commands, collaboration modes, agents, dictation model status, engine model catalog, or non-active session catalogs are loaded opportunistically
- **THEN** those tasks SHALL run after the shell is interactive
- **AND** they SHALL not block active workspace minimal hydration
