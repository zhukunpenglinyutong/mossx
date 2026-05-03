## ADDED Requirements

### Requirement: Context Ledger Surface SHALL Explain Carry-Over Lifecycle For Retained Blocks

系统 MUST 在 `pinned_next_send` 与 `carried_over` block 上提供显式生命周期说明，而不是只暴露参与状态枚举。

#### Scenario: pinned block explains that it will survive exactly one more send

- **WHEN** 用户对显式 block 执行 `keep for next send`
- **THEN** ledger SHALL 显示该 block 会在下一轮继续保留一次的解释
- **AND** 系统 SHALL NOT 把该语义退化成无解释的普通 selected 状态

#### Scenario: inherited block explains why it is still present

- **WHEN** 某个 block 因上一轮 keep 语义被带入当前准备态
- **THEN** ledger SHALL 显示该 block 是由上一轮保留带入
- **AND** ledger SHALL 说明该 block 若不再次 keep，将在本轮发送后自动消耗

### Requirement: Context Ledger Surface SHALL Offer A Dedicated Clear Action For Inherited Blocks

系统 MUST 为 `carried_over` block 提供语义准确的清理动作，而不是继续只暴露模糊的 `exclude next send`。

#### Scenario: user clears an inherited block before the next send

- **WHEN** 当前 block 处于 `carried_over` 状态
- **AND** 用户触发 `clear carried-over`
- **THEN** 系统 SHALL 立即把该 block 从当前准备态移除
- **AND** 相关 retained state SHALL 同步清理

#### Scenario: inherited clear does not mutate unrelated selections

- **WHEN** 用户清理某个 `carried_over` block
- **THEN** 系统 SHALL NOT 移除其他未被选中的 retained block
- **AND** 当前未关联的 selected / pinned block SHALL 保持不变
