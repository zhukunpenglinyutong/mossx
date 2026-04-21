## ADDED Requirements

### Requirement: Desktop unified_exec policy MUST follow official defaults unless user explicitly overrides

桌面端在未设置 explicit unified_exec override 时 MUST 跟随官方平台默认行为，而不是再使用产品自定义的全平台布尔默认值。

#### Scenario: inherit mode follows non-Windows official default

- **WHEN** 用户运行在 macOS 或 Linux，且 unified_exec policy 为 `inherit`
- **THEN** 桌面端 MUST 将 unified_exec 视为 official default enabled
- **AND** 设置 UI MUST 明确该状态来自 official default，而不是本地强制开启

#### Scenario: inherit mode follows Windows official default

- **WHEN** 用户运行在 Windows，且 unified_exec policy 为 `inherit`
- **THEN** 桌面端 MUST 将 unified_exec 视为 official default disabled
- **AND** 设置 UI MUST 明确该状态来自 official default，而不是本地强制关闭

### Requirement: Desktop MUST provide explicit unified_exec override modes

桌面端 MUST 允许用户将 unified_exec policy 设置为 `force_enabled` 或 `force_disabled`，并与 `inherit` 明确区分。

#### Scenario: user selects force enabled

- **WHEN** 用户将 unified_exec policy 设置为 `force_enabled`
- **THEN** 桌面端 MUST 在设置层持久化该 explicit override
- **AND** 后续由桌面端启动的 Codex runtime MUST 按 enabled 语义运行

#### Scenario: user selects force disabled

- **WHEN** 用户将 unified_exec policy 设置为 `force_disabled`
- **THEN** 桌面端 MUST 在设置层持久化该 explicit override
- **AND** 后续由桌面端启动的 Codex runtime MUST 按 disabled 语义运行

### Requirement: Explicit unified_exec overrides MUST be runtime-scoped

桌面端对 unified_exec 的 explicit override MUST 仅作用于自身启动或刷新的 Codex runtime，不得通过普通设置保存静默改写用户全局 `~/.codex/config.toml`。

#### Scenario: explicit override changes next runtime without editing global config

- **WHEN** 用户将 unified_exec policy 设置为 `force_enabled` 或 `force_disabled`
- **THEN** 下一次由桌面端启动或刷新的 Codex runtime MUST 体现该 override
- **AND** 普通 settings save / restore 流程 MUST NOT 改写 `~/.codex/config.toml`

### Requirement: Legacy global unified_exec overrides MUST be repairable with confirmation

如果旧版本已经向用户 global config 写入显式 `unified_exec` key，桌面端 MUST 提供可诊断且需要用户确认的 repair 路径。

#### Scenario: legacy external key surfaces repair actions

- **WHEN** 桌面端检测到 global config 中存在显式 `unified_exec` key，且当前 unified_exec policy 为 `inherit`
- **THEN** 设置界面 MUST 提供 “keep current override” 与 “restore official default” 两个动作
- **AND** MUST 向用户说明该 key 可能来自旧版本桌面端写入

#### Scenario: restoring official default requires confirmation

- **WHEN** 用户选择 “restore official default”
- **THEN** 桌面端 MUST 在用户确认后才修改 global config
- **AND** 修改结果 MUST 让后续 inherit 模式重新跟随官方默认或 external config 剩余内容
