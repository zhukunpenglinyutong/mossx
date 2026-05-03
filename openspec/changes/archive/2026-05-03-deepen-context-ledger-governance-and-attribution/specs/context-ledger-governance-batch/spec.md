## ADDED Requirements

### Requirement: Context Ledger SHALL Support Batch Governance For Explicit Governable Blocks

系统 MUST 为前端显式可见、可治理的 ledger block 提供批量治理入口，避免用户逐条操作。

#### Scenario: user selects multiple explicit blocks for the same action

- **WHEN** 当前准备态包含多个 `manual_memory`、`note_card` 或 `helper_selection` block
- **THEN** 用户 SHALL 能一次性对所选 block 执行 keep / clear / exclude 中的受支持动作
- **AND** 系统 SHALL 只对 eligibility matrix 允许的 block 类型开放对应动作

#### Scenario: unsupported block types stay out of batch mode

- **WHEN** block 不属于 batch-governable 类型
- **THEN** 系统 SHALL NOT 把该 block 伪装成支持批量治理
- **AND** 单点治理路径 SHALL 继续保持可用
