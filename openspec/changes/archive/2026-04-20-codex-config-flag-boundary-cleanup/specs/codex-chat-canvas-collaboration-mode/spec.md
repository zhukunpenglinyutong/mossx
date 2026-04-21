## ADDED Requirements

### Requirement: Collaboration Mode Visibility MUST Be App-Local

Codex collaboration mode 的 UI 可见性、快捷键注册和模式列表请求 MUST 只受桌面端 app-local settings 控制，不得再被 external `config.toml` 中的历史 feature flags 反向覆盖。

#### Scenario: local setting enables collaboration mode UI

- **GIVEN** 桌面端本地 settings 中 `experimentalCollaborationModesEnabled=true`
- **WHEN** 用户进入 Codex 会话
- **THEN** 系统 MUST 按本地 setting 显示 collaboration selector
- **AND** MAY 注册 collaboration 快捷键与模式列表请求

#### Scenario: historical external flag does not override local collaboration UI state

- **GIVEN** `~/.codex/config.toml` 中存在 `collaboration_modes=false`
- **AND** 桌面端本地 settings 中 `experimentalCollaborationModesEnabled=true`
- **WHEN** 用户进入 Codex 会话或重新加载 settings
- **THEN** 系统 MUST 继续以本地 setting 为准
- **AND** MUST NOT 因 external historical flag 隐藏 collaboration mode UI

### Requirement: Dead Multi-Agent Toggle MUST NOT Masquerade As Active Collaboration Capability

若桌面端保留 legacy `experimentalCollabEnabled` 字段用于兼容，其行为 MUST 为 inert，不得继续作为真实 capability 开关对外生效。

#### Scenario: legacy collab field does not control collaboration mode behavior

- **GIVEN** `experimentalCollabEnabled` 存在于历史 settings 数据中
- **WHEN** 系统初始化 Codex collaboration 相关能力
- **THEN** 系统 MUST NOT 使用该字段决定 collaboration mode UI、mode payload 或 runtime policy
- **AND** MUST 以真实本地设置字段维持行为一致性
