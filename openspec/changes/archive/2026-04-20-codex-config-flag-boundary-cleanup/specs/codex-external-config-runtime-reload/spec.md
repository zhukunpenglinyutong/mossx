## ADDED Requirements

### Requirement: External Config Reload MUST Respect Official Ownership Boundary

Codex external config reload 与 settings 恢复流程 MUST 只消费 official Codex external config 字段，不得再把桌面端私有实验开关作为 `~/.codex/config.toml` 的 source-of-truth。

#### Scenario: runtime reload ignores historical private feature flags

- **GIVEN** `~/.codex/config.toml` 的 `[features]` 中存在 `collab`、`collaboration_modes`、`steer` 或 `collaboration_mode_enforcement`
- **WHEN** 系统执行 external config reload 或读取 app settings
- **THEN** 系统 MUST 忽略这些 private/historical flags
- **AND** MUST NOT 用这些值覆盖桌面端本地 settings

#### Scenario: official passthrough field remains reloadable

- **GIVEN** `~/.codex/config.toml` 中存在 official `unified_exec`
- **WHEN** 系统执行 external config reload
- **THEN** 系统 MAY 继续消费该 official external config 字段
- **AND** 该字段的处理路径 MUST 与 private flags 分离

### Requirement: Desktop Settings MUST NOT Backfill Private Flags Into External Config

桌面端更新 app-local settings 时 MUST NOT 再把私有或遗留开关写入 `~/.codex/config.toml`。

#### Scenario: updating local collaboration settings does not write private flags

- **WHEN** 用户更新 collaboration modes、steer 或 mode enforcement 相关本地设置
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入 `collaboration_modes`、`steer` 或 `collaboration_mode_enforcement`

#### Scenario: dead collab flag is not reintroduced

- **WHEN** 用户保存 Codex 相关设置
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入 `collab`
- **AND** MUST NOT 通过 external config 重新引入该死字段
