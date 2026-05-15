# codex-external-config-runtime-reload Specification

## Purpose

Defines the codex-external-config-runtime-reload behavior contract, covering Codex External Config Reload MUST Be Triggerable Without App Restart.

## Requirements
### Requirement: Codex External Config Reload MUST Be Triggerable Without App Restart
The system MUST provide a client-visible action to reload Codex runtime configuration from external config files without restarting the application process.

#### Scenario: manual reload action triggers runtime refresh
- **WHEN** user clicks reload action in Codex settings after external config file changes
- **THEN** system MUST execute runtime config reload flow
- **AND** system MUST return explicit success or failure result to frontend

#### Scenario: next codex send uses latest file-based config after successful reload
- **WHEN** reload flow completes successfully
- **THEN** the next Codex send operation MUST use the latest configuration values from file
- **AND** user MUST NOT need to restart app process for the new config to take effect

### Requirement: Codex External Config Reload MUST Be Fail-Safe
If reload fails, the system MUST keep existing usable runtime context and MUST expose diagnosable error details.

#### Scenario: reload failure keeps previous runtime context usable
- **WHEN** reload flow fails due to invalid file content or read errors
- **THEN** Codex message sending MUST remain available via previous runtime context
- **AND** system MUST NOT leave runtime in half-applied state

#### Scenario: reload failure reports actionable diagnostics
- **WHEN** reload flow fails
- **THEN** backend MUST return failure stage and reason
- **AND** frontend MUST present reload failed status instead of applied status

### Requirement: Codex Reload Critical Section MUST Be Serialized
The system MUST serialize reload critical section to avoid race conditions from repeated triggers.

#### Scenario: repeated reload triggers are serialized
- **WHEN** user or UI triggers multiple reload actions in short interval
- **THEN** system MUST process reload operations sequentially or reject overlap deterministically
- **AND** final runtime config state MUST be deterministic and observable

### Requirement: Reload MUST NOT Reset Unified History Visibility
Introducing runtime reload MUST NOT clear or isolate Codex history list visibility.

#### Scenario: history remains populated across reload success
- **WHEN** user triggers reload and reload succeeds
- **THEN** Codex history list MUST remain populated by unified history policy
- **AND** system MUST NOT fallback to source-isolated empty state solely due to reload

#### Scenario: history remains populated across reload failure
- **WHEN** user triggers reload and reload fails
- **THEN** Codex history list MUST remain available from previous/runtime-safe and local aggregate sources
- **AND** frontend MUST keep previously visible entries unless user explicitly refreshes filters

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

