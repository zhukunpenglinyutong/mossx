## MODIFIED Requirements

### Requirement: Bridge MUST Prefer Codex CLI Computer Use Plugin Cache

mossx MUST treat the Codex CLI plugin cache as the primary Computer Use launch contract when it exists, and this contract MUST be usable as the prerequisite evidence for broker execution.

#### Scenario: cli plugin cache descriptor is detected
- **WHEN** `~/.codex/plugins/cache/openai-bundled/computer-use/<version>/.mcp.json` exists
- **THEN** Computer Use status MUST use that descriptor as `helperDescriptorPath`
- **AND** MUST resolve helper path using descriptor `cwd + command`

#### Scenario: highest plugin cache version wins
- **WHEN** multiple Computer Use cache versions contain `.codex-plugin/plugin.json`
- **THEN** detection MUST choose the highest semantic version
- **AND** MUST use the descriptor from the same version directory

#### Scenario: codex app bundled descriptor remains fallback
- **WHEN** CLI plugin cache descriptor is missing
- **THEN** macOS detection MAY fall back to `/Applications/Codex.app` bundled descriptor
- **AND** MUST keep diagnostics-only safeguards for direct bundled helper execution

#### Scenario: cli plugin cache contract gates broker
- **WHEN** broker evaluates Computer Use readiness
- **THEN** it MUST require the CLI plugin cache descriptor/helper contract
- **AND** MUST reject app-bundled direct helper paths as broker-ready evidence
