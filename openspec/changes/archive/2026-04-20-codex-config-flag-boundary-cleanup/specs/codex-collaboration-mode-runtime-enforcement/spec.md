## ADDED Requirements

### Requirement: Runtime Enforcement Setting MUST Remain App-Local

Codex collaboration mode runtime enforcement 的启停 MUST 由桌面端 app-local settings 控制，而不是由 external `config.toml` 中的历史 feature flag 决定。

#### Scenario: local enforcement setting controls runtime policy

- **GIVEN** 桌面端本地 settings 中 `codexModeEnforcementEnabled=false`
- **WHEN** 系统计算 Codex turn 的 execution policy
- **THEN** 系统 MUST 以本地 setting 决定是否启用 plan/code enforcement
- **AND** MUST NOT 读取 external `collaboration_mode_enforcement` 作为覆盖来源

#### Scenario: historical external enforcement flag is ignored

- **GIVEN** `~/.codex/config.toml` 中存在 `collaboration_mode_enforcement=true`
- **AND** 桌面端本地 settings 中 `codexModeEnforcementEnabled=false`
- **WHEN** 系统启动 Codex session、恢复 settings 或发送消息
- **THEN** 系统 MUST 继续以本地 setting 为准
- **AND** MUST NOT 因 historical external flag 恢复本地 enforcement

### Requirement: Steer Queue Behavior MUST Remain App-Local

Codex queued follow-up continuation 与 steer 相关行为 MUST 由桌面端本地 setting 控制，不得依赖 external `steer` feature flag。

#### Scenario: local steer setting controls queued follow-up behavior

- **GIVEN** 桌面端本地 settings 中 `experimentalSteerEnabled=true`
- **WHEN** 当前 Codex 线程处于 processing 状态且用户继续发送消息
- **THEN** 系统 MUST 以本地 setting 决定 same-run continuation / queue fusion 行为
- **AND** MUST NOT 读取 external `steer` 作为行为开关
