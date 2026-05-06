## ADDED Requirements

### Requirement: Bottom Activity Checkpoint Visibility MUST Migrate From Legacy Edits Preference

系统 MUST 将底部活动区的可见性控制从 legacy `Edits` 迁移到新的 `Checkpoint/结果`，同时保持老用户配置可兼容恢复。

#### Scenario: appearance settings shows checkpoint label instead of edits

- **WHEN** 用户打开 basic appearance 中的 client UI visibility controls
- **THEN** 系统 MUST 展示 `Checkpoint/结果` 对应的 child control 文案
- **AND** MUST NOT 继续把该入口对用户展示为 `Edits`

#### Scenario: persisted legacy edits key restores checkpoint visibility

- **WHEN** 已持久化的可见性偏好只包含 legacy `bottomActivity.edits`
- **THEN** 系统 MUST 将其视为 `bottomActivity.checkpoint` 的兼容 alias
- **AND** 老用户原本的显示/隐藏偏好 MUST 在升级后继续生效

#### Scenario: new saves normalize to checkpoint key

- **WHEN** 用户在新版本中修改底部活动区该项可见性
- **THEN** 系统 MUST 将新的持久化写回到 `bottomActivity.checkpoint`
- **AND** 后续读取 SHOULD 优先使用新的 canonical key

#### Scenario: hidden checkpoint keeps underlying result data alive

- **WHEN** 用户隐藏 `Checkpoint/结果` 入口
- **THEN** 系统 MUST 继续保留其底层 facts、verdict 与 summary state
- **AND** 隐藏操作 MUST 仅影响展示，不得清空底层结果判断数据
