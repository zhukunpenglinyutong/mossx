## ADDED Requirements

### Requirement: Codex Realtime History Reconcile MUST Be Validation-Oriented

在 `Codex` 会话中，turn completion 后的 history reconcile MUST 以 validation / backfill 为主，而不是 primary duplicate repair。只要客户端已经具备足够的本地 observation 去完成 canonical convergence，系统就 MUST 在 history refresh 之前保持稳定的可见 row 结果。

#### Scenario: equivalent history replay does not change visible row cardinality

- **WHEN** `Codex` turn 已在本地完成 user / assistant / reasoning 的 canonical convergence
- **AND** 后续 history reconcile 只带来等价内容
- **THEN** reconciliation MUST NOT 改变用户可见 message row 数量
- **AND** reconciliation 只 MAY canonicalize ids、metadata 或来源字段

#### Scenario: reconcile may backfill missing structured facts without reintroducing duplicates

- **WHEN** 本地 realtime settlement 缺少部分 canonical metadata 或 structured activity facts
- **AND** post-turn history reconcile 能补齐这些缺失信息
- **THEN** 系统 MAY 用 reconcile 结果回填缺失事实
- **AND** MUST NOT 因回填动作重新引入重复 user / assistant / reasoning rows

#### Scenario: non-codex lifecycle behavior remains unchanged

- **WHEN** 当前引擎为 `Claude`、`Gemini` 或 `OpenCode`
- **THEN** 本 reconciliation 职责调整 MUST NOT 改变其既有生命周期行为
- **AND** engine-specific differences MUST 继续保持在内部 adapter / loader 边界内
