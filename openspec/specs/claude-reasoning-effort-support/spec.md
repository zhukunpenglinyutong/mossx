# claude-reasoning-effort-support Specification

## Purpose
TBD - created by archiving change add-claude-reasoning-effort-support. Update Purpose after archive.
## Requirements
### Requirement: Claude Provider MUST Expose Reasoning Effort Selector

The system MUST expose Claude-supported reasoning effort values when the active composer provider or execution engine is Claude Code, without regressing any existing non-Claude reasoning controls.

#### Scenario: Claude provider shows reasoning selector
- **WHEN** the user is composing a message with Claude Code selected as the provider or execution engine
- **THEN** the composer MUST show a reasoning effort selector
- **AND** the selector MUST offer `low`, `medium`, `high`, `xhigh`, and `max` as selectable values

#### Scenario: providers without reasoning effort support hide Claude selector
- **WHEN** the active provider or execution engine is Gemini, OpenCode, or any engine that does not expose a reasoning effort control
- **THEN** the composer MUST NOT show the Claude reasoning effort selector
- **AND** the system MUST NOT include a Claude-specific effort field in that provider's send payload

#### Scenario: existing Codex reasoning selector is preserved
- **WHEN** the active provider or execution engine is Codex
- **THEN** this change MUST NOT remove or alter the existing Codex reasoning selector contract
- **AND** Codex sends MUST NOT append Claude CLI `--effort` arguments

#### Scenario: no selection preserves CLI default
- **WHEN** the user sends a Claude message without selecting a reasoning effort value
- **THEN** the system MUST omit `effort` from the Claude send params or send it as an empty optional value
- **AND** the Claude engine MUST NOT append `--effort` to the CLI command

### Requirement: Claude Send Params MUST Preserve Selected Effort

The system MUST carry a selected Claude reasoning effort from the frontend composer through the service and IPC boundary to the Claude engine send params.

#### Scenario: selected effort reaches backend params
- **WHEN** the user selects `high` in the Claude reasoning effort selector
- **AND** sends a Claude message
- **THEN** the frontend send payload MUST include `effort` with value `high`
- **AND** the Tauri service or IPC mapping MUST preserve that field when invoking the backend send command

#### Scenario: all supported effort values are accepted by the contract
- **WHEN** the user selects any of `low`, `medium`, `high`, `xhigh`, or `max`
- **AND** sends a Claude message
- **THEN** the send params contract MUST preserve the selected value exactly
- **AND** the value MUST remain distinguishable from the selected model, provider, prompt text, and session identifiers

#### Scenario: effort remains independent from model selection
- **WHEN** the user changes the Claude model selector and the reasoning effort selector before sending
- **THEN** the selected Claude runtime model MUST continue to resolve through the existing model selection contract
- **AND** the selected effort MUST be carried as a separate runtime option rather than being encoded into the model id or model value

### Requirement: Claude Engine MUST Append Effort CLI Argument Only For Allowed Values

The Claude engine MUST validate `params.effort` against the allowed reasoning effort values before appending CLI arguments.

#### Scenario: allowed effort appends CLI argument
- **WHEN** the Claude engine builds a command with `params.effort` set to `high`
- **THEN** the command MUST include `--effort`
- **AND** the command MUST include `high` as the value immediately associated with that option

#### Scenario: every allowed effort maps to CLI argument
- **WHEN** the Claude engine builds a command with `params.effort` set to any of `low`, `medium`, `high`, `xhigh`, or `max`
- **THEN** the command MUST include `--effort <value>` using the same selected value
- **AND** the engine MUST NOT rewrite the value to a model name, prompt fragment, or provider setting

#### Scenario: missing effort does not append CLI argument
- **WHEN** the Claude engine builds a command and `params.effort` is absent or empty
- **THEN** the command MUST NOT include `--effort`
- **AND** message sending MUST continue through the existing Claude default behavior

#### Scenario: invalid effort is ignored safely
- **WHEN** the Claude engine receives `params.effort` with a value outside `low`, `medium`, `high`, `xhigh`, and `max`
- **THEN** the command MUST NOT include `--effort`
- **AND** the invalid value MUST NOT be interpolated into any CLI argument

### Requirement: Reasoning Effort MUST Preserve Existing Claude Model Behavior

Adding reasoning effort support MUST NOT alter Claude model discovery, model refresh, custom model, or runtime model resolution behavior.

#### Scenario: model catalog remains unchanged by effort selection
- **WHEN** the user opens or refreshes the Claude model selector after selecting a reasoning effort
- **THEN** the Claude model catalog MUST continue to be built from the existing settings, environment, and custom model sources
- **AND** the reasoning effort value MUST NOT create, remove, rename, or reorder model options

#### Scenario: runtime model and effort are both passed correctly
- **WHEN** a Claude model option resolves to a runtime model value
- **AND** the user selects a valid reasoning effort before sending
- **THEN** the Claude engine MUST use the existing runtime model resolution result for the model argument
- **AND** it MUST append the selected effort as a separate `--effort <value>` CLI option

#### Scenario: non-Claude engines keep existing behavior
- **WHEN** a message is sent through Codex, Gemini, OpenCode, or another non-Claude engine
- **THEN** reasoning effort support MUST NOT change that engine's model selection, send params, command construction, or runtime behavior

