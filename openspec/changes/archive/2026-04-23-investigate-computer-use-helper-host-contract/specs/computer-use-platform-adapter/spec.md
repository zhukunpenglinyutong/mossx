## ADDED Requirements

### Requirement: macOS Adapter MUST Classify Nested Helper Parent Contract Failures

`macOS` adapter MUST 将官方 nested app-bundle helper 不能由当前第三方宿主直接执行的情况分类为 host parent contract 问题，而不是普通 launch error。

#### Scenario: nested helper direct execution is classified as host incompatible
- **WHEN** activation/probe 或 diagnostics 发现 helper 是官方 nested app-bundle CLI，并且当前宿主不是官方 parent contract
- **THEN** `macOS` adapter MUST 返回 `host_incompatible` 或 `requires_official_parent` 分类
- **AND** MUST 包含 helper path、current host path 与 diagnostic message

#### Scenario: adapter avoids repeating known crashing launch path
- **WHEN** 当前 helper identity 已被识别为 nested app-bundle helper
- **THEN** `macOS` adapter MUST NOT 继续使用 direct exec 作为 host-contract diagnostics 方法
- **AND** MUST 采用只读证据采集或安全 handoff 检查

### Requirement: Platform Adapter MUST Keep Windows Non-Executable During Host Investigation

host-contract investigation 阶段 MUST 不改变 Windows adapter 的 explicit unsupported contract。

#### Scenario: windows adapter rejects host contract diagnostics
- **WHEN** 当前平台为 `Windows`
- **THEN** adapter MUST NOT 尝试 helper discovery、activation probe 或 host-contract diagnostics execution
- **AND** MUST 返回 `unsupported`

#### Scenario: windows unsupported does not mention macOS-only remediation as executable
- **WHEN** Windows adapter 返回 Computer Use unsupported guidance
- **THEN** guidance MUST 明确本阶段不支持 Windows bridge
- **AND** MUST NOT 指示用户运行 macOS helper、bundle path 或 shell command
