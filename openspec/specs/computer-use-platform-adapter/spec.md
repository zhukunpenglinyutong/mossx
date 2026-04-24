# computer-use-platform-adapter Specification

## Purpose

定义 Computer Use bridge 在 `macOS` 与 `Windows` 上的平台分治契约，确保官方支持路径与 unsupported 路径物理隔离、语义清晰。
## Requirements
### Requirement: Platform Adapter MUST Physically Separate macOS and Windows Paths

系统 MUST 将 `macOS` 与 `Windows` 的 Computer Use 平台逻辑拆分为独立 adapter，而不是在同一路径里共享 runtime 假设。

#### Scenario: macOS adapter handles official computer use discovery
- **WHEN** 系统运行在 `macOS`
- **THEN** 系统 MUST 通过 `macOS` adapter 解析官方 Codex app、plugin、cache 与 helper 前置条件
- **AND** MUST NOT 依赖 `Windows` adapter 提供任何 bridge 判断

#### Scenario: windows adapter never attempts macOS helper path
- **WHEN** 系统运行在 `Windows`
- **THEN** 系统 MUST 只走 `Windows` adapter
- **AND** MUST NOT 尝试读取 `macOS` helper、bundle 或 app 路径

### Requirement: macOS Adapter MUST Return Structured Prerequisite State

`macOS` adapter MUST 能把官方 Computer Use 的前置条件收敛成结构化状态，而不是仅返回布尔值。

#### Scenario: macOS adapter reports ready when official prerequisites are satisfied
- **GIVEN** 当前运行在 `macOS`，且官方 Codex App、plugin 状态与桥接前置条件满足
- **WHEN** 系统请求 platform adapter 结果
- **THEN** `macOS` adapter MUST 返回 `ready`
- **AND** MUST 附带可消费的 plugin/app detection 字段

#### Scenario: macOS adapter reports blocked with reasons
- **GIVEN** 当前运行在 `macOS`，但缺少 plugin enablement、helper 可桥接性、权限或等价前置条件
- **WHEN** 系统请求 platform adapter 结果
- **THEN** `macOS` adapter MUST 返回 `blocked` 或 `unavailable`
- **AND** MUST 提供至少一个 blocked reason 或 guidance

#### Scenario: plugin disabled is treated as blocked instead of unavailable
- **GIVEN** 当前运行在 `macOS`，且已检测到官方 plugin，但 plugin 处于 disabled
- **WHEN** 系统请求 platform adapter 结果
- **THEN** `macOS` adapter MUST 返回 `blocked`
- **AND** blocked reason MUST 包含 `plugin_disabled`

#### Scenario: unknown permission or approval state cannot be reported as ready
- **GIVEN** 当前运行在 `macOS`，且 plugin 已检测到，但系统权限、app approvals 或 helper bridgeability 仍无法确认
- **WHEN** 系统请求 platform adapter 结果
- **THEN** `macOS` adapter MUST 返回 `blocked`
- **AND** blocked reason MUST 包含 `permission_required`、`approval_required`、`helper_bridge_unverified` 或 `unknown_prerequisite` 中至少一项

### Requirement: Windows Adapter MUST Be Explicitly Unsupported in Phase 1

在当前阶段，`Windows` adapter MUST 明确返回 unsupported contract，而不是伪装成“待安装”或“配置不完整”。

#### Scenario: windows platform reports unsupported
- **WHEN** 系统运行在 `Windows`
- **THEN** `Windows` adapter MUST 返回 `unsupported`
- **AND** guidance MUST 明确指出当前版本不支持 Windows Computer Use bridge

#### Scenario: windows unsupported does not degrade other features
- **WHEN** `Windows` adapter 返回 `unsupported`
- **THEN** 现有 Codex、MCP、设置与工作区主流程 MUST 保持可用
- **AND** 系统 MUST NOT 因 unsupported 结果触发额外错误恢复或重试循环

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

### Requirement: Platform Adapter MUST Keep Handoff Discovery macOS-Only

official parent handoff discovery MUST 只在 macOS adapter 中可执行，Windows 和其他平台必须保持 explicit unsupported。

#### Scenario: windows cannot execute handoff discovery
- **WHEN** 当前平台为 `Windows`
- **THEN** platform adapter MUST NOT 暴露 official parent handoff discovery execution path
- **AND** MUST 返回 `unsupported`

#### Scenario: non-macos guidance is non-executable
- **WHEN** 非 macOS 平台展示 Computer Use guidance
- **THEN** guidance MUST NOT 指示用户运行 macOS bundle path、helper binary、`open -a Codex` 或 shell command
- **AND** MUST 明确本阶段只支持 macOS diagnostics investigation
