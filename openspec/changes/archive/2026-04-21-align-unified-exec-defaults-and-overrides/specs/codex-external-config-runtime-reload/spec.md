## MODIFIED Requirements

### Requirement: External Config Reload MUST Respect Official Ownership Boundary

Codex external config reload 与 settings 恢复流程 MUST 只在 unified_exec policy 为 `inherit` 时消费 official external config 字段；一旦用户设置 explicit unified_exec override，桌面端 runtime 行为 MUST 由本地策略优先，而不是再要求 global config mutation。

#### Scenario: runtime reload ignores historical private feature flags

- **GIVEN** `~/.codex/config.toml` 的 `[features]` 中存在 `collab`、`collaboration_modes`、`steer` 或 `collaboration_mode_enforcement`
- **WHEN** 系统执行 external config reload 或读取 app settings
- **THEN** 系统 MUST 忽略这些 private/historical flags
- **AND** MUST NOT 用这些值覆盖桌面端本地 settings

#### Scenario: inherit mode continues to consume official unified_exec

- **GIVEN** `~/.codex/config.toml` 中存在 official `unified_exec`
- **AND** unified_exec policy 为 `inherit`
- **WHEN** 系统执行 external config reload
- **THEN** 系统 MUST 继续消费该 official external config 字段
- **AND** 该字段的处理路径 MUST 与 private flags 分离

#### Scenario: explicit override wins during reload and restore

- **GIVEN** unified_exec policy 为 `force_enabled` 或 `force_disabled`
- **AND** `~/.codex/config.toml` 中存在 official `unified_exec`
- **WHEN** 系统执行 external config reload 或 settings restore
- **THEN** 桌面端为自身启动的 Codex runtime 计算的 unified_exec 行为 MUST 以本地 explicit override 为准
- **AND** 系统 MUST NOT 通过普通 reload / restore 流程回写 global config 以实现该优先级

### Requirement: Desktop Settings MUST NOT Backfill Private Flags Into External Config

桌面端更新 app-local settings 时 MUST NOT 再把私有或遗留开关写入 `~/.codex/config.toml`；普通 settings save 同样 MUST NOT 再回填 official `unified_exec`。

#### Scenario: updating local collaboration settings does not write private flags

- **WHEN** 用户更新 collaboration modes、steer 或 mode enforcement 相关本地设置
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入 `collaboration_modes`、`steer` 或 `collaboration_mode_enforcement`

#### Scenario: dead collab flag is not reintroduced

- **WHEN** 用户保存 Codex 相关设置
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入 `collab`
- **AND** MUST NOT 通过 external config 重新引入该死字段

#### Scenario: generic settings save does not backfill unified_exec

- **WHEN** 用户执行普通 settings save、settings restore 或非 repair 的 runtime reload
- **THEN** 系统 MUST NOT 向 `~/.codex/config.toml` 写入或覆盖 `unified_exec`

#### Scenario: explicit repair action is the only allowed global config mutation path

- **WHEN** 桌面端需要帮助用户恢复 official default unified_exec 行为
- **THEN** 只有显式 repair action 才 MAY 修改 `~/.codex/config.toml`
- **AND** 该修改 MUST 以用户确认作为前提
