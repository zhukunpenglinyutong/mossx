## ADDED Requirements

### Requirement: Bridge MUST Prefer Codex CLI Computer Use Plugin Cache

mossx MUST treat the Codex CLI plugin cache as the primary Computer Use launch contract when it exists.

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

### Requirement: CLI Plugin Cache Helper MUST NOT Be Direct-Exec Probed

CLI cache Computer Use helper MUST be verified as a Codex CLI plugin launch contract, not by direct helper execution from mossx.

#### Scenario: cli cache helper activation is static contract verification
- **WHEN** activation sees helper path under Codex CLI plugin cache
- **THEN** activation MUST NOT execute `SkyComputerUseClient`
- **AND** MUST return helper bridge verified only from descriptor/helper/cache contract evidence

#### Scenario: cli cache descriptor is evidence-only
- **WHEN** static contract verification succeeds
- **THEN** status MAY remove `helper_bridge_unverified`
- **AND** MUST keep permission / approval blockers until separately verified

### Requirement: CLI Plugin Cache Handoff MUST Not Be Classified As Codex App Parent Failure

Host-contract diagnostics MUST distinguish Codex CLI plugin cache from Codex.app bundled helper direct-exec.

#### Scenario: cli cache helper is classified as cli plugin contract
- **WHEN** helper path is resolved from Codex CLI plugin cache
- **THEN** diagnostics MUST NOT return `requires_official_parent`
- **AND** MUST classify the `.mcp.json` as handoff candidate evidence

#### Scenario: app bundled helper still remains diagnostics-only
- **WHEN** helper path comes from `/Applications/Codex.app/.../plugins/computer-use`
- **THEN** diagnostics MUST keep direct-exec protection
- **AND** MAY return `requires_official_parent` when current host is not official Codex parent
