## ADDED Requirements

### Requirement: Claude Model Catalog MUST Prefer CLI Discovery

The system MUST build the Claude Code model catalog from the current Claude Code CLI discovery result before using built-in fallback models.

#### Scenario: cli discovery populates selector catalog
- **WHEN** Claude Code CLI returns parseable model or alias entries
- **THEN** the Claude model selector MUST include those discovered entries
- **AND** the selector MUST NOT replace them with a stale built-in catalog

#### Scenario: builtin fallback is used only after discovery failure
- **WHEN** Claude Code CLI model discovery fails, times out, or returns no parseable entries
- **THEN** the system MAY use cached or built-in fallback models to keep the selector usable
- **AND** fallback entries MUST be marked or diagnosable as fallback source

#### Scenario: cli alias remains runtime value
- **WHEN** Claude Code CLI discovery returns an alias such as `opus`, `sonnet`, `haiku`, or an equivalent long-context alias
- **THEN** the system MUST preserve that alias as the runtime model value
- **AND** it MUST NOT force-expand the alias into a hardcoded versioned model name

### Requirement: Claude Model Entries MUST Separate UI Identity From Runtime Model

The system MUST treat model option identity and Claude CLI runtime model value as separate fields.

#### Scenario: option id differs from runtime model
- **WHEN** a Claude model option has `id` different from `model`
- **THEN** the selector MUST use `id` for UI selection and persistence
- **AND** send-time execution MUST use `model` as the value passed to Claude Code CLI

#### Scenario: model value is presentationally hidden
- **WHEN** a model option displays a friendly label
- **THEN** the friendly label MUST NOT replace the runtime `model` value
- **AND** debug diagnostics MUST still be able to report the final runtime model value

#### Scenario: legacy id fallback is explicit
- **WHEN** a legacy model option lacks an explicit `model` field
- **THEN** the system MUST resolve it through compatibility rules before sending
- **AND** it MUST NOT blindly pass an arbitrary UI-only id to Claude Code CLI

### Requirement: Claude Custom Models MUST Remain Supported

The system MUST continue to support user-added Claude custom models even when they are not returned by Claude Code CLI discovery.

#### Scenario: custom model appears beside discovered models
- **WHEN** the user has added a Claude custom model
- **AND** Claude Code CLI discovery succeeds
- **THEN** the custom model MUST remain present in the merged Claude model catalog
- **AND** it MUST NOT be removed solely because the CLI did not list it

#### Scenario: custom model sends as configured
- **WHEN** the user selects a custom Claude model
- **THEN** the sent Claude runtime model MUST equal the custom model value configured by the user
- **AND** the system MUST NOT rewrite it to a built-in alias or discovered model

#### Scenario: custom model wins over legacy migration
- **WHEN** a selected model value matches a user custom model
- **THEN** the system MUST treat it as user intent
- **AND** it MUST NOT migrate that value as if it were a deprecated built-in id

### Requirement: Claude Model Catalog MUST Merge Sources Deterministically

The system MUST merge CLI-discovered models, settings/env overrides, custom models, cache, and fallback models using deterministic precedence.

#### Scenario: discovered and custom entries share runtime value
- **WHEN** a CLI-discovered entry and a custom entry have the same runtime `model`
- **THEN** the merged catalog MUST avoid duplicate runtime choices
- **AND** it MUST preserve enough metadata to keep the label and source diagnosable

#### Scenario: custom entry remains explicit after dedupe
- **WHEN** a custom entry is de-duplicated with a CLI-discovered or settings override entry
- **THEN** the merged option MUST remain attributable to the custom source in diagnostics
- **AND** user selection of that model MUST continue to resolve to the user-configured runtime model

#### Scenario: settings override contributes runtime model
- **WHEN** `~/.claude/settings.json` or environment variables define a Claude model override
- **THEN** the merged catalog MUST include or update an entry for that override
- **AND** the override MUST resolve to the configured runtime model value at send time

#### Scenario: fallback never shadows explicit user model
- **WHEN** fallback models are merged with user custom models
- **THEN** fallback entries MUST NOT remove or overwrite custom model entries
- **AND** custom entries MUST remain selectable

### Requirement: Claude Model Refresh MUST Be Fail-Safe

The system MUST keep the previous usable Claude model catalog and current selection when refresh or discovery fails.

#### Scenario: failed discovery preserves previous catalog
- **WHEN** Claude model discovery fails during refresh
- **THEN** the selector MUST keep the previously visible catalog
- **AND** it MUST NOT replace the catalog with an empty list solely because discovery failed

#### Scenario: failed discovery preserves selected model
- **WHEN** Claude model discovery fails during refresh
- **THEN** the selector MUST keep the current selected model if it can still resolve to a runtime model
- **AND** it MUST keep custom models available

#### Scenario: discovery failure is diagnosable
- **WHEN** Claude model discovery fails
- **THEN** the system MUST expose a diagnosable failure reason through UI feedback or debug diagnostics
- **AND** the selector MUST remain usable

### Requirement: Claude Legacy Model Selections MUST Be Migrated Before Send

The system MUST resolve known legacy Claude model selections before sending a message.

#### Scenario: legacy selection maps to discovered runtime option
- **WHEN** a persisted selection references a known deprecated built-in Claude model id
- **AND** an equivalent CLI-discovered or override model option exists
- **THEN** the system MUST migrate the selection to that valid option before sending
- **AND** the sent runtime model MUST NOT be the deprecated built-in id

#### Scenario: unmigratable legacy selection falls back safely
- **WHEN** a persisted legacy selection cannot be mapped to a current catalog option
- **THEN** the system MUST use the existing default selection fallback rules or surface a diagnosable error
- **AND** it MUST NOT silently send a known invalid legacy id

#### Scenario: unknown custom-like model is not blocked by officialness
- **WHEN** a model value is user-specified and passes shape validation
- **THEN** the backend MUST allow passthrough to Claude Code CLI
- **AND** it MUST NOT reject the value solely because it was not discovered as an official model

### Requirement: Claude Model Resolution MUST Be Observable

The system MUST record enough diagnostic information to understand how the final Claude runtime model was selected.

#### Scenario: send diagnostics include model source
- **WHEN** a Claude message is sent
- **THEN** debug diagnostics MUST include the selected UI id, resolved runtime model, and resolution source
- **AND** diagnostics MUST distinguish CLI-discovered, custom, settings-override, cached-fallback, builtin-fallback, and unknown sources

#### Scenario: refresh diagnostics include discovery source
- **WHEN** Claude model refresh completes
- **THEN** diagnostics MUST indicate whether the visible catalog came from CLI discovery, cache, fallback, or a merge of those sources
- **AND** failures MUST include enough error detail to support troubleshooting

#### Scenario: unknown source is explicit
- **WHEN** the system cannot determine a Claude model entry source
- **THEN** it MUST mark the source as `unknown`
- **AND** it MUST NOT omit the source field from diagnostics
