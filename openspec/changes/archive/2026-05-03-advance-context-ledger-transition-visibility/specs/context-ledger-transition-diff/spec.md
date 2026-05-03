## ADDED Requirements

### Requirement: Context Ledger SHALL Explain Transition Diffs Relative To The Last Send Baseline

系统 MUST 能把当前账本与最近一次发送前的账本快照进行对比，而不是只展示静态当前态。

#### Scenario: send completion keeps a recent diff summary visible

- **WHEN** 用户完成一次发送
- **AND** 发送前账本与发送后当前账本存在来源级变化
- **THEN** ledger SHALL 展示基于 `last send baseline` 的变化摘要
- **AND** 摘要 SHALL 至少表达 added / removed / retained / changed 中的必要变化类型

#### Scenario: usage-only current state may still show comparison summary

- **WHEN** 当前发送收敛后已无显式 memory / file / helper block
- **AND** 最近一次 send comparison summary 仍存在
- **THEN** 系统 MAY 继续显示 ledger comparison summary
- **AND** SHALL NOT 因当前只剩 usage snapshot 而把最近变化完全隐藏

#### Scenario: comparison does not rewrite current block truth

- **WHEN** 某个 block 已在当前准备态中移除
- **THEN** 当前 groups SHALL NOT 把该 block 伪装成仍然存在
- **AND** 该 block 的变化 SHALL 通过 comparison summary 或等价 diff surface 表达
