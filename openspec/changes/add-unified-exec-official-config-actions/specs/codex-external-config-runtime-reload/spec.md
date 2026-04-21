## MODIFIED Requirements

### Requirement: External Config Reload MUST Respect Official Ownership Boundary

Codex external config reload 与 settings 恢复流程 MUST 消费 official external config 字段，但 MUST NOT 再依赖 desktop-local unified_exec selector / override 语义。

#### Scenario: runtime reload ignores historical private feature flags

- **GIVEN** `~/.codex/config.toml` 的 `[features]` 中存在 `collab`、`collaboration_modes`、`steer` 或 `collaboration_mode_enforcement`
- **WHEN** 系统执行 external config reload 或读取 app settings
- **THEN** 系统 MUST 忽略这些 private/historical flags
- **AND** MUST NOT 用这些值覆盖桌面端本地 settings

#### Scenario: reload continues to consume official unified_exec

- **GIVEN** `~/.codex/config.toml` 中存在 official `unified_exec`
- **WHEN** 系统执行 external config reload
- **THEN** 系统 MUST 继续消费该 official external config 字段
- **AND** 该字段的处理路径 MUST 与 private flags 分离

### Requirement: Desktop Settings MUST NOT Backfill Private Flags Into External Config

桌面端更新 app-local settings 时 MUST NOT 再把私有或遗留开关写入 `~/.codex/config.toml`；只有显式 official config action lane 才 MAY 写入或删除 `unified_exec`。

#### Scenario: updating local collaboration settings does not write private flags

- **WHEN** 用户更新 collaboration modes、steer 或 mode enforcement 相关本地设置
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入 `collaboration_modes`、`steer` 或 `collaboration_mode_enforcement`

#### Scenario: dead collab flag is not reintroduced

- **WHEN** 用户保存 Codex 相关设置
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入 `collab`
- **AND** MUST NOT 通过 external config 重新引入该死字段

#### Scenario: generic settings save still does not backfill unified_exec

- **WHEN** 用户执行普通 settings save 或 settings restore
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入或覆盖 `unified_exec`

#### Scenario: explicit official config action may set unified_exec true or false

- **WHEN** 用户点击官方配置动作按钮并选择写入 enabled 或 disabled
- **THEN** 系统 MAY 向 `~/.codex/config.toml` 写入显式 `unified_exec`
- **AND** 该 mutation MUST 与普通 settings save 路径分离

#### Scenario: explicit official config action reloads runtime when possible

- **WHEN** 用户成功执行 official config action
- **THEN** 桌面端 SHOULD 刷新当前 Codex runtime config
- **AND** 如果当前没有已连接会话，界面 MUST 反馈“下次连接时生效”，而不是 failed
