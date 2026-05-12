## ADDED Requirements

### Requirement: Conversation Curtain MUST Render Deferred Claude Images Safely

The conversation curtain MUST render deferred Claude history images as explicit user-action placeholders and MUST NOT eagerly allocate large image bytes.

#### Scenario: deferred image placeholder is visible and stable
- **WHEN** restored Claude history contains a deferred image descriptor
- **THEN** the conversation curtain MUST render a stable placeholder that communicates the image is available on demand
- **AND** rendering the placeholder MUST NOT require the base64 payload to be present in frontend state

#### Scenario: loading one deferred image does not blank the curtain
- **WHEN** the user loads a deferred Claude image
- **THEN** the curtain MUST preserve the existing transcript rows during the load
- **AND** success or failure MUST update only the targeted image placeholder surface
- **AND** the conversation MUST NOT flash blank or fall back to an empty-thread state

#### Scenario: deferred image behavior stays Claude-scoped
- **WHEN** the deferred media descriptor comes from Claude history restore
- **THEN** the curtain MAY use Claude-specific load actions and diagnostics
- **AND** Codex, Gemini, and OpenCode image/render contracts MUST remain unchanged unless they explicitly opt into the same deferred media contract
