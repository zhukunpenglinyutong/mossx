# codex-unified-exec-override-governance Specification

## Purpose

Define how desktop-managed Codex unified_exec handling follows official defaults, exposes explicit official config actions, and repairs legacy global config mutations safely.

## Requirements

### Requirement: Desktop unified_exec policy MUST follow official defaults unless user explicitly overrides

桌面端在没有显式 official `unified_exec` key 时 MUST 跟随官方平台默认行为，而不是再使用产品自定义的全平台布尔默认值。

#### Scenario: official default remains enabled on non-Windows

- **WHEN** 用户运行在 macOS 或 Linux，且 official config 中没有显式 `unified_exec`
- **THEN** 桌面端 MUST 将 unified_exec 视为 official default enabled
- **AND** 设置 UI MUST 明确该状态来自 official default，而不是本地 override

#### Scenario: official default remains disabled on Windows

- **WHEN** 用户运行在 Windows，且 official config 中没有显式 `unified_exec`
- **THEN** 桌面端 MUST 将 unified_exec 视为 official default disabled
- **AND** 设置 UI MUST 明确该状态来自 official default，而不是本地 override

### Requirement: Desktop MUST expose unified_exec as official config actions only

桌面端 MUST 将 `unified_exec` 暴露为 official config action lane，用于显式写入 `~/.codex/config.toml` 的 `unified_exec`；桌面端 UI MUST NOT 再暴露独立 selector 语义。

#### Scenario: writing official enabled updates global config directly

- **WHEN** 用户点击写入 official `unified_exec = true`
- **THEN** 系统 MUST 更新 `~/.codex/config.toml`
- **AND** 界面 MUST 把该动作表述为官方配置写入，而不是本地 override

#### Scenario: writing official disabled updates global config directly

- **WHEN** 用户点击写入 official `unified_exec = false`
- **THEN** 系统 MUST 更新 `~/.codex/config.toml`
- **AND** 界面 MUST 把该动作表述为官方配置写入，而不是本地 override

#### Scenario: follow official default removes explicit global key

- **WHEN** 用户点击 “follow official default”
- **THEN** 系统 MUST 从 `~/.codex/config.toml` 删除显式 `unified_exec`
- **AND** 后续行为 MUST 回退到 official default 或 external config 的其他剩余内容

### Requirement: Legacy global unified_exec overrides MUST be repairable with confirmation

如果 global config 中存在显式 `unified_exec` key，桌面端 MUST 提供可诊断且需要用户显式触发的 official config action 路径。

#### Scenario: explicit global key surfaces official config actions

- **WHEN** 桌面端检测到 global config 中存在显式 `unified_exec` key
- **THEN** 设置界面 MUST 展示当前 official config 状态
- **AND** MUST 提供写入 enabled、写入 disabled、恢复官方默认三个显式动作

#### Scenario: restore official default still requires explicit user intent

- **WHEN** 用户选择 “restore official default”
- **THEN** 桌面端 MUST 仅在显式用户动作后才修改 global config
- **AND** 修改结果 MUST 让后续 Codex 行为重新跟随官方默认或 external config 剩余内容
