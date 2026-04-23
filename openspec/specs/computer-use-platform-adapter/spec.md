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
