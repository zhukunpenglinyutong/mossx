## MODIFIED Requirements

### Requirement: Composer Slash Command State MUST Be One-Shot

Composer slash command state MUST be consumed as one-shot send metadata and MUST NOT leak into later unrelated sends.

#### Scenario: custom slash command residue is cleared before subsequent sends
- **WHEN** a custom slash command has been selected or inserted for one composer send
- **THEN** the slash command residue SHALL be cleared before the next unrelated send
- **AND** a later plain message SHALL NOT inherit the previous command selection or command text

#### Scenario: early cleanup remains safe on failed send attempts
- **WHEN** command residue cleanup runs before or during send preparation
- **THEN** the cleanup SHALL NOT delete the user's current plain text input
- **AND** retry behavior SHALL not reapply an already-consumed custom command unless the user explicitly selects it again

### Requirement: Icon Button Tooltips MUST Not Leave Residual Hover UI

Icon-only button tooltips MUST close after activation or focus transition and MUST NOT leave residual hover UI over the app.

#### Scenario: tooltip closes after icon button activation
- **WHEN** a user activates an icon-only button with a tooltip
- **THEN** the tooltip SHALL close or become non-visible after activation/focus transition
- **AND** residual tooltip content SHALL NOT remain floating over the app after the action has completed
