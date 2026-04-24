## ADDED Requirements

### Requirement: macOS Adapter MUST Execute Bounded Activation Probe

`macOS` adapter 在第二阶段 MUST 不仅能发现官方安装态，还必须能执行一次 bounded activation/probe，并返回结构化结果。

#### Scenario: macOS adapter returns verified outcome after successful probe
- **WHEN** 当前运行在 `macOS`，且 activation/probe 成功验证宿主可桥接官方 helper
- **THEN** `macOS` adapter MUST 返回 `verified` 或等价成功结果
- **AND** MUST 附带更新后的 bridge status 与 probe diagnostics

#### Scenario: macOS adapter returns failed classification on launch or handshake error
- **WHEN** activation/probe 因 helper 启动失败、握手失败、宿主不兼容或 timeout 而失败
- **THEN** `macOS` adapter MUST 返回结构化 failure classification
- **AND** MUST NOT 把该失败伪装成普通 `ready` / `blocked` 文案

### Requirement: macOS Adapter MUST Scope Verification To Current Helper Identity

`macOS` adapter MUST 只在当前 app session 内复用 activation 验证结果，并在 helper identity 变化时使其失效。

#### Scenario: successful verification is reused within current app session
- **WHEN** 当前 app session 已经对特定 `Codex.app` / plugin manifest / helper path 成功完成 activation/probe
- **THEN** 后续 status 读取 MAY 复用该验证结果
- **AND** MUST 不再要求用户重复完成同一次 helper bridgeability 验证

#### Scenario: helper identity change invalidates prior verification
- **WHEN** `Codex.app` path、plugin manifest path 或 helper path 发生变化
- **THEN** adapter MUST 丢弃旧的 activation verification
- **AND** MUST 重新回到待验证状态，而不是沿用 stale trust

### Requirement: Windows Adapter MUST Remain Non-Executable In Phase 2

第二阶段新增 activation lane 后，`Windows` adapter 仍然 MUST 保持 explicit unsupported，不得尝试执行 probe 或 invoke。

#### Scenario: windows host never executes activation probe
- **WHEN** 当前平台为 `Windows`
- **THEN** adapter MUST NOT 启动任何 helper probe / invoke
- **AND** MUST 继续返回 `unsupported`
