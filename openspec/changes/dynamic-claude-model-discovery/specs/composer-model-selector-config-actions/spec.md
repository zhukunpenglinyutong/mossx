## MODIFIED Requirements

### Requirement: Refresh Config Action MUST Reload Only The Current Provider

The right footer action MUST refresh the current provider's model/config snapshot without refreshing unrelated provider catalogs.

#### Scenario: Codex refresh reloads Codex model config
- **WHEN** the current provider is `Codex`
- **AND** the user clicks `刷新配置`
- **THEN** the system MUST refresh the Codex model list and config-derived model
- **AND** it MUST NOT refresh Claude Code or Gemini model catalogs as part of that action

#### Scenario: Claude Code refresh reloads dynamic model discovery and overrides
- **WHEN** the current provider is `Claude Code`
- **AND** the user clicks `刷新配置`
- **THEN** the system MUST rerun Claude Code CLI model discovery
- **AND** it MUST reread Claude model overrides from `~/.claude/settings.json` and supported environment sources
- **AND** it MUST merge user-added Claude custom models into the refreshed selector catalog

#### Scenario: Claude Code refresh preserves custom models not listed by CLI
- **WHEN** Claude Code config refresh returns a CLI-discovered model catalog
- **AND** the user has custom Claude models that are not present in the CLI output
- **THEN** the selector MUST keep those custom models visible and selectable
- **AND** it MUST NOT remove them solely because CLI discovery did not list them

#### Scenario: refreshed Claude labels override stale local mapping cache
- **WHEN** Claude config refresh returns a model catalog with updated labels
- **AND** localStorage still contains an older Claude model mapping
- **THEN** the selector SHALL display the parent-provided refreshed catalog label
- **AND** the selector SHALL NOT treat stale localStorage mapping as a source of truth

#### Scenario: model selector remains presentational after refresh
- **WHEN** `ModelSelect` renders provider model options
- **THEN** display labels SHALL come from the `models` prop and default i18n fallback
- **AND** the selector SHALL NOT independently reread provider mapping caches on mount

#### Scenario: Gemini refresh reloads Gemini settings
- **WHEN** the current provider is `Gemini`
- **AND** the user clicks `刷新配置`
- **THEN** the system MUST reread Gemini model configuration from Gemini settings/vendor sources and supported CLI discovery sources
- **AND** the refreshed selector MUST include newly configured Gemini models when parsing succeeds

#### Scenario: refresh does not start a conversation
- **WHEN** the user clicks `刷新配置`
- **THEN** the system MUST NOT send a message
- **AND** it MUST NOT create a new user-visible native conversation solely because of refresh
