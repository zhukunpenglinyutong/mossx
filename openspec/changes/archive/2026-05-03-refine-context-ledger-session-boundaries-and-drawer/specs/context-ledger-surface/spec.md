## ADDED Requirements

### Requirement: Context Ledger Surface SHALL Offer A Compact One-Line Header

系统 MUST 让 collapsed ledger header 以单行 compact summary 呈现，降低 composer 上方的垂直占用。

#### Scenario: collapsed header keeps title, summary, and controls on one row

- **WHEN** `Context Ledger` surface 可见但处于 collapsed header 态
- **THEN** 标题、摘要和主要操作 SHALL 在单行内呈现
- **AND** 系统 SHALL NOT 再把摘要拆成第二行默认占位

### Requirement: Context Ledger Surface SHALL Support A Recoverable Hidden Drawer

系统 MUST 允许用户临时把 ledger surface 藏到 composer 后方，同时保留再次拉出的入口。

#### Scenario: user hides the ledger drawer without losing state

- **WHEN** 用户触发 `hide drawer` action
- **THEN** 系统 SHALL 把 ledger surface 切换到 hidden drawer 状态
- **AND** 当前 projection / comparison / selection state SHALL 保持不变

#### Scenario: hidden drawer still exposes a reopen affordance

- **WHEN** ledger 处于 hidden drawer 状态
- **THEN** 用户 SHALL 仍能看到一个最小可操作入口
- **AND** 用户激活该入口后 SHALL 恢复 ledger surface
