## ADDED Requirements

### Requirement: Context Ledger Surface SHALL Present Recent Transition Summaries Without Polluting Current Groups

系统 MUST 在 surface 层把“当前态账本”和“最近变化摘要”区分开来，而不是混成一组 block。

#### Scenario: comparison summary renders above current groups

- **WHEN** 当前 ledger 存在 recent transition summary
- **THEN** 系统 SHALL 在当前 groups 之外渲染 comparison summary 区
- **AND** 当前 groups SHALL 继续只表达当前态 block

#### Scenario: recent transition summary may outlive current explicit blocks

- **WHEN** 当前 groups 中已经没有显式 memory / file / helper block
- **AND** comparison summary 仍然存在
- **THEN** ledger surface MAY 继续显示 comparison summary
- **AND** 用户 SHALL 仍能看到最近一次 send / compaction 的结果解释

#### Scenario: retained blocks remain distinguishable after one-turn carry over

- **WHEN** 用户在上一轮对显式 block 执行 `keep for next send`
- **AND** 该 block 被带入当前发送准备态
- **THEN** ledger surface SHALL 把该 block 表达为“由上一轮保留带入”或等价语义
- **AND** SHALL NOT 在当前准备态中把该 block 伪装成普通 selected
